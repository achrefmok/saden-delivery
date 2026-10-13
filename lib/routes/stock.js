// « Stock » per agency: entry into stock (scan / manual), current stock with counters and filters,
// incoming parcels by category, anomalies (validated corrections only) and movement history.
// A parcel is physically present only after the agency confirmed its reception (orders.in_stock).
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { str, int, Sql, TZ, defaultAgency } from '../domain.js';
import { changeStatus, DRIVER_EXCEPTIONS } from '../status.js';
import { STAFF, scopeWhere, scopeAgency, assertAgency } from '../scope.js';
import { audit } from '../audit.js';
import { refFromCode } from './scan.js';
import { stockIn, stockOut, addAnomaly, MOVE_REASONS } from '../stock.js';
import { RETURN_REASONS, withDriver, bringBack, receiveDeposit, receivePickup } from '../flows.js';
import { receiveTransferParcel } from './manifests.js';

const AVAILABLE = ['en_agence', 'arrive', 'affecte'];
const RETURN_ST = ['retour', 'retour_agence'];
const PICKUP_ACTIVE = ['attente', 'affecte', 'accepte', 'ramasse', 'livraison', 'sur_place'];
// incident status of a parcel brought back → default return motive
const REASON_OF = { absent: 'absent', numero_incorrect: 'injoignable', refuse: 'refus', adresse_incorrecte: 'adresse', reporte: 'reporte' };

async function stockAgency(user, requested) {
  const id = scopeAgency(user, requested) || (user.role === 'admin' && !requested ? (await defaultAgency())?.id : null);
  if (!id) fail(400, 'Choisissez une agence.');
  if (!(await one(`SELECT id FROM agencies WHERE id = $1`, [id]))) fail(400, 'Agence invalide.');
  return id;
}

/** SQL classification of a parcel in stock of agency $1. */
const CATEGORY = `CASE
  WHEN o.kind = 'pickup' OR o.status IN ('retour','retour_agence') THEN 'returns'
  WHEN o.status IN ('en_agence','arrive','affecte') AND (o.origin_city_id = o.dest_city_id OR o.dest_agency_id = $1) THEN 'available'
  ELSE 'processing' END`;

