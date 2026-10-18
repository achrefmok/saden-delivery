// §10 + mission « bordereaux » — one `manifests` table, seven types sharing numbering, history, scan, PDF:
//   transfer   Inter-agences   brouillon(0) → validé(1) → en transit(2) → arrivé(3) → clôturé(4)
//   dispatch   Expédition      brouillon(0) → validé(1) → remis au livreur(4)            (exit from stock)
//   return     Retour          brouillon(0) → confirmé(4)                                 (entry into stock)
//   exchange   Échange         brouillon(0) → remis au livreur(1) → clôturé(4)
//   call       Émission d'appel en cours(0) → clôturé(4)                                  (never changes a status)
//   inventory  Inventaire      en cours(0) → clôturé(4)                                   (gaps corrected one by one)
//   settlement Solde           brouillon(0) → validé(4)                                   (one cash entry, linked)
//   pickup     Enlèvement      demande(0) → à enlever(1) → enlevé(2) → reçu à l'agence(4)  (shop request, entry into stock)
//   restitution Retour expéditeur brouillon(0) → à remettre(1) → reçu par l'expéditeur(4)  (signed discharge, exit from stock)
//   any type   annulé(5) — drafts are deleted, validated / closed documents are cancelled (reason, user, date).
// Every mutation runs in one transaction (stock, statuses, cash and audit commit together) and locks the
// bordereau row, so two incompatible validations cannot run concurrently.
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail, shopOf } from '../auth.js';
import { str, num, int, Sql, defaultAgency, TZ } from '../domain.js';
import { changeStatus, ACTIVE, DRIVER_EXCEPTIONS, FINAL } from '../status.js';
import { STAFF, scopeWhere, scopeAgency } from '../scope.js';
import { audit } from '../audit.js';
import { scanActions, refFromCode } from './scan.js';
import { autoAssign } from '../assign.js';
import { stockIn, stockOut, addAnomaly } from '../stock.js';
import { assertCashOpen } from '../cash.js';
import { RETURN_REASONS, checkReason, reasonLabel, withDriver, bringBack, dispatchProblem, handOver, createPickup, receivePickup, receiveDeposit } from '../flows.js';

export const TYPES = {
  transfer: { prefix: 'BRD', label: 'Inter-agences', physical: true },
  dispatch: { prefix: 'EXP', label: 'Expédition', physical: true },
  return: { prefix: 'RET', label: 'Retour', physical: true },
  exchange: { prefix: 'ECH', label: 'Échange', physical: true },
  call: { prefix: 'APL', label: 'Émission d’appel' },
  inventory: { prefix: 'INV', label: 'Inventaire' },
  settlement: { prefix: 'SLD', label: 'Solde' },
  pickup: { prefix: 'ENV', label: 'Enlèvement', physical: true },
  restitution: { prefix: 'RST', label: 'Retour expéditeur', physical: true },
};
export const TRANSFER_KINDS = { normal: 'Standard', pickup: 'Pickup', retour: 'Retour', echange: 'Échange', adresse_erronee: 'Adresse erronée' };
/** Was the parcel ever inside an agency? (no → still at the shop: can be collected by a pickup) */
const everInAgency = id => one(`SELECT 1 FROM order_events WHERE order_id = $1 AND status IN ('en_agence','arrive','retour_agence') LIMIT 1`, [id]);
export const STAGES = ['brouillon', 'validé', 'en transit', 'arrivé', 'clôturé', 'annulé'];
const PHYSICAL = Object.keys(TYPES).filter(k => TYPES[k].physical);
const ELIGIBLE = ['attente', 'en_agence'];   // inter-agences (unchanged rule)
export const CALL_RESULTS = {
  confirme: 'Client confirmé', injoignable: 'Client injoignable', sans_reponse: 'Sans réponse',
  reporte: 'Livraison reportée', adresse: 'Adresse à confirmer', annulation: 'Annulation demandée',
};

const agencyOf = m => m.origin_agency_id;
const isOrigin = (user, m) => user.role === 'admin' || (user.role === 'manager' && user.agency_id === m.origin_agency_id);
const isDest = (user, m) => user.role === 'admin' || (user.role === 'manager' && user.agency_id === m.dest_agency_id);
const mustType = (m, ...types) => { if (!types.includes(m.type)) fail(409, `Action impossible pour un bordereau « ${TYPES[m.type].label} ».`); };
const mustBe = (m, stages, msg) => {
  if (m.stage === 5) fail(409, `Bordereau ${m.ref} annulé.`);
  if (!stages.includes(m.stage)) fail(409, msg || `Action impossible : bordereau « ${STAGES[m.stage]} ».`);
};
const round3 = v => Math.round(Number(v || 0) * 1000) / 1000;

async function loadManifest(user, id, lock = false) {
  const s = new Sql([int(id)]);
  const m = await one(`SELECT m.* FROM manifests m WHERE m.id = $1 AND ${scopeWhere(user, 'manifests', s)}${lock ? ' FOR UPDATE' : ''}`, s.v);
  if (!m) fail(404, 'Bordereau introuvable.');
  return m;
}
const orderByRef = async (user, ref) => {
  const s = new Sql([refFromCode(ref)]);
  const o = await one(`SELECT o.* FROM orders o WHERE upper(o.ref) = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!o) fail(404, `Colis ${refFromCode(ref)} introuvable dans votre périmètre.`);
  return o;
};
const orderById = async (user, id) => {
  const s = new Sql([int(id)]);
  const o = await one(`SELECT o.* FROM orders o WHERE o.id = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!o) fail(404, `Colis #${id} introuvable.`);
  return o;
};
const reloadOrder = id => one(`SELECT * FROM orders WHERE id = $1`, [id]);

/** Driver usable by a bordereau of agency `agencyId` (active, same agency). */
async function agencyDriver(driverId, agencyId) {
  const d = await one(`SELECT id, name, agency_id, active, status FROM users WHERE id = $1 AND role = 'driver'`, [int(driverId)]);
  if (!d || !d.active) fail(400, 'Livreur invalide ou désactivé.');
  if (d.agency_id !== agencyId) fail(400, `${d.name} ne dépend pas de cette agence.`);
  return d;
}

/** Physical bordereau still open that already holds this parcel (one parcel = one active movement document). */
const activeElsewhere = (orderId, mId, types = PHYSICAL) => one(
  `SELECT m.ref FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id
   WHERE i.order_id = $1 AND m.id <> $2 AND m.stage < 4 AND m.type = ANY($3::text[])`, [orderId, mId, types]);

/* ---------------------------------------------------------------- composition */