route('GET', '/stock', STAFF, async ({ user, query }) => {
  const agencyId = await stockAgency(user, query.agency_id);
  const s = new Sql([agencyId]), where = ['o.in_stock', 'o.current_agency_id = $1'];
  if (query.status) where.push(`o.status = ${s.p(str(query.status, 30))}`);
  if (int(query.shop_id)) where.push(`o.shop_id = ${s.p(int(query.shop_id))}`);
  if (int(query.driver_id)) where.push(`o.driver_id = ${s.p(int(query.driver_id))}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) where.push(`(e.at AT TIME ZONE '${TZ}')::date >= ${s.p(query.from)}::date`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) where.push(`(e.at AT TIME ZONE '${TZ}')::date <= ${s.p(query.to)}::date`);
  if (query.q) { const p = s.p('%' + str(query.q, 60) + '%'); where.push(`(o.ref ILIKE ${p} OR o.client_name ILIKE ${p} OR o.client_phone ILIKE ${p})`); }
  if (['available', 'processing', 'returns'].includes(query.category)) where.push(`${CATEGORY} = ${s.p(query.category)}`);
  const [parcels, counts, transfers, anomalies] = await Promise.all([
    query.counts_only ? [] : q(`SELECT o.id, o.ref, o.client_name, o.client_phone, o.status, o.kind, o.cod::float8 AS cod, o.payment_mode, o.pieces,
              o.driver_id, d.name AS driver_name, sh.shop_name, dc.name AS dest_city_name, coalesce(z.name, o.zone) AS zone_name,
              o.manifest_id, e.at AS in_since, ${CATEGORY} AS category
       FROM orders o LEFT JOIN users d ON d.id = o.driver_id LEFT JOIN users sh ON sh.id = o.shop_id
       LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN zones z ON z.id = o.zone_id
       LEFT JOIN LATERAL (SELECT max(created_at) AS at FROM stock_movements sm WHERE sm.order_id = o.id AND sm.direction = 'in') e ON TRUE
       WHERE ${where.join(' AND ')} ORDER BY e.at DESC NULLS LAST, o.ref LIMIT 1000`, s.v),
    one(`SELECT count(*)::int AS present,
                count(*) FILTER (WHERE ${CATEGORY} = 'available')::int AS available,
                count(*) FILTER (WHERE ${CATEGORY} = 'processing')::int AS processing,
                count(*) FILTER (WHERE ${CATEGORY} = 'returns')::int AS returns
         FROM orders o WHERE o.in_stock AND o.current_agency_id = $1`, [agencyId]),
    one(`SELECT
           (SELECT count(*) FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id
             WHERE m.type = 'transfer' AND m.origin_agency_id = $1 AND m.stage IN (1, 2))::int AS outgoing,
           (SELECT count(*) FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id
             WHERE m.type = 'transfer' AND m.dest_agency_id = $1 AND m.stage IN (2, 3) AND i.received_at IS NULL)::int AS incoming`, [agencyId]),
    one(`SELECT count(*)::int AS n FROM stock_anomalies WHERE agency_id = $1 AND status = 'open'`, [agencyId]),
  ]);
  return { agency_id: agencyId, counts: { ...counts, ...transfers, anomalies: anomalies.n }, parcels };
});

/** Parcels expected in the agency, by category (nothing here is in stock yet). */
route('GET', '/stock/incoming', STAFF, async ({ user, query }) => {
  const agencyId = await stockAgency(user, query.agency_id);
  const cols = `o.id, o.ref, o.client_name, o.client_phone, o.status, o.kind, o.updated_at, sh.shop_name, d.name AS driver_name, o.driver_id`;
  const from = `FROM orders o LEFT JOIN users sh ON sh.id = o.shop_id LEFT JOIN users d ON d.id = o.driver_id`;
  const [shops, transfers, drivers, clients, anomalies] = await Promise.all([
    q(`SELECT ${cols} ${from} WHERE NOT o.in_stock AND o.kind = 'delivery' AND o.origin_agency_id = $1 AND o.status IN ('attente','ramasse')
       ORDER BY o.created_at LIMIT 500`, [agencyId]),
    q(`SELECT ${cols}, m.id AS manifest_id, m.ref AS manifest_ref, oa.name AS from_agency ${from}
       JOIN manifest_items i ON i.order_id = o.id JOIN manifests m ON m.id = i.manifest_id LEFT JOIN agencies oa ON oa.id = m.origin_agency_id
       WHERE m.type = 'transfer' AND m.dest_agency_id = $1 AND m.stage IN (2, 3) AND i.received_at IS NULL ORDER BY m.ref, o.ref`, [agencyId]),
    q(`SELECT ${cols} ${from} WHERE NOT o.in_stock AND o.kind = 'delivery' AND d.agency_id = $1
         AND o.status = ANY($2::text[]) ORDER BY d.name, o.ref`, [agencyId, [...DRIVER_EXCEPTIONS, 'retour']]),
    q(`SELECT ${cols}, ro.ref AS related_ref ${from} LEFT JOIN orders ro ON ro.id = o.related_order_id
       WHERE NOT o.in_stock AND o.kind = 'pickup' AND o.origin_agency_id = $1 AND o.status = ANY($2::text[]) ORDER BY o.ref`, [agencyId, PICKUP_ACTIVE]),
    q(`SELECT a.id, a.kind, a.code, a.source, a.note, a.created_at, o.ref AS order_ref, m.ref AS manifest_ref
       FROM stock_anomalies a LEFT JOIN orders o ON o.id = a.order_id LEFT JOIN manifests m ON m.id = a.manifest_id
       WHERE a.agency_id = $1 AND a.status = 'open' ORDER BY a.created_at DESC LIMIT 200`, [agencyId]),
  ]);
  return {
    agency_id: agencyId, shops, transfers, drivers, clients, anomalies,
    total: shops.length + transfers.length + drivers.length + clients.length,
    reasons: Object.fromEntries(Object.entries(RETURN_REASONS).map(([k, v]) => [k, v[0]])),
  };
});

/** Was the parcel ever inside an agency? (no → first deposit from the shop) */
const everInAgency = id => one(`SELECT 1 FROM order_events WHERE order_id = $1 AND status IN ('en_agence','arrive','retour_agence') LIMIT 1`, [id]);

/** Confirms the physical entry of one parcel (scan USB / camera / manual). Idempotent: a second scan never re-enters it. */
route('POST', '/stock/receive', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const agencyId = await stockAgency(user, body.agency_id);
  const ref = refFromCode(body.code || body.ref);
  const s = new Sql();
  const cond = body.order_id ? `o.id = ${s.p(int(body.order_id))}` : `upper(o.ref) = ${s.p(ref)}`;
  if (!body.order_id && !ref) fail(400, 'Code illisible.');
  const o = await one(`SELECT o.* FROM orders o WHERE ${cond} AND ${scopeWhere(user, 'orders', s)} FOR UPDATE`, s.v);
  if (!o) fail(404, `Colis ${ref || '#' + body.order_id} introuvable dans votre périmètre.`);
  if (o.in_stock && o.current_agency_id === agencyId) return { already: true, message: `${o.ref} est déjà en stock.`, order: { id: o.id, ref: o.ref, status: o.status } };

  let path, out;
  if (o.status === 'transit') {
    out = await receiveTransferParcel(ctx, o, agencyId, { condition: body.condition, note: body.comment });
    if (!out) fail(409, `${o.ref} est en transit vers une autre agence ou sans bordereau actif.`);
    path = 'transfer';
    return { ...out, path, order: { id: o.id, ref: o.ref, status: out.status } };
  }
  if (o.kind === 'pickup' && PICKUP_ACTIVE.includes(o.status)) { await receivePickup(user, o, agencyId); path = 'client'; }
  else if (o.status === 'retour' && !o.driver_id) { await changeStatus(o, 'retour_agence', { user, agencyId, stock: { reason: 'return' } }); path = 'return'; }
  else if (['attente', 'ramasse', 'affecte'].includes(o.status) && !(await everInAgency(o.id))) { await receiveDeposit(user, o, agencyId); path = 'shop'; }
  else if (withDriver(o)) {
    const reason = body.reason || REASON_OF[o.status] || (o.status === 'retour' ? 'boutique' : null);
    if (!reason) fail(400, 'Motif de retour obligatoire pour un colis rapporté par un livreur.', { need_reason: true });
    await bringBack(user, o, { reason, comment: str(body.comment, 300), agencyId });
    path = 'driver';
  } else if (o.in_stock || ['en_agence', 'arrive', 'retour_agence', 'endommage'].includes(o.status)) {
    await stockIn(o.id, agencyId, { reason: 'relocation', user, note: 'Constaté à la réception' });
    path = 'relocation';
  } else fail(409, `Entrée impossible : statut « ${o.status} ».`);

  let cur = await one(`SELECT * FROM orders WHERE id = $1`, [o.id]);
  if (body.condition === 'damaged') {
    const why = str(body.comment, 300) || 'Endommagé à la réception';
    if (['en_agence', 'arrive', 'attente'].includes(cur.status)) await changeStatus(cur, 'endommage', { user, note: why });
    await addAnomaly({ agencyId, orderId: o.id, kind: 'endommage', source: 'reception', user, note: why });
    cur = await one(`SELECT * FROM orders WHERE id = $1`, [o.id]);
  }
  await audit(ctx, 'stock.receive', 'order', o.id, { status: o.status, in_stock: o.in_stock }, { status: cur.status, in_stock: cur.in_stock, agency_id: agencyId, path, ...(body.condition === 'damaged' ? { damaged: true } : {}) });
  return { message: `${o.ref} entré en stock`, path, order: { id: o.id, ref: o.ref, status: cur.status } };
}));

/** Reception anomaly reported by the agency (unknown code, damaged, other). */
route('POST', '/stock/anomalies', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const agencyId = await stockAgency(user, body.agency_id);
  const kind = ['endommage', 'inconnu', 'autre', 'manquant', 'supplementaire'].includes(body.kind) ? body.kind : null;
  if (!kind) fail(400, 'Type d’anomalie invalide.');
  const note = str(body.note, 500);
  if (!note) fail(400, 'Décrivez l’anomalie.');
  let orderId = null;
  const code = refFromCode(body.code);
  if (code) {
    const s = new Sql([code]);
    orderId = (await one(`SELECT o.id FROM orders o WHERE upper(o.ref) = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v))?.id || null;
  }
  const a = await addAnomaly({ agencyId, orderId, code: code || null, kind: orderId || kind !== 'inconnu' ? kind : 'inconnu', source: 'reception', user, note });
  await audit(ctx, 'stock.anomaly', 'agency', agencyId, null, { id: a.id, kind, code, note });
  return { id: a.id };
}));