async function addLine(ctx, m, order, body = {}) {
  const { user } = ctx;
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau peut le composer.');
  mustBe(m, [0], 'Le bordereau n’est plus modifiable (brouillon uniquement).');
  const ag = agencyOf(m);
  const exists = await one(`SELECT 1 FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  if (exists) return { already: true };
  const cols = { role: 'item', reason: null, comment: null, phone: null };
  switch (m.type) {
    case 'transfer': {
      if (order.origin_agency_id !== m.origin_agency_id) fail(409, `${order.ref} ne part pas de cette agence.`);
      const destCity = await one(`SELECT city_id FROM agencies WHERE id = $1`, [m.dest_agency_id]);
      if (order.dest_agency_id !== m.dest_agency_id && order.dest_city_id !== destCity.city_id) fail(409, `${order.ref} n’est pas destiné à cette agence.`);
      if (!ELIGIBLE.includes(order.status)) fail(409, `${order.ref} : statut « ${order.status} » incompatible.`);
      break;
    }
    case 'dispatch': {
      const p = dispatchProblem(order, ag);
      if (p) fail(409, `${order.ref} : ${p}.`);
      break;
    }
    case 'exchange': {
      const p = dispatchProblem(order, ag);
      if (p) fail(409, `${order.ref} : ${p}.`);
      cols.role = 'deliver';
      break;
    }
    case 'return': {
      if (!m.driver_id) fail(409, 'Choisissez d’abord le livreur.');
      if (order.driver_id !== m.driver_id) fail(409, `${order.ref} n’est pas chez ce livreur.`);
      if (!withDriver(order)) fail(409, `${order.ref} n’est pas chez un livreur (statut « ${order.status} »).`);
      checkReason(body.reason, body.comment);
      cols.reason = body.reason; cols.comment = str(body.comment, 300) || null;
      const other = await activeElsewhere(order.id, m.id, ['return', 'transfer']);
      if (other) fail(409, `${order.ref} est déjà sur le bordereau actif ${other.ref}.`);
      break;
    }
    case 'call':
      cols.phone = str(body.phone, 30) || order.client_phone;
      cols.reason = str(body.reason, 120) || null;
      break;
    case 'pickup': {
      if (order.origin_agency_id !== ag) fail(409, `${order.ref} ne dépend pas de cette agence.`);
      if (m.shop_id && order.shop_id !== m.shop_id) fail(409, `${order.ref} n’appartient pas à cette boutique.`);
      if (order.kind !== 'delivery' || order.in_stock || !['attente', 'affecte'].includes(order.status) || await everInAgency(order.id))
        fail(409, `${order.ref} n’est pas à enlever chez l’expéditeur (statut « ${order.status} »).`);
      break;
    }
    case 'restitution': {
      if (order.shop_id !== m.shop_id) fail(409, `${order.ref} n’appartient pas à cette boutique.`);
      if (!order.in_stock || order.current_agency_id !== ag) fail(409, `${order.ref} n’est pas en stock dans cette agence.`);
      if (!['retour', 'retour_agence', 'annule'].includes(order.status)) fail(409, `${order.ref} : statut « ${order.status} » — seuls les retours et les annulés se restituent.`);
      break;
    }
    default: fail(409, 'Les lignes de ce bordereau ne s’ajoutent pas à la main.');
  }
  if (['transfer', 'dispatch', 'exchange', 'pickup', 'restitution'].includes(m.type)) {
    const other = await activeElsewhere(order.id, m.id);
    if (other) fail(409, `${order.ref} est déjà sur le bordereau actif ${other.ref}.`);
  }
  await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by, role, reason, comment, phone) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [m.id, order.id, user.id, cols.role, cols.reason, cols.comment, cols.phone]);
  if (m.type === 'transfer') await q(`UPDATE orders SET manifest_id = $1, updated_at = now() WHERE id = $2`, [m.id, order.id]);
  await audit(ctx, 'manifest.add', 'manifest', m.id, null, { order: order.ref, ...(cols.reason ? { reason: cols.reason } : {}) });
  const warning = ['dispatch', 'exchange'].includes(m.type) && order.driver_id && m.driver_id && order.driver_id !== m.driver_id
    ? `${order.ref} était affecté à un autre livreur : il sera réaffecté à la remise.` : null;
  return { added: order.ref, warning };
}

async function removeLine(ctx, m, orderId) {
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence du bordereau peut le composer.');
  mustBe(m, [0], 'Le bordereau n’est plus modifiable (brouillon uniquement).');
  const r = await one(`DELETE FROM manifest_items WHERE manifest_id = $1 AND order_id = $2 RETURNING order_id, role`, [m.id, int(orderId)]);
  if (!r) fail(404, 'Colis absent du bordereau.');
  const o = await reloadOrder(r.order_id);
  if (m.type === 'transfer') await q(`UPDATE orders SET manifest_id = NULL, updated_at = now() WHERE id = $1 AND manifest_id = $2`, [o.id, m.id]);
  if (r.role === 'pickup') await cancelPickup(ctx.user, o, `Retiré du bordereau ${m.ref}`);
  await audit(ctx, 'manifest.remove', 'manifest', m.id, { order: o.ref }, null);
}

/** Pickup order of an exchange that will not be collected any more: cancelled (never deleted). */
async function cancelPickup(user, o, note) {
  if (o.kind === 'pickup' && !FINAL.includes(o.status) && !o.in_stock) await changeStatus(o, 'annule', { user, note });
}

/* ---------------------------------------------------------------- settlement (solde) */

/** Delivered orders of the period not yet in a validated settlement of the same party; totals from orders + cash_tx. */
async function computeSettlement(m) {
  const driver = !!m.driver_id, partyId = m.driver_id || m.shop_id;
  const rows = await q(
    `SELECT o.id, o.ref, o.client_name, o.payment_mode, o.cod::float8 AS cod, o.delivery_fee::float8 AS delivery_fee,
            o.driver_share::float8 AS driver_share, o.saden_revenue::float8 AS saden_revenue, o.amount_to_remit::float8 AS amount_to_remit, e.at AS delivered_at
     FROM orders o JOIN LATERAL (SELECT max(created_at) AS at FROM order_events WHERE order_id = o.id AND status = 'livre') e ON e.at IS NOT NULL
     JOIN manifests mm ON mm.id = $2
     WHERE o.status = 'livre' AND ${driver ? 'o.driver_id' : 'o.shop_id'} = $1
       AND (e.at AT TIME ZONE '${TZ}')::date BETWEEN mm.period_from AND mm.period_to
       AND NOT EXISTS (SELECT 1 FROM manifest_items i JOIN manifests s ON s.id = i.manifest_id
                       WHERE i.order_id = o.id AND s.type = 'settlement' AND s.stage = 4 AND s.id <> $2 AND (s.driver_id IS NOT NULL) = $3)
     ORDER BY e.at, o.id`, [partyId, m.id, driver]);
  const sum = k => round3(rows.reduce((a, r) => a + (k === 'collected' ? (r.payment_mode === 'prepaid' ? 0 : r.cod) : r[k]), 0));
  const before = await one(
    `SELECT coalesce(sum(amount), 0)::float8 AS v FROM cash_tx WHERE ${driver ? `driver_id = $1 AND type = 'Encaissement'` : `shop_id = $1 AND type = 'Règlement'`}
       AND manifest_id IS NULL AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN (SELECT period_from FROM manifests WHERE id = $2) AND (SELECT period_to FROM manifests WHERE id = $2)`, [partyId, m.id]);
  const t = { party: driver ? 'driver' : 'shop', orders: rows.length, collected: sum('collected'), fees: sum('delivery_fee') };
  if (driver) Object.assign(t, { commissions: sum('driver_share'), remitted_before: round3(before.v) });
  else {
    // retenue à la source (rate set per shop by the agency, 0 by default) applied on the delivery fees
    const rate = Number((await one(`SELECT rs_rate FROM users WHERE id = $1`, [partyId]))?.rs_rate || 0);
    Object.assign(t, { commissions: sum('saden_revenue'), due: sum('amount_to_remit'), remitted_before: round3(-before.v),
      returned: (await one(`SELECT count(*)::int AS n FROM orders o JOIN manifests mm ON mm.id = $2 WHERE o.shop_id = $1 AND o.status = 'restitue'
                            AND (o.updated_at AT TIME ZONE '${TZ}')::date BETWEEN mm.period_from AND mm.period_to`, [partyId, m.id])).n,
      rs_rate: rate });
    // honoraires = everything Saden keeps on the period (delivery fees + COD commission) = cash collected − due to the shop
    t.honoraires = round3(t.collected - t.due);
    t.rs = round3(t.honoraires * rate / 100);
  }
  t.balance = round3((driver ? t.collected : t.due - t.rs) - t.remitted_before);
  return { rows, totals: t, amountOf: r => driver ? (r.payment_mode === 'prepaid' ? 0 : r.cod) : r.amount_to_remit };
}

async function refreshSettlement(m) {
  const { rows, totals, amountOf } = await computeSettlement(m);
  await q(`DELETE FROM manifest_items WHERE manifest_id = $1`, [m.id]);
  for (const r of rows)
    await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by, amount) VALUES ($1,$2,$3,$4)`, [m.id, r.id, m.created_by, amountOf(r)]);
  await q(`UPDATE manifests SET totals = $2 WHERE id = $1`, [m.id, JSON.stringify(totals)]);
  return totals;
}

/* ---------------------------------------------------------------- transfer reception */

/** Destination agency confirms one parcel: only now is it physically present (stock entry). */
async function receiveItem(ctx, m, order, { condition, note } = {}) {
  const { user } = ctx;
  if (!isDest(user, m)) fail(403, 'Seule l’agence de destination réceptionne.');
  mustBe(m, [2, 3], 'Le bordereau n’est pas en transit.');
  const item = await one(`SELECT received_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  if (!item) {
    // extra parcel (not on the document): anomaly, no implicit entry
    await addAnomaly({ agencyId: m.dest_agency_id, orderId: order.id, code: order.ref, kind: 'supplementaire', source: 'transfer', manifestId: m.id, user, note: `Hors bordereau ${m.ref}` });
    await audit(ctx, 'manifest.extra', 'manifest', m.id, null, { order: order.ref });
    return { message: `${order.ref} ne figure pas sur ce bordereau : colis supplémentaire signalé.`, anomaly: 'supplementaire', extra: true, status: order.status };
  }
  if (item.received_at) return { message: 'Déjà réceptionné', status: order.status, already: true };
  if (m.stage === 2) { await q(`UPDATE manifests SET stage = 3, arrived_at = now() WHERE id = $1`, [m.id]); m.stage = 3; }
  await q(`UPDATE manifest_items SET received_at = now(), received_by = $3, scanned_at = coalesce(scanned_at, now()) WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id, user.id]);
  const stock = { reason: 'transfer_in', manifest_id: m.id };
  if (order.status === 'transit') await changeStatus(order, 'arrive', { user, agencyId: m.dest_agency_id, stock });
  else await stockIn(order.id, m.dest_agency_id, { reason: 'transfer_in', manifestId: m.id, user });
  if (condition === 'damaged') {
    const o = await reloadOrder(order.id);
    const why = str(note, 300) || 'Endommagé à la réception du transfert';
    if (o.status !== 'endommage') await changeStatus(o, 'endommage', { user, note: why });
    await q(`UPDATE manifest_items SET anomaly = 'endommage', comment = $3 WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id, why]);
    await addAnomaly({ agencyId: m.dest_agency_id, orderId: order.id, kind: 'endommage', source: 'transfer', manifestId: m.id, user, note: why });
  } else if (order.status === 'transit') await autoAssign(order.id).catch(e => console.error('auto-assign', e));
  await audit(ctx, 'manifest.receive', 'manifest', m.id, null, { order: order.ref, ...(condition === 'damaged' ? { damaged: true } : {}) });
  return { message: 'Réceptionné (' + m.ref + ')' + (condition === 'damaged' ? ' — endommagé' : ''), status: condition === 'damaged' ? 'endommage' : 'arrive' };
}

/** « Entrée en stock » of a parcel travelling on a transfer bordereau to `agencyId`. */
export async function receiveTransferParcel(ctx, order, agencyId, opts = {}) {
  const m = await one(`SELECT m.* FROM manifests m JOIN manifest_items i ON i.manifest_id = m.id
                       WHERE i.order_id = $1 AND m.type = 'transfer' AND m.stage IN (2, 3) AND m.dest_agency_id = $2 FOR UPDATE OF m`, [order.id, agencyId]);
  if (!m) return null;
  return { ...(await receiveItem(ctx, m, order, opts)), manifest: { id: m.id, ref: m.ref } };
}

/** attente / partielle / complète / anomalie */
function receptionState(m, n, received, anomalies) {
  if (m.type !== 'transfer' || m.stage < 2) return null;
  if (anomalies > 0 || (m.stage === 4 && received < n)) return 'anomalie';
  if (!received) return 'attente';
  return received < n ? 'partielle' : 'complete';
}

/* ---------------------------------------------------------------- inventory */

async function inventoryScan(ctx, m, code) {
  const { user } = ctx;
  if (!isOrigin(user, m)) fail(403, 'Inventaire d’une autre agence.');
  mustBe(m, [0], 'Session d’inventaire clôturée.');
  const ref = refFromCode(code);
  if (!ref) fail(400, 'Code illisible.');
  const s = new Sql([ref]);
  const o = await one(`SELECT o.* FROM orders o WHERE upper(o.ref) = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!o) {
    await addAnomaly({ agencyId: agencyOf(m), code: ref, kind: 'inconnu', source: 'inventory', manifestId: m.id, user, note: 'Code scanné inconnu ou hors périmètre' });
    return { message: `${ref} : code inconnu (anomalie enregistrée)`, anomaly: 'inconnu' };
  }
  const it = await one(`SELECT expected, scanned_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
  if (it?.scanned_at) return { message: `${o.ref} déjà compté`, already: true, order: { id: o.id, ref: o.ref } };
  if (it) {
    await q(`UPDATE manifest_items SET scanned_at = now() WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
    return { message: `${o.ref} compté`, expected: true, order: { id: o.id, ref: o.ref } };
  }
  await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by, expected, scanned_at, anomaly) VALUES ($1,$2,$3,FALSE,now(),'supplementaire')`, [m.id, o.id, user.id]);
  return { message: `${o.ref} : non attendu dans le stock (supplémentaire)`, expected: false, anomaly: 'supplementaire', order: { id: o.id, ref: o.ref } };
}

/* ---------------------------------------------------------------- read */

const TYPE_FILTER = t => (TYPES[t] ? t : null);

route('GET', '/manifests', STAFF, async ({ user, query }) => {
  const s = new Sql(), where = [scopeWhere(user, 'manifests', s, { agency: query.agency_id })];
  const type = TYPE_FILTER(query.type);
  if (type) where.push(`m.type = ${s.p(type)}`);
  if (query.stage !== undefined && query.stage !== '') where.push(`m.stage = ${s.p(int(query.stage))}`);
  if (query.q) where.push(`m.ref ILIKE ${s.p('%' + str(query.q, 40) + '%')}`);
  if (query.direction === 'in' && query.agency_id) where.push(`m.dest_agency_id = ${s.p(int(query.agency_id))}`);
  if (query.direction === 'out' && query.agency_id) where.push(`m.origin_agency_id = ${s.p(int(query.agency_id))}`);
  if (query.direction === 'in' && user.role === 'manager') where.push(`m.dest_agency_id = ${s.p(user.agency_id)}`);
  if (query.direction === 'out' && user.role === 'manager') where.push(`m.origin_agency_id = ${s.p(user.agency_id)}`);
  const rows = await q(
    `SELECT m.id, m.ref, m.type, m.stage, m.created_at, m.validated_at, m.shipped_at, m.arrived_at, m.closed_at, m.cancelled_at, m.cancel_reason,
            m.origin_agency_id, m.dest_agency_id, m.driver_id, m.shop_id, to_char(m.period_from, 'YYYY-MM-DD') AS period_from, to_char(m.period_to, 'YYYY-MM-DD') AS period_to, m.result, m.totals, m.carrier, m.from_city, m.to_city, m.vehicle_plate, m.transfer_kind, to_char(m.pickup_date, 'YYYY-MM-DD') AS pickup_date, m.requested_by,
            oa.name AS origin_agency_name, da.name AS dest_agency_name, d.name AS driver_name, sh.shop_name, cu.name AS created_by_name,
            (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id AND i.expected)::int AS n,
            (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id AND i.received_at IS NOT NULL)::int AS received,
            (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id AND i.scanned_at IS NOT NULL)::int AS scanned,
            (SELECT count(*) FROM stock_anomalies a WHERE a.manifest_id = m.id)::int AS anomalies
     FROM manifests m LEFT JOIN agencies oa ON oa.id = m.origin_agency_id LEFT JOIN agencies da ON da.id = m.dest_agency_id
     LEFT JOIN users d ON d.id = m.driver_id LEFT JOIN users sh ON sh.id = m.shop_id LEFT JOIN users cu ON cu.id = m.created_by
     WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC, m.id DESC LIMIT 200`, s.v);
  return { manifests: rows.map(m => ({ ...m, reception_state: receptionState(m, m.n, m.received, m.anomalies) })) };
});

/** Lookup by scanned document barcode (Code 128 = ref) → id, after permission check. */
route('GET', '/manifests/lookup/:code', STAFF, async ({ user, params }) => {
  const s = new Sql([String(params.code || '').trim().toUpperCase().slice(0, 40)]);
  const m = await one(`SELECT m.id, m.ref, m.type FROM manifests m WHERE upper(m.ref) = $1 AND ${scopeWhere(user, 'manifests', s)}`, s.v);
  if (!m) fail(404, 'Bordereau introuvable dans votre périmètre.');
  return m;
});

/** Driver selector: agency drivers, search, availability, parcels in progress / in hand, recent bordereaux. */
route('GET', '/manifests/drivers', STAFF, async ({ user, query }) => {
  const agencyId = scopeAgency(user, query.agency_id) || (await defaultAgency())?.id;
  const s = new Sql([agencyId, ACTIVE, [...ACTIVE, ...DRIVER_EXCEPTIONS, 'retour']]);
  const term = str(query.q, 60);
  const cond = term ? `AND (u.name ILIKE ${s.p('%' + term + '%')} OR u.id::text = ${s.p(term)} OR coalesce(u.phone, '') LIKE ${s.p('%' + term.replace(/\D/g, '') + '%')})` : '';
  const drivers = await q(
    `SELECT u.id, u.name, u.phone, u.status, u.vehicle, u.active, z.name AS zone_name,
            (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = ANY($2::text[]))::int AS active_count,
            (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND NOT o.in_stock AND o.status = ANY($3::text[]))::int AS in_hand
     FROM users u LEFT JOIN zones z ON z.id = u.zone_id
     WHERE u.role = 'driver' AND u.agency_id = $1 ${cond}
     ORDER BY u.active DESC, (u.status = 'dispo') DESC, u.name`, s.v);
  const ids = drivers.map(d => d.id);
  const recent = ids.length ? await q(
    `SELECT driver_id, id, ref, type, stage, created_at FROM (
       SELECT m.*, row_number() OVER (PARTITION BY m.driver_id ORDER BY m.created_at DESC) AS rn
       FROM manifests m WHERE m.driver_id = ANY($1::int[]) AND m.type IN ('dispatch','exchange','return','transfer')) x
     WHERE rn <= 5 ORDER BY created_at DESC`, [ids]) : [];
  return {
    agency_id: agencyId,
    drivers: drivers.map(d => ({ ...d, available: d.active && ['dispo', 'livraison'].includes(d.status), history: recent.filter(r => r.driver_id === d.id) })),
  };
});

route('GET', '/manifests/:id', STAFF, async ({ user, params }) => {
  const m0 = await loadManifest(user, params.id);
  const [m, items, history, anomalies] = await Promise.all([
    one(`SELECT m.*, NULL AS signed_doc, (m.signed_doc IS NOT NULL) AS has_signed_doc, to_char(m.pickup_date, 'YYYY-MM-DD') AS pickup_date, to_char(m.period_from, 'YYYY-MM-DD') AS period_from, to_char(m.period_to, 'YYYY-MM-DD') AS period_to, oa.name AS origin_agency_name, oa.address AS origin_agency_address, oa.phone AS origin_agency_phone,
                da.name AS dest_agency_name, d.name AS driver_name, d.phone AS driver_phone, sh.shop_name, sh.phone AS shop_phone,
                cu.name AS created_by_name, vu.name AS validated_by_name, xu.name AS closed_by_name, cx.name AS cancelled_by_name
         FROM manifests m LEFT JOIN agencies oa ON oa.id = m.origin_agency_id LEFT JOIN agencies da ON da.id = m.dest_agency_id
         LEFT JOIN users d ON d.id = m.driver_id LEFT JOIN users sh ON sh.id = m.shop_id LEFT JOIN users cu ON cu.id = m.created_by
         LEFT JOIN users vu ON vu.id = m.validated_by LEFT JOIN users xu ON xu.id = m.closed_by LEFT JOIN users cx ON cx.id = m.cancelled_by
         WHERE m.id = $1`, [m0.id]),
    q(`SELECT o.id, o.ref, o.client_name, o.client_phone, o.address, o.status, o.kind, o.in_stock, o.current_agency_id, o.driver_id, o.payment_mode,
              o.cod::float8 AS cod, o.delivery_fee::float8 AS delivery_fee, o.driver_share::float8 AS driver_share, o.amount_to_remit::float8 AS amount_to_remit,
              o.pieces, o.weight::float8 AS weight, o.related_order_id, ro.ref AS related_ref, s.shop_name, dr.name AS order_driver_name,
              dc.name AS dest_city_name, coalesce(z.name, o.zone) AS zone_name,
              i.added_at, i.loaded_at, i.received_at, i.role, i.reason, i.comment, i.phone, i.call_result, i.called_at, cb.name AS called_by_name,
              i.expected, i.scanned_at, i.anomaly, i.result, i.amount::float8 AS amount, i.confirmed_at
       FROM manifest_items i JOIN orders o ON o.id = i.order_id LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN zones z ON z.id = o.zone_id
       LEFT JOIN users s ON s.id = o.shop_id LEFT JOIN users dr ON dr.id = o.driver_id LEFT JOIN users cb ON cb.id = i.called_by
       LEFT JOIN orders ro ON ro.id = o.related_order_id
       WHERE i.manifest_id = $1 ORDER BY i.role DESC, o.ref`, [m0.id]),
    q(`SELECT a.action, a.before, a.after, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity = 'manifest' AND a.entity_id = $1 ORDER BY a.created_at, a.id`, [String(m0.id)]),
    q(`SELECT a.id, a.kind, a.code, a.status, a.note, a.resolution, a.corrected, a.created_at, a.resolved_at, o.ref AS order_ref, a.order_id
       FROM stock_anomalies a LEFT JOIN orders o ON o.id = a.order_id WHERE a.manifest_id = $1 ORDER BY a.id`, [m0.id]),
  ]);
  const expected = items.filter(i => i.expected);
  const received = items.filter(i => i.received_at).length;
  const cancelRole = m.stage === 4 ? user.role === 'admin' : isOrigin(user, m);
  return {
    manifest: {
      ...m, type_label: TYPES[m.type].label,
      can_compose: m.stage === 0 && isOrigin(user, m), can_ship: isOrigin(user, m), can_receive: isDest(user, m),
      can_delete: m.stage === 0 && isOrigin(user, m), can_cancel: m.stage >= 1 && m.stage <= 4 && cancelRole,
      reception_state: receptionState(m, expected.length, received, anomalies.length),
    },
    items, history, anomalies,
  };
});

/* ---------------------------------------------------------------- create / edit / delete */

async function insertManifest({ type, origin, dest, driverId, shopId, from, to, user, body }) {
  const pfx = TYPES[type].prefix, c3 = s => `upper(left(${s}::text, 3))`;
  const kind = type === 'transfer' ? (TRANSFER_KINDS[body.transfer_kind] ? body.transfer_kind : 'normal') : null;
  const pdate = /^\d{4}-\d{2}-\d{2}$/.test(body.pickup_date || '') ? body.pickup_date : null;
  return one(
    `INSERT INTO manifests (ref, type, from_city, to_city, carrier, responsible, origin_agency_id, dest_agency_id, driver_id, shop_id, period_from, period_to, comment, created_by,
                            vehicle_plate, transfer_kind, pickup_date, pickup_address, requested_by)
     VALUES ($1::text || '-' || ${c3('$2')} || ${type === 'transfer' ? `'-' || ${c3('$3')} ||` : ''} '-' || lpad(nextval('manifest_ref_seq')::text, 4, '0'),
             $13, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [pfx, origin.city, dest?.city || origin.city, str(body.carrier, 80) || null, user.name, origin.id, dest?.id || null, driverId, shopId, from, to,
     str(body.comment, 500) || null, type, user.role === 'shop' ? null : user.id, str(body.vehicle_plate, 20) || null, kind, pdate,
     str(body.pickup_address, 300) || null, user.role === 'shop' ? user.id : null]);
}
/** Pickup: every parcel of the shop still waiting at the shop (not on another active bordereau). */
async function addShopParcels(ctx, m) {
  const rows = await q(`SELECT o.* FROM orders o WHERE o.shop_id = $1 AND o.origin_agency_id = $2 AND o.kind = 'delivery' AND NOT o.in_stock
                        AND o.status IN ('attente','affecte') ORDER BY o.id`, [m.shop_id, m.origin_agency_id]);
  const added = [];
  for (const o of rows) {
    if (await everInAgency(o.id) || await activeElsewhere(o.id, m.id)) continue;
    await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [m.id, o.id, ctx.user.role === 'shop' ? null : ctx.user.id]);
    added.push(o.ref);
  }
  return added;
}