route('GET', '/stock/anomalies', STAFF, async ({ user, query }) => {
  const agencyId = await stockAgency(user, query.agency_id);
  const st = query.status === 'resolved' ? 'resolved' : query.status === 'all' ? null : 'open';
  return {
    anomalies: await q(
      `SELECT a.*, o.ref AS order_ref, o.in_stock, o.status AS order_status, m.ref AS manifest_ref, m.type AS manifest_type,
              cu.name AS created_by_name, ru.name AS resolved_by_name
       FROM stock_anomalies a LEFT JOIN orders o ON o.id = a.order_id LEFT JOIN manifests m ON m.id = a.manifest_id
       LEFT JOIN users cu ON cu.id = a.created_by LEFT JOIN users ru ON ru.id = a.resolved_by
       WHERE a.agency_id = $1 ${st ? 'AND a.status = $2' : ''} ORDER BY a.created_at DESC LIMIT 500`, st ? [agencyId, st] : [agencyId]),
  };
});

/**
 * Resolves an anomaly. `correct: true` applies the stock correction explicitly validated by the user
 * (missing → leaves the stock, extra → enters it); never automatic.
 */
route('POST', '/stock/anomalies/:id/resolve', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const a = await one(`SELECT * FROM stock_anomalies WHERE id = $1 FOR UPDATE`, [int(ctx.params.id)]);
  if (!a) fail(404, 'Anomalie introuvable.');
  assertAgency(user, a.agency_id);
  if (a.status !== 'open') fail(409, 'Anomalie déjà traitée.');
  const resolution = str(body.resolution, 500);
  if (!resolution) fail(400, 'Expliquez la résolution.');
  let corrected = false;
  if (body.correct) {
    if (!a.order_id || !['manquant', 'supplementaire'].includes(a.kind)) fail(409, 'Aucune correction de stock possible pour cette anomalie.');
    const opts = { reason: 'inventory_adjust', manifestId: a.manifest_id, user, note: resolution };
    corrected = a.kind === 'manquant'
      ? (await one(`SELECT current_agency_id FROM orders WHERE id = $1 AND in_stock`, [a.order_id]))?.current_agency_id === a.agency_id && await stockOut(a.order_id, opts)
      : await stockIn(a.order_id, a.agency_id, opts);
    if (!corrected) fail(409, 'Le stock a déjà été corrigé ou le colis a bougé depuis : rien à corriger.');
  }
  await q(`UPDATE stock_anomalies SET status = 'resolved', resolution = $2, corrected = $3, resolved_by = $4, resolved_at = now() WHERE id = $1`,
    [a.id, resolution, corrected, user.id]);
  await audit(ctx, corrected ? 'stock.correction' : 'stock.anomaly_resolve', 'agency', a.agency_id, { anomaly: a.id, kind: a.kind }, { resolution, corrected, order_id: a.order_id });
  return { ok: true, corrected };
}));