route('POST', '/manifests', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const type = TYPE_FILTER(body.type || 'transfer');
  if (!type) fail(400, 'Type de bordereau invalide.');
  const agencyId = user.role === 'manager' ? user.agency_id : int(body.agency_id) || int(body.origin_agency_id) || (await defaultAgency())?.id;
  const origin = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1`, [agencyId]);
  if (!origin) fail(400, 'Agence invalide.');
  let dest = null, driverId = int(body.driver_id) || null, shopId = null, from = null, to = null;
  if (type === 'transfer') {
    dest = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1 AND ag.active`, [int(body.dest_agency_id)]);
    if (!dest) fail(400, 'Agence de destination invalide.');
    if (dest.id === origin.id) fail(400, 'Destination identique à l’agence de départ.');
    if (driverId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'driver' AND active`, [driverId]))) fail(400, 'Livreur / transporteur invalide.');
  } else if (driverId) await agencyDriver(driverId, origin.id);
  if (type === 'return' && !driverId) fail(400, 'Choisissez le livreur qui rapporte les colis.');
  if (type === 'pickup' || type === 'restitution') {
    shopId = int(body.shop_id) || null;
    if (type === 'restitution' && !shopId) fail(400, 'Choisissez la boutique (expéditeur).');
    if (shopId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop' AND agency_id = $2`, [shopId, origin.id]))) fail(400, 'Boutique hors de cette agence.');
  }
  if (type === 'inventory') {
    const open = await one(`SELECT ref FROM manifests WHERE type = 'inventory' AND stage = 0 AND origin_agency_id = $1`, [origin.id]);
    if (open) fail(409, `Une session d’inventaire est déjà ouverte (${open.ref}).`);
    driverId = null;
  }
  if (type === 'settlement') {
    shopId = int(body.shop_id) || null;
    if (!!driverId === !!shopId) fail(400, 'Choisissez un livreur ou une boutique.');
    if (shopId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop' AND agency_id = $2`, [shopId, origin.id]))) fail(400, 'Boutique hors de cette agence.');
    from = /^\d{4}-\d{2}-\d{2}$/.test(body.period_from || '') ? body.period_from : null;
    to = /^\d{4}-\d{2}-\d{2}$/.test(body.period_to || '') ? body.period_to : null;
    if (!from || !to || from > to) fail(400, 'Période invalide.');
  }
  const m = await insertManifest({ type, origin, dest, driverId, shopId, from, to, user, body });
  if (type === 'pickup' && body.all_parcels && shopId) await addShopParcels(ctx, m);
  if (type === 'inventory') {
    // theoretical stock frozen at the opening of the session
    await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by, expected)
             SELECT $1, o.id, $2, TRUE FROM orders o WHERE o.in_stock AND o.current_agency_id = $3`, [m.id, user.id, origin.id]);
  }
  if (type === 'settlement') m.totals = await refreshSettlement(m);
  await audit(ctx, 'manifest.create', 'manifest', m.id, null, { ref: m.ref, type, agency: origin.id, dest: dest?.id || null, driver_id: driverId, shop_id: shopId, period: from ? [from, to] : undefined });
  return { manifest: { id: m.id, ref: m.ref, type } };
}));

route('PATCH', '/manifests/:id', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence du bordereau le modifie.');
  mustBe(m, ['transfer', 'pickup'].includes(m.type) ? [0, 1] : [0], 'Seul un brouillon est modifiable.');
  const driverId = ctx.body.driver_id !== undefined ? int(ctx.body.driver_id) || null : m.driver_id;
  if (driverId !== m.driver_id) {
    if (m.type === 'transfer') { if (driverId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'driver' AND active`, [driverId]))) fail(400, 'Livreur invalide.'); }
    else {
      if (['inventory', 'settlement', 'call'].includes(m.type)) fail(409, 'Ce bordereau n’a pas de livreur modifiable.');
      if (driverId) await agencyDriver(driverId, agencyOf(m));
      if (m.type === 'return') {
        if (!driverId) fail(400, 'Le livreur est obligatoire.');
        const n = await one(`SELECT count(*)::int AS n FROM manifest_items WHERE manifest_id = $1`, [m.id]);
        if (n.n) fail(409, 'Retirez les colis du livreur précédent avant de changer de livreur.');
      }
    }
  }
  const carrier = ctx.body.carrier !== undefined ? str(ctx.body.carrier, 80) || null : m.carrier;
  const comment = ctx.body.comment !== undefined ? str(ctx.body.comment, 500) || null : m.comment;
  const plate = ctx.body.vehicle_plate !== undefined ? str(ctx.body.vehicle_plate, 20) || null : m.vehicle_plate;
  if (m.type === 'pickup' && m.stage === 1 && driverId !== m.driver_id) {
    // pickup already announced: the parcels follow the new driver
    if (!driverId) fail(400, 'Le livreur est obligatoire.');
    const d = await agencyDriver(driverId, agencyOf(m));
    for (const it of await q(`SELECT order_id FROM manifest_items WHERE manifest_id = $1 AND received_at IS NULL`, [m.id])) {
      const o = await reloadOrder(it.order_id);
      if (o.status === 'affecte' && o.driver_id !== d.id) await changeStatus(o, 'affecte', { user: ctx.user, driver: d });
    }
  }
  await q(`UPDATE manifests SET carrier = $2, driver_id = $3, comment = $4, vehicle_plate = $5 WHERE id = $1`, [m.id, carrier, driverId, comment, plate]);
  await audit(ctx, 'manifest.update', 'manifest', m.id, { carrier: m.carrier, driver_id: m.driver_id, comment: m.comment, vehicle_plate: m.vehicle_plate }, { carrier, driver_id: driverId, comment, vehicle_plate: plate });
  return { ok: true };
}));

/** Drafts (and open call / inventory sessions) are deleted — never a validated or closed document. */
route('DELETE', '/manifests/:id', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence du bordereau peut le supprimer.');
  mustBe(m, [0], 'Seul un brouillon peut être supprimé : annulez le bordereau.');
  const items = await q(`SELECT i.order_id, i.role FROM manifest_items i WHERE i.manifest_id = $1`, [m.id]);
  for (const it of items) if (it.role === 'pickup') await cancelPickup(ctx.user, await reloadOrder(it.order_id), `Bordereau ${m.ref} supprimé`);
  await q(`UPDATE orders SET manifest_id = NULL WHERE manifest_id = $1`, [m.id]);
  await q(`UPDATE stock_anomalies SET status = 'resolved', resolution = 'Brouillon supprimé', resolved_by = $2, resolved_at = now() WHERE manifest_id = $1 AND status = 'open'`, [m.id, ctx.user.id]);
  await q(`DELETE FROM manifest_items WHERE manifest_id = $1`, [m.id]);
  await q(`DELETE FROM manifests WHERE id = $1`, [m.id]);
  await audit(ctx, 'manifest.delete', 'manifest', m.id, { ref: m.ref, type: m.type, parcels: items.length }, null);
  return { ok: true };
}));

/* ---------------------------------------------------------------- lines */

route('POST', '/manifests/:id/items', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  const ids = (Array.isArray(ctx.body.order_ids) ? ctx.body.order_ids : []).map(int).filter(Boolean);
  const refs = Array.isArray(ctx.body.refs) ? ctx.body.refs : [];
  if (!ids.length && !refs.length) fail(400, 'Aucun colis sélectionné.');
  const added = [], errors = [], warnings = [];
  // each line is independent: a refused parcel must not cancel the others (savepoint-free: checks happen before writes)
  for (const x of [...ids.map(id => ['id', id]), ...refs.map(r => ['ref', r])]) {
    try {
      const o = x[0] === 'id' ? await orderById(ctx.user, x[1]) : await orderByRef(ctx.user, x[1]);
      const r = await addLine(ctx, m, o, ctx.body);
      if (r.added) added.push(r.added);
      if (r.warning) warnings.push(r.warning);
    } catch (e) { if (e.status) errors.push(e.message); else throw e; }
  }
  return { added, errors, warnings };
}));

route('DELETE', '/manifests/:id/items/:orderId', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  await removeLine(ctx, m, ctx.params.orderId);
  return { ok: true };
}));

/** Line details: return motive, call result, exchange pickup outcome. */
route('PATCH', '/manifests/:id/items/:orderId', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau le modifie.');
  const it = await one(`SELECT * FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, int(ctx.params.orderId)]);
  if (!it) fail(404, 'Colis absent du bordereau.');
  if (m.type === 'return') {
    mustBe(m, [0]);
    checkReason(body.reason, body.comment);
    await q(`UPDATE manifest_items SET reason = $3, comment = $4 WHERE manifest_id = $1 AND order_id = $2`, [m.id, it.order_id, body.reason, str(body.comment, 300) || null]);
  } else if (m.type === 'call') {
    mustBe(m, [0]);
    const result = body.call_result ? str(body.call_result, 30) : it.call_result;
    if (result && !CALL_RESULTS[result]) fail(400, 'Résultat d’appel invalide.');
    await q(`UPDATE manifest_items SET phone = coalesce($3, phone), reason = coalesce($4, reason), call_result = $5, comment = coalesce($6, comment),
               called_at = CASE WHEN $5::text IS NOT NULL THEN now() ELSE called_at END, called_by = CASE WHEN $5::text IS NOT NULL THEN $7::int ELSE called_by END
             WHERE manifest_id = $1 AND order_id = $2`,
      [m.id, it.order_id, str(body.phone, 30) || null, str(body.reason, 120) || null, result || null, body.comment !== undefined ? str(body.comment, 300) : null, user.id]);
    await audit(ctx, 'manifest.call', 'manifest', m.id, null, { order_id: it.order_id, result, phone: body.phone || it.phone });
  } else if (m.type === 'exchange') {
    mustBe(m, [1], 'Le résultat se saisit après la remise au livreur.');
    if (!['ok', 'failed'].includes(body.result)) fail(400, 'Résultat invalide.');
    await q(`UPDATE manifest_items SET result = $3, comment = coalesce($4, comment) WHERE manifest_id = $1 AND order_id = $2`, [m.id, it.order_id, body.result, str(body.comment, 300) || null]);
  } else fail(409, 'Rien à modifier sur cette ligne.');
  return { ok: true };
}));

/** Exchange: adds the item to collect from the client (a linked « pickup » order is created). */
route('POST', '/manifests/:id/pickup', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  mustType(m, 'exchange');
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau le compose.');
  mustBe(m, [0], 'Le bordereau n’est plus en brouillon.');
  const base = body.order_id ? await orderById(user, body.order_id) : await orderByRef(user, body.ref);
  const p = await createPickup(user, base, { description: str(body.description, 300), agencyId: agencyOf(m) });
  await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by, role, comment) VALUES ($1,$2,$3,'pickup',$4)`, [m.id, p.id, user.id, str(body.description, 300) || null]);
  await audit(ctx, 'manifest.pickup', 'manifest', m.id, null, { order: p.ref, for: base.ref });
  return { pickup: { id: p.id, ref: p.ref } };
}));

/* ---------------------------------------------------------------- lifecycle */

route('POST', '/manifests/:id/validate', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau le valide.');
  mustBe(m, [0]);
  const items = await q(`SELECT i.*, o.ref FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1`, [m.id]);
  if (m.type === 'settlement') {
    const totals = await refreshSettlement(m);
    if (!totals.orders && !totals.balance) fail(409, 'Aucune commande ni montant sur la période.');
    const amount = body.amount === undefined || body.amount === null || body.amount === '' ? totals.balance : num(body.amount);
    if (amount == null || amount < 0) fail(400, 'Montant invalide.');
    if (round3(amount) !== totals.balance && !str(body.comment, 300)) fail(400, 'Expliquez l’écart entre le montant versé et le solde calculé.');
    let cashId = null;
    if (amount > 0) {
      await assertCashOpen(agencyOf(m));
      const party = await one(`SELECT coalesce(u.shop_name, u.name) AS name, to_char(m.period_from, 'DD/MM/YYYY') AS f, to_char(m.period_to, 'DD/MM/YYYY') AS t
                               FROM users u JOIN manifests m ON m.id = $2 WHERE u.id = $1`, [m.driver_id || m.shop_id, m.id]);
      const label = `Solde ${m.ref} — ${party.name} (${party.f} → ${party.t})`;
      const c = await one(`INSERT INTO cash_tx (label, type, amount, created_by, agency_id, driver_id, shop_id, manifest_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [label.slice(0, 120), m.driver_id ? 'Encaissement' : 'Règlement', m.driver_id ? round3(amount) : -round3(amount), user.id, agencyOf(m), m.driver_id, m.shop_id, m.id]);
      cashId = c.id;
      await audit(ctx, 'cash.create', 'cash', c.id, null, { type: m.driver_id ? 'Encaissement' : 'Règlement', amount: round3(amount), manifest: m.ref });
    }
    const final = { ...totals, paid: round3(amount), gap: round3(amount - totals.balance) };
    await q(`UPDATE manifests SET stage = 4, validated_at = now(), validated_by = $2, closed_at = now(), closed_by = $2, cash_tx_id = $3, totals = $4, comment = coalesce($5, comment) WHERE id = $1`,
      [m.id, user.id, cashId, JSON.stringify(final), str(body.comment, 300) || null]);
    await audit(ctx, 'manifest.validate', 'manifest', m.id, { stage: 0 }, { stage: 4, ...final, cash_tx_id: cashId });
    return { stage: 4, totals: final, cash_tx_id: cashId };
  }
  if (!items.length) fail(409, 'Ajoutez au moins un colis avant de valider.');
  if (m.type === 'transfer') {
    await q(`UPDATE manifests SET stage = 1, validated_at = now(), validated_by = $2 WHERE id = $1`, [m.id, user.id]);
    await audit(ctx, 'manifest.validate', 'manifest', m.id, { stage: 0 }, { stage: 1, parcels: items.length });
    return { stage: 1 };
  }
  if (m.type === 'dispatch' || m.type === 'exchange') {
    if (!m.driver_id) fail(409, 'Choisissez le livreur avant de valider.');
    const driver = await agencyDriver(m.driver_id, agencyOf(m));
    const problems = [];
    for (const it of items.filter(i => i.role !== 'pickup')) {
      const p = dispatchProblem(await reloadOrder(it.order_id), agencyOf(m));
      if (p) problems.push(`${it.ref} : ${p}`);
    }
    if (problems.length) fail(409, 'Colis incompatibles : ' + problems.join(' ; '), { problems });
    if (m.type === 'dispatch') {
      await q(`UPDATE manifests SET stage = 1, validated_at = now(), validated_by = $2 WHERE id = $1`, [m.id, user.id]);
      await audit(ctx, 'manifest.validate', 'manifest', m.id, { stage: 0 }, { stage: 1, parcels: items.length, driver: driver.name });
      return { stage: 1 };
    }
    // exchange: handed over at validation (deliveries leave the stock, pickups are assigned to the driver)
    for (const it of items) {
      const o = await reloadOrder(it.order_id);
      if (it.role === 'pickup') { if (o.status !== 'affecte' || o.driver_id !== driver.id) await changeStatus(o, 'affecte', { user, driver }); }
      else await handOver(user, o, driver, { manifestId: m.id, agencyId: agencyOf(m) });
      await q(`UPDATE manifest_items SET loaded_at = now() WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
    }
    await q(`UPDATE manifests SET stage = 1, validated_at = now(), validated_by = $2, handed_at = now() WHERE id = $1`, [m.id, user.id]);
    await audit(ctx, 'manifest.handover', 'manifest', m.id, { stage: 0 }, { stage: 1, driver: driver.name, deliver: items.filter(i => i.role !== 'pickup').length, pickup: items.filter(i => i.role === 'pickup').length });
    return { stage: 1 };
  }
  if (m.type === 'pickup') {
    // the driver is announced at the shop: parcels assigned to him for the collection
    if (!m.driver_id) fail(409, 'Choisissez le livreur avant de valider.');
    const driver = await agencyDriver(m.driver_id, agencyOf(m));
    for (const it of items) {
      const o = await reloadOrder(it.order_id);
      if (!['attente', 'affecte'].includes(o.status)) fail(409, `${o.ref} : statut « ${o.status} » — retirez-le de l’enlèvement.`);
      if (o.status !== 'affecte' || o.driver_id !== driver.id) await changeStatus(o, 'affecte', { user, driver, note: `Enlèvement ${m.ref}` });
    }
    await q(`UPDATE manifests SET stage = 1, validated_at = now(), validated_by = $2 WHERE id = $1`, [m.id, user.id]);
    await audit(ctx, 'manifest.validate', 'manifest', m.id, { stage: 0 }, { stage: 1, parcels: items.length, driver: driver.name });
    return { stage: 1 };
  }
  if (m.type === 'restitution') {
    for (const it of items) {
      const o = await reloadOrder(it.order_id);
      if (!o.in_stock || o.current_agency_id !== agencyOf(m)) fail(409, `${o.ref} n’est plus en stock dans cette agence.`);
    }
    await q(`UPDATE manifests SET stage = 1, validated_at = now(), validated_by = $2 WHERE id = $1`, [m.id, user.id]);
    await audit(ctx, 'manifest.validate', 'manifest', m.id, { stage: 0 }, { stage: 1, parcels: items.length });
    return { stage: 1 };
  }
  fail(409, 'Ce bordereau se confirme ou se clôture (pas de validation).');
}));