/** Movement history (one parcel, or one agency over a period). */
route('GET', '/stock/movements', STAFF, async ({ user, query }) => {
  const s = new Sql(), where = [];
  if (int(query.order_id)) {
    const so = new Sql([int(query.order_id)]);
    if (!(await one(`SELECT o.id FROM orders o WHERE o.id = $1 AND ${scopeWhere(user, 'orders', so)}`, so.v))) fail(404, 'Colis introuvable.');
    where.push(`sm.order_id = ${s.p(int(query.order_id))}`);
  } else where.push(`sm.agency_id = ${s.p(await stockAgency(user, query.agency_id))}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) where.push(`(sm.created_at AT TIME ZONE '${TZ}')::date >= ${s.p(query.from)}::date`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) where.push(`(sm.created_at AT TIME ZONE '${TZ}')::date <= ${s.p(query.to)}::date`);
  const rows = await q(
    `SELECT sm.id, sm.direction, sm.reason, sm.note, sm.created_at, o.ref, ag.name AS agency_name, m.ref AS manifest_ref, u.name AS user_name
     FROM stock_movements sm JOIN orders o ON o.id = sm.order_id JOIN agencies ag ON ag.id = sm.agency_id
     LEFT JOIN manifests m ON m.id = sm.manifest_id LEFT JOIN users u ON u.id = sm.user_id
     WHERE ${where.join(' AND ')} ORDER BY sm.created_at DESC, sm.id DESC LIMIT 500`, s.v);
  return { movements: rows.map(r => ({ ...r, reason_label: MOVE_REASONS[r.reason] || r.reason })) };
});