/** Dispatch: the driver signs, parcels are assigned to him and leave the stock. */
route('POST', '/manifests/:id/handover', STAFF, async ctx => tx(async () => {
  const { user } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  mustType(m, 'dispatch');
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau remet les colis.');
  mustBe(m, [1], 'Validez le bordereau avant la remise.');
  const driver = await agencyDriver(m.driver_id, agencyOf(m));
  const items = await q(`SELECT order_id FROM manifest_items WHERE manifest_id = $1`, [m.id]);
  for (const it of items) {
    await handOver(user, await reloadOrder(it.order_id), driver, { manifestId: m.id, agencyId: agencyOf(m) });
    await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()), confirmed_at = now(), confirmed_by = $3 WHERE manifest_id = $1 AND order_id = $2`, [m.id, it.order_id, user.id]);
  }
  await q(`UPDATE manifests SET stage = 4, handed_at = now(), closed_at = now(), closed_by = $2 WHERE id = $1`, [m.id, user.id]);
  await audit(ctx, 'manifest.handover', 'manifest', m.id, { stage: 1 }, { stage: 4, driver: driver.name, parcels: items.length });
  return { stage: 4 };
}));

/** Return: the agency confirms what the driver brought back → parcels re-enter the stock (only now). */
route('POST', '/manifests/:id/confirm', STAFF, async ctx => tx(async () => {
  const { user } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  mustType(m, 'return');
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau confirme le retour.');
  mustBe(m, [0], 'Retour déjà confirmé.');
  const items = await q(`SELECT i.*, o.ref FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1`, [m.id]);
  if (!items.length) fail(409, 'Aucun colis à confirmer.');
  const out = [];
  for (const it of items) {
    const o = await bringBack(user, await reloadOrder(it.order_id), { reason: it.reason, comment: it.comment, agencyId: agencyOf(m), manifestId: m.id });
    await q(`UPDATE manifest_items SET received_at = now(), received_by = $3, confirmed_at = now(), confirmed_by = $3, result = $4 WHERE manifest_id = $1 AND order_id = $2`,
      [m.id, it.order_id, user.id, o.status]);
    out.push({ ref: o.ref, status: o.status });
  }
  await q(`UPDATE manifests SET stage = 4, validated_at = now(), validated_by = $2, closed_at = now(), closed_by = $2 WHERE id = $1`, [m.id, user.id]);
  await audit(ctx, 'manifest.confirm', 'manifest', m.id, { stage: 0 }, { stage: 4, parcels: out });
  return { stage: 4, parcels: out };
}));

route('POST', '/manifests/:id/ship', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  mustType(m, 'transfer');
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence de départ expédie le bordereau.');
  mustBe(m, [1], 'Validez le bordereau avant de l’expédier.');
  await q(`UPDATE manifests SET stage = 2, shipped_at = now() WHERE id = $1`, [m.id]);
  const rows = await q(`SELECT o.* FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1`, [m.id]);
  for (const r of rows) if (r.status !== 'transit')
    await changeStatus(r, 'transit', { system: true, user: ctx.user, actor: `${ctx.user.name} · bordereau ${m.ref}`, stock: { reason: 'transfer_out', manifest_id: m.id } });
  await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()) WHERE manifest_id = $1`, [m.id]);
  await audit(ctx, 'manifest.ship', 'manifest', m.id, { stage: 1 }, { stage: 2, parcels: rows.length });
  return { stage: 2 };
}));

route('POST', '/manifests/:id/arrive', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  mustType(m, 'transfer');
  if (!isDest(ctx.user, m)) fail(403, 'Seule l’agence de destination déclare l’arrivée.');
  mustBe(m, [2]);
  await q(`UPDATE manifests SET stage = 3, arrived_at = now() WHERE id = $1`, [m.id]);
  await audit(ctx, 'manifest.arrive', 'manifest', m.id, { stage: 2 }, { stage: 3 });
  return { stage: 3 };
}));

route('POST', '/manifests/:id/receive', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  mustType(m, 'transfer');
  const o = ctx.body.ref ? await orderByRef(ctx.user, ctx.body.ref)
    : await one(`SELECT o.* FROM orders o JOIN manifest_items i ON i.order_id = o.id WHERE i.manifest_id = $1 AND o.id = $2`, [m.id, int(ctx.body.order_id)]);
  if (!o) fail(404, 'Colis absent du bordereau.');
  return receiveItem(ctx, m, o, { condition: ctx.body.condition, note: ctx.body.note });
}));

/** Closing: transfer (missing parcels → anomalies, reserves), exchange (results), call, inventory (gaps). */
route('POST', '/manifests/:id/close', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  const items = await q(`SELECT i.*, o.ref, o.status, o.kind, o.in_stock FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1`, [m.id]);
  const done = async (result, totals, extra = {}) => {
    await q(`UPDATE manifests SET stage = 4, closed_at = now(), closed_by = $2, result = $3, totals = $4, reserves = $5 WHERE id = $1`,
      [m.id, user.id, result, totals ? JSON.stringify(totals) : null, extra.reserves || null]);
    await audit(ctx, 'manifest.close', 'manifest', m.id, { stage: m.stage }, { stage: 4, result, totals, ...extra });
    return { stage: 4, result, totals, ...extra };
  };
  if (m.type === 'transfer') {
    if (!isDest(user, m)) fail(403, 'Seule l’agence de destination clôture le bordereau.');
    mustBe(m, [3], 'Le bordereau doit être arrivé pour être clôturé.');
    const missing = items.filter(i => !i.received_at);
    for (const i of missing) {
      await q(`UPDATE manifest_items SET anomaly = 'manquant' WHERE manifest_id = $1 AND order_id = $2`, [m.id, i.order_id]);
      await addAnomaly({ agencyId: m.dest_agency_id, orderId: i.order_id, kind: 'manquant', source: 'transfer', manifestId: m.id, user, note: `Non reçu (${m.ref})` });
    }
    const anomalies = await one(`SELECT count(*)::int AS n FROM stock_anomalies WHERE manifest_id = $1`, [m.id]);
    // with anomalies the closing is always « avec réserves »: the user's text, else an automatic summary (API compatibility)
    const reserves = str(body.reserves, 500) || (missing.length || anomalies.n
      ? `Réserves automatiques : ${missing.length} manquant(s)${missing.length ? ' (' + missing.map(i => i.ref).join(', ') + ')' : ''}, ${anomalies.n} anomalie(s)`.slice(0, 500) : '');
    const r = await done(missing.length || anomalies.n ? 'avec_reserves' : 'sans_reserve',
      { expected: items.length, received: items.length - missing.length, missing: missing.length, anomalies: anomalies.n }, { reserves: reserves || null, missing: missing.map(i => i.ref) });
    return r;
  }
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence du bordereau le clôture.');
  if (m.type === 'exchange') {
    mustBe(m, [1], 'Remettez d’abord le bordereau au livreur.');
    const results = body.results && typeof body.results === 'object' ? body.results : {};
    let ok = 0;
    for (const i of items) {
      let res;
      if (i.role === 'pickup') {
        res = results[i.order_id] || i.result;
        if (!['ok', 'failed'].includes(res)) fail(400, `Indiquez si ${i.ref} a été récupéré.`);
        const o = await reloadOrder(i.order_id);
        if (res === 'ok') await receivePickup(user, o, agencyOf(m), m.id);
        else if (o.status === 'affecte') await changeStatus(o, 'attente', { user, note: `Non récupéré (échange ${m.ref})` });
      } else res = i.status === 'livre' ? 'ok' : 'failed';
      if (res === 'ok') ok++;
      await q(`UPDATE manifest_items SET result = $3, confirmed_at = now(), confirmed_by = $4 WHERE manifest_id = $1 AND order_id = $2`, [m.id, i.order_id, res, user.id]);
    }
    const result = ok === items.length ? 'complet' : ok === 0 ? 'echoue' : 'partiel';
    const pending = items.filter(i => i.role !== 'pickup' && i.status !== 'livre' && !i.in_stock).map(i => i.ref);
    return done(result, { lines: items.length, ok, failed: items.length - ok }, pending.length ? { to_return: pending } : {});
  }
  if (m.type === 'call') {
    mustBe(m, [0]);
    const by = {};
    for (const i of items) by[i.call_result || 'non_appele'] = (by[i.call_result || 'non_appele'] || 0) + 1;
    return done(null, { lines: items.length, ...by });
  }
  if (m.type === 'inventory') {
    mustBe(m, [0], 'Session déjà clôturée.');
    const missing = items.filter(i => i.expected && !i.scanned_at), extra = items.filter(i => !i.expected);
    for (const i of missing) {
      await q(`UPDATE manifest_items SET anomaly = 'manquant' WHERE manifest_id = $1 AND order_id = $2`, [m.id, i.order_id]);
      await addAnomaly({ agencyId: agencyOf(m), orderId: i.order_id, kind: 'manquant', source: 'inventory', manifestId: m.id, user, note: `Non trouvé à l’inventaire ${m.ref}` });
    }
    for (const i of extra) await addAnomaly({ agencyId: agencyOf(m), orderId: i.order_id, kind: 'supplementaire', source: 'inventory', manifestId: m.id, user, note: `Trouvé hors stock théorique (${m.ref})` });
    const unknown = await one(`SELECT count(*)::int AS n FROM stock_anomalies WHERE manifest_id = $1 AND kind = 'inconnu'`, [m.id]);
    const expected = items.filter(i => i.expected).length;
    return done(missing.length || extra.length || unknown.n ? 'ecarts' : 'conforme',
      { expected, counted: items.filter(i => i.scanned_at).length, missing: missing.length, extra: extra.length, unknown: unknown.n });
  }
  if (m.type === 'pickup') {
    mustBe(m, [1, 2], 'Validez l’enlèvement d’abord.');
    // what was not brought back stays at the shop: back to « en attente », without driver
    const missing = items.filter(i => !i.received_at);
    for (const i of missing) {
      const o = await reloadOrder(i.order_id);
      if (o.status === 'affecte' && !o.in_stock) await changeStatus(o, 'attente', { user, note: `Non enlevé (${m.ref})` });
      await q(`UPDATE manifest_items SET anomaly = 'manquant' WHERE manifest_id = $1 AND order_id = $2`, [m.id, i.order_id]);
    }
    const got = items.length - missing.length;
    return done(missing.length ? (got ? 'partiel' : 'echoue') : 'complet', { expected: items.length, received: got, missing: missing.length }, { missing: missing.map(i => i.ref) });
  }
  fail(409, 'Ce bordereau ne se clôture pas ainsi.');
}));

/** Pickup: the driver collected the parcels at the shop (signed by the shop). */
route('POST', '/manifests/:id/collected', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  mustType(m, 'pickup');
  if (!isOrigin(ctx.user, m)) fail(403, 'Hors de votre agence.');
  mustBe(m, [1], 'L’enlèvement doit être validé (à enlever).');
  await q(`UPDATE manifests SET stage = 2, collected_at = now() WHERE id = $1`, [m.id]);
  await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()) WHERE manifest_id = $1`, [m.id]);
  await audit(ctx, 'manifest.collected', 'manifest', m.id, { stage: 1 }, { stage: 2 });
  return { stage: 2 };
}));

/** Pickup: one collected parcel enters the agency stock. */
async function receivePickupItem(ctx, m, o) {
  if (!isOrigin(ctx.user, m)) fail(403, 'Hors de votre agence.');
  mustBe(m, [1, 2], 'Enlèvement non validé ou déjà clôturé.');
  const it = await one(`SELECT received_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
  if (!it) fail(409, `${o.ref} ne figure pas sur ${m.ref}.`);
  if (it.received_at) return { message: `${o.ref} déjà reçu`, already: true, order: { id: o.id, ref: o.ref } };
  await receiveDeposit(ctx.user, o, agencyOf(m));
  await q(`UPDATE manifest_items SET received_at = now(), received_by = $3, scanned_at = coalesce(scanned_at, now()) WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id, ctx.user.id]);
  await audit(ctx, 'manifest.receive', 'manifest', m.id, null, { order: o.ref });
  const left = await one(`SELECT count(*)::int AS n FROM manifest_items WHERE manifest_id = $1 AND received_at IS NULL`, [m.id]);
  return { message: `${o.ref} reçu à l’agence — reste ${left.n}`, order: { id: o.id, ref: o.ref } };
}
route('POST', '/manifests/:id/receive-pickup', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  mustType(m, 'pickup');
  return receivePickupItem(ctx, m, await orderById(ctx.user, ctx.body.order_id));
}));

/**
 * Restitution: the sender received its parcels. A signed discharge (photo / scan, image or PDF) or the name of the
 * person who signed is required; parcels become « restitués » and leave the stock.
 */
route('POST', '/manifests/:id/delivered', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  mustType(m, 'restitution');
  if (!isOrigin(user, m)) fail(403, 'Hors de votre agence.');
  mustBe(m, [1], 'Validez le bordereau avant la remise.');
  const doc = typeof body.signed_doc === 'string' && /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(body.signed_doc) ? body.signed_doc : null;
  if (body.signed_doc && !doc) fail(400, 'Document signé invalide (image ou PDF).');
  if (doc && doc.length > 4_000_000) fail(413, 'Document trop volumineux (3 Mo max).');
  const signer = str(body.signer_name, 120);
  if (!doc && !signer) fail(400, 'Joignez la décharge signée ou indiquez le nom du signataire.');
  const items = await q(`SELECT order_id FROM manifest_items WHERE manifest_id = $1`, [m.id]);
  const note = `Restitué à l’expéditeur (${m.ref})`;
  for (const it of items) {
    let o = await reloadOrder(it.order_id);
    const stock = { reason: 'restitution', manifest_id: m.id };
    if (o.status === 'retour') { await changeStatus(o, 'retour_agence', { user, note, agencyId: agencyOf(m), stock }); o = await reloadOrder(o.id); }
    if (o.status === 'retour_agence') await changeStatus(o, 'restitue', { user, note, stock });
    else await stockOut(o.id, { reason: 'restitution', manifestId: m.id, user, note });
    await q(`UPDATE manifest_items SET confirmed_at = now(), confirmed_by = $3, result = 'ok' WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id, user.id]);
  }
  await q(`UPDATE manifests SET stage = 4, signed_doc = $2, signer_name = $3, signed_at = now(), handed_at = now(), closed_at = now(), closed_by = $4 WHERE id = $1`,
    [m.id, doc, signer || null, user.id]);
  await audit(ctx, 'manifest.delivered', 'manifest', m.id, { stage: 1 }, { stage: 4, parcels: items.length, signer: signer || null, document: !!doc });
  return { stage: 4 };
}));

/** Signed document of a bordereau (restitution discharge). */
route('GET', '/manifests/:id/document', STAFF, async ({ user, params }) => {
  const m = await loadManifest(user, params.id);
  const d = await one(`SELECT signed_doc, signer_name, signed_at FROM manifests WHERE id = $1`, [m.id]);
  if (!d.signed_doc) fail(404, 'Aucun document signé.');
  return d;
});

/** Generic scan inside a bordereau screen (USB scanner / camera / manual entry). */
route('POST', '/manifests/:id/scan', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  if (m.type === 'inventory') return inventoryScan(ctx, m, body.code);
  if (m.type === 'transfer' && [2, 3].includes(m.stage) && isDest(user, m)) {
    // a parcel physically on the truck but outside our perimeter / unknown: reported, never received
    const ref = refFromCode(body.code);
    const s = new Sql([ref]);
    if (ref && !(await one(`SELECT o.id FROM orders o WHERE upper(o.ref) = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v))) {
      const any = await one(`SELECT id FROM orders WHERE upper(ref) = $1`, [ref]);
      await addAnomaly({ agencyId: m.dest_agency_id, orderId: any?.id || null, code: ref, kind: any ? 'supplementaire' : 'inconnu', source: 'transfer', manifestId: m.id, user, note: `Hors bordereau ${m.ref}` });
      await audit(ctx, 'manifest.extra', 'manifest', m.id, null, { code: ref });
      return { message: `${ref} ne figure pas sur ce bordereau : ${any ? 'colis supplémentaire' : 'code inconnu'} signalé.`, anomaly: any ? 'supplementaire' : 'inconnu', extra: true };
    }
  }
  const o = await orderByRef(user, body.code);
  if (m.stage === 0 && m.type !== 'settlement') {
    const r = await addLine(ctx, m, o, body);
    return { message: r.already ? `${o.ref} déjà sur le bordereau` : `${o.ref} ajouté`, already: !!r.already, warning: r.warning, order: { id: o.id, ref: o.ref } };
  }
  if (m.type === 'transfer' && [2, 3].includes(m.stage) && isDest(user, m)) return { ...(await receiveItem(ctx, m, o, body)), order: { id: o.id, ref: o.ref } };
  if (m.type === 'pickup' && [1, 2].includes(m.stage)) return receivePickupItem(ctx, m, o);
  if (['transfer', 'dispatch', 'restitution'].includes(m.type) && m.stage === 1) {
    // loading control: every parcel scanned before the departure / the handover
    const it = await one(`SELECT scanned_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
    if (!it) fail(409, `${o.ref} ne figure pas sur ${m.ref}.`);
    if (it.scanned_at) return { message: `${o.ref} déjà contrôlé`, already: true, order: { id: o.id, ref: o.ref } };
    await q(`UPDATE manifest_items SET scanned_at = now(), loaded_at = coalesce(loaded_at, now()) WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
    const left = await one(`SELECT count(*)::int AS n FROM manifest_items WHERE manifest_id = $1 AND scanned_at IS NULL`, [m.id]);
    return { message: `${o.ref} contrôlé — reste ${left.n}`, order: { id: o.id, ref: o.ref } };
  }
  fail(409, `Scan impossible : bordereau « ${STAGES[m.stage]} ».`);
}));

/** Settlement draft: recompute from orders and cash entries. */
route('POST', '/manifests/:id/recompute', STAFF, async ctx => tx(async () => {
  const m = await loadManifest(ctx.user, ctx.params.id, true);
  mustType(m, 'settlement');
  if (!isOrigin(ctx.user, m)) fail(403, 'Hors de votre agence.');
  mustBe(m, [0]);
  return { totals: await refreshSettlement(m) };
}));

/**
 * Cancellation of a validated / closed bordereau: never deleted, marked ANNULÉ with reason, user and date.
 * Effects are corrected by controlled inverse operations (stock movements, reversal cash entry); what can no
 * longer be reversed (parcel already moved on) is listed and left untouched.
 */
route('POST', '/manifests/:id/cancel', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await loadManifest(user, ctx.params.id, true);
  const reason = str(body.reason, 500);
  if (!reason) fail(400, 'Motif d’annulation obligatoire.');
  if (m.stage === 0) fail(409, 'Un brouillon se supprime (pas d’annulation).');
  mustBe(m, [1, 2, 3, 4]);
  if (m.stage === 4 ? user.role !== 'admin' : !isOrigin(user, m)) fail(403, m.stage === 4 ? 'Seul un administrateur annule un bordereau clôturé.' : 'Hors de votre agence.');
  const items = await q(`SELECT i.*, o.ref FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1`, [m.id]);
  const reversed = [], kept = [];
  const note = `Annulation ${m.ref} : ${reason}`;
  if (m.type === 'transfer') {
    if ([2, 3].includes(m.stage)) fail(409, 'Transfert en cours : réceptionnez puis clôturez avec réserves.');
    if (m.stage === 1) await q(`UPDATE orders SET manifest_id = NULL WHERE manifest_id = $1`, [m.id]);
  }
  if ((m.type === 'dispatch' && m.stage === 4) || m.type === 'exchange') {
    for (const it of items) {
      const o = await reloadOrder(it.order_id);
      if (it.role === 'pickup') {
        if (!o.in_stock && ['attente', 'affecte'].includes(o.status)) { await cancelPickup(user, o, note); reversed.push(o.ref); } else kept.push(o.ref);
      } else if (o.status === 'affecte' && !o.in_stock && o.driver_id === m.driver_id) {
        await changeStatus(o, 'en_agence', { user, note, agencyId: agencyOf(m), stock: { reason: 'cancel', manifest_id: m.id } });
        await q(`UPDATE orders SET driver_id = NULL WHERE id = $1`, [o.id]);
        reversed.push(o.ref);
      } else if (!o.in_stock) kept.push(o.ref);
    }
  }
  if (m.type === 'pickup' && m.stage < 4) {
    for (const it of items) {
      const o = await reloadOrder(it.order_id);
      if (!it.received_at && o.status === 'affecte' && !o.in_stock) { await changeStatus(o, 'attente', { user, note }); reversed.push(o.ref); }
      else if (!it.received_at) kept.push(o.ref);
    }
  }
  if (m.type === 'restitution' && m.stage === 4) fail(409, 'Colis déjà remis à l’expéditeur : annulation impossible (décharge signée).');
  if (m.type === 'return' && m.stage === 4) {
    const driver = await one(`SELECT id, name FROM users WHERE id = $1`, [m.driver_id]);
    for (const it of items) {
      const o = await reloadOrder(it.order_id);
      if (o.in_stock && o.current_agency_id === agencyOf(m) && o.status === 'en_agence' && !o.driver_id) {
        await changeStatus(o, 'affecte', { user, driver, note, stock: { manifest_id: m.id } });
        await stockOut(o.id, { reason: 'cancel', manifestId: m.id, user, note });
        reversed.push(o.ref);
      } else kept.push(o.ref);
    }
  }
  let reversal = null;
  if (m.type === 'settlement' && m.cash_tx_id) {
    const c = await one(`SELECT * FROM cash_tx WHERE id = $1`, [m.cash_tx_id]);
    await assertCashOpen(c.agency_id);
    reversal = await one(`INSERT INTO cash_tx (label, type, amount, created_by, agency_id, driver_id, shop_id, manifest_id, link_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [`Contre-passation ${m.ref} — ${reason}`.slice(0, 120), c.type, -Number(c.amount), user.id, c.agency_id, c.driver_id, c.shop_id, m.id, c.id]);
    await q(`UPDATE cash_tx SET link_id = $2 WHERE id = $1 AND link_id IS NULL`, [c.id, reversal.id]);
    await audit(ctx, 'cash.reversal', 'cash', reversal.id, { id: c.id, amount: Number(c.amount) }, { amount: -Number(c.amount), manifest: m.ref });
  }
  await q(`UPDATE manifests SET stage = 5, cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1`, [m.id, user.id, reason]);
  await audit(ctx, 'manifest.cancel', 'manifest', m.id, { stage: m.stage }, { stage: 5, reason, reversed, kept, reversal_cash_tx: reversal?.id || null });
  return { stage: 5, reversed, kept, reversal_cash_tx: reversal?.id || null };
}));

/* ------------------------------------------------------------------ shop: pickup requests (demande d'enlèvement) */

route('GET', '/shop/pickups', ['shop'], async ({ user }) => ({
  pickups: await q(`SELECT m.id, m.ref, m.stage, m.created_at, m.collected_at, m.closed_at, m.cancelled_at, m.pickup_date, m.comment, d.name AS driver_name,
                       (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id)::int AS n,
                       (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id AND i.received_at IS NOT NULL)::int AS received
                    FROM manifests m LEFT JOIN users d ON d.id = m.driver_id WHERE m.type = 'pickup' AND m.shop_id = $1 ORDER BY m.created_at DESC LIMIT 50`, [shopOf(user)]),
}));

/** Shop selection for a pickup request: only its own parcels still waiting at the shop. */
async function addShopSelection(ctx, m, ids, refs) {
  const rows = await q(`SELECT o.* FROM orders o WHERE o.shop_id = $1 AND (o.id = ANY($2::int[]) OR upper(o.ref) = ANY($3::text[]))`, [m.shop_id, ids, refs]);
  if (rows.length < ids.length + refs.length) fail(404, 'Certains colis sont introuvables dans votre boutique.');
  const added = [];
  for (const o of rows) {
    if (o.kind !== 'delivery' || o.in_stock || !['attente', 'affecte'].includes(o.status) || await everInAgency(o.id)) fail(409, `${o.ref} n’est plus en attente d’enlèvement.`);
    const other = await activeElsewhere(o.id, m.id);
    if (other) fail(409, `${o.ref} est déjà sur ${other.ref}.`);
    await q(`INSERT INTO manifest_items (manifest_id, order_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [m.id, o.id]);
    added.push(o.ref);
  }
  return added;
}

/** The shop cancels its request while nobody is announced yet (draft deleted, parcels untouched). */
route('DELETE', '/shop/pickups/:id', ['shop'], async ctx => tx(async () => {
  const m = await one(`SELECT * FROM manifests WHERE id = $1 AND type = 'pickup' AND shop_id = $2 FOR UPDATE`, [int(ctx.params.id), shopOf(ctx.user)]);
  if (!m) fail(404, 'Demande introuvable.');
  if (m.stage !== 0) fail(409, 'Le livreur est déjà annoncé : contactez votre agence pour annuler.');
  await q(`DELETE FROM manifest_items WHERE manifest_id = $1`, [m.id]);
  await q(`DELETE FROM manifests WHERE id = $1`, [m.id]);
  await audit(ctx, 'manifest.delete', 'manifest', m.id, { ref: m.ref, type: 'pickup', by_shop: true }, null);
  return { ok: true };
}));

route('POST', '/shop/pickups', ['shop'], async ctx => tx(async () => {
  const { user, body } = ctx;
  if (!user.agency_id) fail(400, 'Boutique sans agence : contactez l’administrateur.');
  const open = await one(`SELECT ref FROM manifests WHERE type = 'pickup' AND shop_id = $1 AND stage = 0`, [shopOf(user)]);
  if (open) fail(409, `Une demande d’enlèvement est déjà en attente (${open.ref}).`);
  const origin = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1`, [user.agency_id]);
  const m = await insertManifest({ type: 'pickup', origin, dest: null, driverId: null, shopId: shopOf(user), from: null, to: null, user,
    body: { comment: body.comment, pickup_date: body.pickup_date, pickup_address: body.pickup_address || user.address } });
  // selection (checked parcels or scanned codes) or, by default, every parcel waiting at the shop
  const ids = (Array.isArray(body.order_ids) ? body.order_ids : []).map(int).filter(Boolean);
  const refs = (Array.isArray(body.refs) ? body.refs : []).map(refFromCode).filter(Boolean);
  const added = ids.length || refs.length ? await addShopSelection(ctx, m, ids, refs) : await addShopParcels(ctx, m);
  if (!added.length) fail(409, 'Aucun colis en attente d’enlèvement.');
  await audit(ctx, 'manifest.create', 'manifest', m.id, null, { ref: m.ref, type: 'pickup', requested_by_shop: user.id, parcels: added.length });
  const { notify, agencyStaff } = await import('../notify.js');
  await notify('inapp', { userIds: await agencyStaff(origin.id), type: 'pickup.request', title: `Demande d’enlèvement · ${user.shop_name || user.name}`, body: `${added.length} colis — ${m.ref}` });
  return { manifest: { id: m.id, ref: m.ref }, parcels: added.length };
}));

/* ------------------------------------------------------------------ end-of-day report per driver (rapport de fin de journée) */

route('GET', '/reports/end-of-day', STAFF, async ({ user, query }) => {
  const agencyId = scopeAgency(user, query.agency_id) || (await defaultAgency())?.id;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : null;
  const D = `coalesce($2::date, (now() AT TIME ZONE '${TZ}')::date)`;
  const onDay = col => `(${col} AT TIME ZONE '${TZ}')::date = ${D}`;
  const rows = await q(
    `SELECT u.id, u.name, u.phone,
       (SELECT count(*) FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id
         WHERE m.type IN ('dispatch','exchange') AND m.driver_id = u.id AND m.stage IN (1, 4) AND ${onDay('m.handed_at')})::int AS dispatched,
       (SELECT count(*) FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.status = 'livre' AND o.driver_id = u.id AND ${onDay('e.created_at')})::int AS delivered,
       (SELECT count(*) FROM order_events e WHERE e.user_id = u.id AND e.status IN ('absent','refuse','reporte','numero_incorrect','adresse_incorrecte') AND ${onDay('e.created_at')})::int AS failed,
       (SELECT count(*) FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id
         WHERE m.type = 'return' AND m.driver_id = u.id AND m.stage = 4 AND ${onDay('m.closed_at')})::int AS returned,
       (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND NOT o.in_stock AND o.status = ANY($3::text[]))::int AS in_hand,
       (SELECT coalesce(sum(o.cod), 0) FROM order_events e JOIN orders o ON o.id = e.order_id
         WHERE e.status = 'livre' AND o.driver_id = u.id AND o.payment_mode <> 'prepaid' AND ${onDay('e.created_at')})::float8 AS cod_collected,
       (SELECT coalesce(sum(c.amount), 0) FROM cash_tx c WHERE c.driver_id = u.id AND c.type = 'Encaissement' AND ${onDay('c.created_at')})::float8 AS remitted
     FROM users u WHERE u.role = 'driver' AND u.agency_id = $1 ORDER BY u.name`,
    [agencyId, day, [...ACTIVE, ...DRIVER_EXCEPTIONS, 'retour']]);
  const active = rows.filter(r => r.dispatched || r.delivered || r.failed || r.returned || r.in_hand || r.cod_collected || r.remitted);
  const sum = k => Math.round(active.reduce((a, r) => a + r[k], 0) * 1000) / 1000;
  const ag = await one(`SELECT name FROM agencies WHERE id = $1`, [agencyId]);
  return { agency_id: agencyId, agency_name: ag?.name, date: day || new Date().toISOString().slice(0, 10), drivers: active,
    totals: Object.fromEntries(['dispatched', 'delivered', 'failed', 'returned', 'in_hand', 'cod_collected', 'remitted'].map(k => [k, sum(k)])) };
});

/* scan actions (§9): add to a draft, load for shipping, receive at destination — kept for the scanner layer */
scanActions.manifest_add = async ({ order, user, body }) => tx(async () => {
  const m = await loadManifest(user, body.manifest_id, true);
  const r = await addLine({ user }, m, order, body);
  return { message: (r.already ? 'Déjà sur ' : 'Ajouté à ') + m.ref, status: order.status };
});
scanActions.ship = async ({ order, user, body }) => tx(async () => {
  const m = await loadManifest(user, body.manifest_id || order.manifest_id, true);
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence de départ expédie.');
  mustBe(m, [1, 2], 'Validez le bordereau avant le chargement.');
  const item = await one(`SELECT loaded_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  if (!item) fail(409, `${order.ref} ne figure pas sur ${m.ref}.`);
  await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()), scanned_at = coalesce(scanned_at, now()) WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  const left = await one(`SELECT count(*)::int AS n FROM manifest_items WHERE manifest_id = $1 AND loaded_at IS NULL`, [m.id]);
  return { message: `Chargé (${m.ref}) — reste ${left.n}`, status: order.status };
});
scanActions.arrival = async ({ order, user, body }) => tx(async () => {
  const m = await loadManifest(user, body.manifest_id || order.manifest_id, true);
  return receiveItem({ user }, m, order, { condition: body.condition, note: body.note });
});

export { RETURN_REASONS, reasonLabel };
