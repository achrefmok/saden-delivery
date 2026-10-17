// Shipper space (« espace boutique »): dashboard, parcel detail (journey, problems, calls, claim), edit / cancel while
// waiting, Excel import, claims, its bordereaux (exchanges, returns, payments, pickups), statistics, users and profile.
// Every query is restricted to the shop the account works for (shopOf: the shop itself or the main shop of an employee).
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail, shopOf, normPhone, normEmail, isEmail, hashPassword, USER_COLS } from '../auth.js';
import { ORDER_SELECT, startOf, str, num, int, TZ } from '../domain.js';
import { FINAL, changeStatus } from '../status.js';
import { computePrice } from '../pricing.js';
import { audit } from '../audit.js';
import { refFromCode } from './scan.js';
import { userAgency } from './auth.js';
import { createOrder } from './orders.js';
import { PROBLEM_TYPES } from '../problems.js';

const SHOP = ['shop'];
const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
/** Orders of the shop paid in a validated settlement (« soldé »). */
const SETTLED = `EXISTS (SELECT 1 FROM manifest_items si JOIN manifests sm ON sm.id = si.manifest_id
  WHERE si.order_id = o.id AND sm.type = 'settlement' AND sm.stage = 4 AND sm.shop_id IS NOT NULL)`;

async function myOrder(user, id, lock = false) {
  const o = await one(`SELECT * FROM orders WHERE id = $1 AND shop_id = $2${lock ? ' FOR UPDATE' : ''}`, [int(id), shopOf(user)]);
  if (!o) fail(404, 'Colis introuvable dans votre boutique.');
  return o;
}

route('GET', '/shop/overview', SHOP, async ({ user }) => {
  const sid = shopOf(user);
  const [orders, k] = await Promise.all([
    q(`${ORDER_SELECT} WHERE o.shop_id = $1 ORDER BY o.created_at DESC LIMIT 300`, [sid]),
    one(`SELECT count(*)::int AS month,
           count(*) FILTER (WHERE status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE status IN ('livre','absent','refuse','reporte'))::int AS finals,
           coalesce(sum(cod) FILTER (WHERE status = 'livre'), 0)::float8 AS cod
         FROM orders WHERE shop_id = $1 AND created_at >= ${startOf('month')}`, [sid]),
  ]);
  return { me: user, orders, kpis: k, agency: await userAgency(user) };
});

/** « L'essentiel » + « Suivi détaillé »: count and COD amount per group of statuses. */
route('GET', '/shop/dashboard', SHOP, async ({ user }) => {
  const d = await one(
    `SELECT count(*) FILTER (WHERE o.status = 'livre')::int AS delivered_n, coalesce(sum(o.cod) FILTER (WHERE o.status = 'livre'), 0)::float8 AS delivered_cod,
            count(*) FILTER (WHERE o.status = 'restitue')::int AS returned_n, coalesce(sum(o.cod) FILTER (WHERE o.status = 'restitue'), 0)::float8 AS returned_cod,
            count(*) FILTER (WHERE NOT (o.status = ANY($2::text[])) AND o.status NOT IN ('cree','attente'))::int AS with_us_n,
            coalesce(sum(o.cod) FILTER (WHERE NOT (o.status = ANY($2::text[])) AND o.status NOT IN ('cree','attente')), 0)::float8 AS with_us_cod,
            count(*) FILTER (WHERE o.status IN ('livraison','sur_place'))::int AS out_n, coalesce(sum(o.cod) FILTER (WHERE o.status IN ('livraison','sur_place')), 0)::float8 AS out_cod,
            count(*) FILTER (WHERE o.in_stock)::int AS stock_n, coalesce(sum(o.cod) FILTER (WHERE o.in_stock), 0)::float8 AS stock_cod,
            count(*) FILTER (WHERE o.status IN ('retour','retour_agence'))::int AS ret_n, coalesce(sum(o.cod) FILTER (WHERE o.status IN ('retour','retour_agence')), 0)::float8 AS ret_cod,
            count(*) FILTER (WHERE ${SETTLED})::int AS settled_n, coalesce(sum(o.amount_to_remit) FILTER (WHERE ${SETTLED}), 0)::float8 AS settled_amount,
            count(*) FILTER (WHERE o.status = 'attente')::int AS waiting_n
     FROM orders o WHERE o.shop_id = $1 AND o.kind = 'delivery'`, [shopOf(user), FINAL]);
  const done = d.delivered_n + d.returned_n;
  return { ...d, finished: done, delivered_pct: done ? Math.round(d.delivered_n / done * 1000) / 10 : null, returned_pct: done ? Math.round(d.returned_n / done * 1000) / 10 : null };
});

/** Parcel detail for the shop: journey (who / when), problems, calls, claim — never the OTP nor proofs. */
route('GET', '/shop/orders/:id', SHOP, async ({ user, params }) => {
  const o = await myOrder(user, params.id);
  const [order, events, problems, calls, claim, manifests] = await Promise.all([
    one(`${ORDER_SELECT} WHERE o.id = $1`, [o.id]),
    q(`SELECT e.status, e.old_status, e.note, e.created_at, e.actor FROM order_events e WHERE e.order_id = $1 ORDER BY e.created_at, e.id`, [o.id]),
    q(`SELECT p.type, p.note, p.created_at, p.status, p.rdv_at, p.resolution, p.false_problem FROM parcel_problems p WHERE p.order_id = $1 ORDER BY p.id`, [o.id]),
    q(`SELECT c.outcome, c.note, c.created_at FROM problem_calls c JOIN parcel_problems p ON p.id = c.problem_id WHERE p.order_id = $1 ORDER BY c.id`, [o.id]),
    one(`SELECT id, category, text, status, created_at FROM claims WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [o.id]),
    q(`SELECT m.ref, m.type, m.stage FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id WHERE i.order_id = $1 AND m.type <> 'settlement' AND m.stage <> 5 ORDER BY m.id`, [o.id]),
  ]);
  delete order.otp;
  return { order: { ...order, client_phone2: o.client_phone2 }, events, problems, calls, claim, manifests, editable: ['cree', 'attente'].includes(o.status) };
});

/** Edit while « en attente » and not yet on an active bordereau (price re-computed and frozen again). */
route('PATCH', '/shop/orders/:id', SHOP, async ctx => tx(async () => {
  const { user, body } = ctx;
  const o = await myOrder(user, ctx.params.id, true);
  if (!['cree', 'attente'].includes(o.status)) fail(409, 'Seul un colis en attente est modifiable.');
  const busy = await one(`SELECT m.ref FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id WHERE i.order_id = $1 AND m.stage < 4`, [o.id]);
  if (busy) fail(409, `Colis déjà pris en charge (${busy.ref}).`);
  const v = {
    client_name: body.client_name !== undefined ? str(body.client_name, 80) : o.client_name,
    client_phone: body.client_phone !== undefined ? str(body.client_phone, 30) : o.client_phone,
    client_phone2: body.client_phone2 !== undefined ? str(body.client_phone2, 30) || null : o.client_phone2,
    address: body.address !== undefined ? str(body.address) : o.address,
    description: body.description !== undefined ? str(body.description, 300) || null : o.description,
    external_ref: body.external_ref !== undefined ? str(body.external_ref, 80) || null : o.external_ref,
    notes: body.notes !== undefined ? str(body.notes, 500) || null : o.notes,
    cod: body.cod !== undefined ? num(body.cod) : Number(o.cod),
  };
  if (!v.client_name) fail(400, 'Nom du client obligatoire.');
  if (normPhone(v.client_phone).length !== 8) fail(400, 'Téléphone du client invalide.');
  if (v.client_phone2 && normPhone(v.client_phone2).length !== 8) fail(400, 'Téléphone 2 invalide.');
  if (!v.address) fail(400, 'Adresse obligatoire.');
  if (v.cod == null || v.cod < 0) fail(400, 'Montant invalide.');
  if (o.payment_mode === 'prepaid') v.cod = 0;
  const price = await computePrice({ origin_agency_id: o.origin_agency_id, origin_city_id: o.origin_city_id, dest_city_id: o.dest_city_id, zone_id: o.zone_id,
    shop_id: o.shop_id, weight: o.weight == null ? null : Number(o.weight), parcel_type: o.parcel_type, cod: v.cod, payment_mode: o.payment_mode, lat: o.lat, lng: o.lng });
  await q(`UPDATE orders SET client_name = $2, client_phone = $3, client_phone2 = $4, address = $5, description = $6, external_ref = $7, notes = $8, cod = $9,
             delivery_fee = $10, driver_share = $11, saden_revenue = $12, amount_to_remit = $13, updated_at = now() WHERE id = $1`,
    [o.id, v.client_name, v.client_phone, v.client_phone2, v.address, v.description, v.external_ref, v.notes, v.cod,
     price.delivery_fee, price.driver_share, price.saden_revenue, price.amount_to_remit]);
  const pick = r => ({ client_name: r.client_name, client_phone: r.client_phone, client_phone2: r.client_phone2, address: r.address, cod: Number(r.cod), description: r.description, external_ref: r.external_ref });
  await audit(ctx, 'order.update', 'order', o.id, pick(o), pick(v));
  return { ok: true };
}));

/** « Supprimer » in bulk = cancellation (orders are never deleted), only while waiting. */
route('POST', '/shop/orders/cancel', SHOP, async ctx => {
  const ids = [...new Set((Array.isArray(ctx.body.ids) ? ctx.body.ids : []).map(int).filter(Boolean))].slice(0, 300);
  if (!ids.length) fail(400, 'Aucun colis sélectionné.');
  const note = str(ctx.body.note, 300) || 'Annulée par la boutique';
  const done = [], errors = [];
  for (const id of ids) {
    try { await tx(async () => { const o = await myOrder(ctx.user, id, true); await changeStatus(o, 'annule', { user: ctx.user, note }); done.push(o.ref); }); }
    catch (e) { if (e.status) errors.push(e.message); else throw e; }
  }
  return { done, errors };
});

/**
 * Excel import: rows parsed in the browser (template columns). City and zone are matched by name; each row is
 * created on its own (an invalid row never blocks the others) and the report gives the line number of each error.
 */
route('POST', '/shop/orders/import', SHOP, async ctx => {
  const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows.slice(0, 500) : [];
  if (!rows.length) fail(400, 'Fichier vide.');
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const cities = await q(`SELECT c.id, c.name, g.name AS gov FROM cities c JOIN governorates g ON g.id = c.governorate_id WHERE c.active`);
  const zones = await q(`SELECT id, name, city_id FROM zones WHERE active`);
  const created = [], errors = [];
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    try {
      const city = cities.find(c => norm(c.name) === norm(r.ville)) || cities.find(c => norm(c.gov) === norm(r.gouvernorat) && !r.ville);
      if (!city) fail(400, `ville « ${r.ville || r.gouvernorat || ''} » inconnue`);
      const zone = r.zone ? zones.find(z => z.city_id === city.id && norm(z.name) === norm(r.zone)) : null;
      if (r.zone && !zone) fail(400, `zone « ${r.zone} » inconnue pour ${city.name}`);
      const o = await createOrder({ client_name: r.nom, client_phone: String(r.telephone ?? ''), client_phone2: r.telephone2 ? String(r.telephone2) : null,
        address: r.adresse, dest_city_id: city.id, zone_id: zone?.id || null, cod: r.montant, external_ref: r.reference ? String(r.reference) : null,
        description: r.description, pieces: r.pieces || 1, exchange: /^(oui|yes|1|x)$/i.test(String(r.echange || '').trim()) }, ctx.user, { source: 'import' });
      created.push(o.ref);
    } catch (e) { if (e.status) errors.push({ line, error: e.message }); else throw e; }
  }
  await audit(ctx, 'orders.import', 'order', null, null, { rows: rows.length, created: created.length, errors: errors.length });
  return { created, errors };
});

/* ------------------------------------------------------------------ claims */

route('GET', '/shop/claims', SHOP, async ({ user }) => ({
  claims: await q(`SELECT c.id, c.category, c.text, c.status, c.created_at, c.updated_at, o.ref, o.client_name, o.id AS order_id
                   FROM claims c JOIN orders o ON o.id = c.order_id WHERE o.shop_id = $1 ORDER BY c.created_at DESC LIMIT 300`, [shopOf(user)]),
}));

/** 3-step wizard: find the parcel (code or client phone) → choose the problem → send. */
route('POST', '/shop/claims', SHOP, async ctx => tx(async () => {
  const { user, body } = ctx;
  const sid = shopOf(user);
  let o;
  if (body.order_id) o = await myOrder(user, body.order_id);
  else if (body.ref) o = await one(`SELECT * FROM orders WHERE shop_id = $1 AND upper(ref) = $2`, [sid, refFromCode(body.ref)]);
  else if (body.phone) {
    const list = await q(`SELECT * FROM orders WHERE shop_id = $1 AND right(regexp_replace(client_phone, '\\D', '', 'g'), 8) = $2 ORDER BY created_at DESC`, [sid, normPhone(body.phone)]);
    if (list.length > 1) fail(409, 'Plusieurs colis pour ce numéro : choisissez le colis.', { candidates: list.slice(0, 20).map(x => ({ id: x.id, ref: x.ref, client_name: x.client_name, status: x.status })) });
    o = list[0];
  }
  if (!o) fail(404, 'Colis introuvable dans votre boutique.');
  const cat = int(body.category);
  if (!(cat >= 0 && cat <= 6)) fail(400, 'Type de réclamation invalide.');
  const text = str(body.text, 1000);
  if (!text) fail(400, 'Décrivez le problème.');
  const open = await one(`SELECT id FROM claims WHERE order_id = $1 AND status < 3`, [o.id]);
  if (open) fail(409, `Une réclamation est déjà en cours pour ${o.ref} (RC-${String(open.id).padStart(4, '0')}).`);
  const c = await one(`INSERT INTO claims (order_id, driver_id, category, text) VALUES ($1,$2,$3,$4) RETURNING id`, [o.id, o.driver_id, cat, text]);
  await q(`INSERT INTO claim_events (claim_id, user_id, new_status, note) VALUES ($1,$2,0,$3)`, [c.id, user.id, 'Créée par la boutique']);
  await audit(ctx, 'claim.create', 'order', o.id, null, { claim: c.id, category: cat, by: 'shop' });
  const { notify, agencyStaff } = await import('../notify.js');
  await notify('inapp', { userIds: await agencyStaff(o.dest_agency_id || o.origin_agency_id), type: 'claim.new', order_id: o.id,
    title: `Nouvelle réclamation RC-${String(c.id).padStart(4, '0')} · ${o.ref}`, body: `${user.shop_name || user.name} — ${text.slice(0, 150)}` });
  return { id: c.id, ref: 'RC-' + String(c.id).padStart(4, '0'), order: o.ref };
}));

/* ------------------------------------------------------------------ the shop's bordereaux */

const SHOP_TYPES = ['pickup', 'exchange', 'restitution', 'settlement'];
/** Bordereaux concerning the shop (p = placeholder of the shop id). */
const shopManifestWhere = p => `(m.shop_id = ${p} OR (m.type = 'exchange' AND EXISTS (SELECT 1 FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = m.id AND o.shop_id = ${p})))`;

route('GET', '/shop/manifests', SHOP, async ({ user, query }) => {
  const type = SHOP_TYPES.includes(query.type) ? query.type : null;
  if (!type) fail(400, 'Type invalide.');
  const rows = await q(
    `SELECT m.id, m.ref, m.type, m.stage, m.created_at, m.closed_at, m.cancelled_at, m.result, m.totals, m.pickup_address, m.signer_name, m.signed_at,
            to_char(m.period_from, 'YYYY-MM-DD') AS period_from, to_char(m.period_to, 'YYYY-MM-DD') AS period_to, d.name AS driver_name, d.phone AS driver_phone,
            cu.name AS created_by_name,
            (SELECT count(*) FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = m.id AND o.shop_id = $1)::int AS n
     FROM manifests m LEFT JOIN users d ON d.id = m.driver_id LEFT JOIN users cu ON cu.id = coalesce(m.created_by, m.requested_by)
     WHERE m.type = $2 AND ${shopManifestWhere('$1')} ${type === 'settlement' ? 'AND m.stage IN (4, 5)' : ''}
     ORDER BY m.created_at DESC LIMIT 200`, [shopOf(user), type]);
  return { manifests: rows };
});

/** Detail in the same shape as the agency one (so the same PDF builder is used), limited to the shop's parcels. */
route('GET', '/shop/manifests/:id', SHOP, async ({ user, params }) => {
  const sid = shopOf(user);
  const m = await one(
    `SELECT m.*, NULL AS signed_doc, (m.signed_doc IS NOT NULL) AS has_signed_doc, to_char(m.period_from, 'YYYY-MM-DD') AS period_from, to_char(m.period_to, 'YYYY-MM-DD') AS period_to,
            to_char(m.pickup_date, 'YYYY-MM-DD') AS pickup_date, oa.name AS origin_agency_name, d.name AS driver_name, d.phone AS driver_phone, sh.shop_name,
            cu.name AS created_by_name, vu.name AS validated_by_name, cx.name AS cancelled_by_name
     FROM manifests m LEFT JOIN agencies oa ON oa.id = m.origin_agency_id LEFT JOIN users d ON d.id = m.driver_id LEFT JOIN users sh ON sh.id = m.shop_id
     LEFT JOIN users cu ON cu.id = coalesce(m.created_by, m.requested_by) LEFT JOIN users vu ON vu.id = m.validated_by LEFT JOIN users cx ON cx.id = m.cancelled_by
     WHERE m.id = $1 AND m.type = ANY($3::text[]) AND ${shopManifestWhere('$2')}`, [int(params.id), sid, SHOP_TYPES]);
  if (!m) fail(404, 'Bordereau introuvable.');
  const items = await q(
    `SELECT o.id, o.ref, o.client_name, o.client_phone, o.address, o.status, o.kind, o.cod::float8 AS cod, o.delivery_fee::float8 AS delivery_fee,
            o.driver_share::float8 AS driver_share, o.amount_to_remit::float8 AS amount_to_remit, o.pieces, o.related_order_id, ro.ref AS related_ref,
            dc.name AS dest_city_name, coalesce(z.name, o.zone) AS zone_name, i.role, i.reason, i.comment, i.result, i.amount::float8 AS amount,
            i.received_at, i.confirmed_at, i.expected, i.scanned_at, i.anomaly
     FROM manifest_items i JOIN orders o ON o.id = i.order_id LEFT JOIN orders ro ON ro.id = o.related_order_id
     LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN zones z ON z.id = o.zone_id
     WHERE i.manifest_id = $1 AND o.shop_id = $2 ORDER BY i.role DESC, o.ref`, [m.id, sid]);
  const history = await q(`SELECT a.action, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
                           WHERE a.entity = 'manifest' AND a.entity_id = $1 AND a.action IN ('manifest.create','manifest.validate','manifest.collected','manifest.receive','manifest.close','manifest.handover','manifest.delivered','manifest.cancel')
                           ORDER BY a.created_at, a.id`, [String(m.id)]);
  return { manifest: { ...m, type_label: m.type }, items, history, anomalies: [] };
});

/* ------------------------------------------------------------------ statistics */

route('GET', '/shop/stats', SHOP, async ({ user, query }) => {
  const sid = shopOf(user), months = { '1m': 1, '2m': 2, '3m': 3, '12m': 12 }[query.preset];
  const w = [`o.shop_id = $1`, `o.kind = 'delivery'`], v = [sid];
  if (isoDate(query.from) && isoDate(query.to)) { v.push(query.from, query.to); w.push(`(o.created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date`); }
  else if (months) w.push(`o.created_at > now() - interval '${months} months'`);
  const W = w.join(' AND ');
  const START = `coalesce((SELECT min(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.status IN ('ramasse','en_agence')), o.created_at)`;
  const DONE = `(SELECT max(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.status = 'livre')`;
  const [k, delay, problems, claims, govs] = await Promise.all([
    one(`SELECT count(*)::int AS total, count(*) FILTER (WHERE o.status = 'livre')::int AS delivered, count(*) FILTER (WHERE o.status = 'restitue')::int AS returned,
                count(*) FILTER (WHERE NOT (o.status = ANY($${v.length + 1}::text[])))::int AS in_progress FROM orders o WHERE ${W}`, [...v, FINAL]),
    one(`SELECT count(*) FILTER (WHERE h <= 24)::int AS h24, count(*) FILTER (WHERE h > 24 AND h <= 48)::int AS h48,
                count(*) FILTER (WHERE h > 48 AND h <= 72)::int AS h72, count(*) FILTER (WHERE h > 72)::int AS more
         FROM (SELECT EXTRACT(EPOCH FROM (${DONE} - ${START})) / 3600 AS h FROM orders o WHERE ${W} AND o.status = 'livre') x`, v),
    q(`SELECT p.type, count(*)::int AS n FROM parcel_problems p JOIN orders o ON o.id = p.order_id WHERE ${W} AND NOT p.false_problem GROUP BY 1 ORDER BY 2 DESC`, v),
    q(`SELECT c.category, count(*)::int AS n FROM claims c JOIN orders o ON o.id = c.order_id WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`, v),
    q(`SELECT coalesce(g.name, '—') AS name, count(*)::int AS n FROM orders o LEFT JOIN cities c ON c.id = o.dest_city_id LEFT JOIN governorates g ON g.id = c.governorate_id
       WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`, v),
  ]);
  return { kpis: k, delay, problems, claims, governorates: govs, problem_types: PROBLEM_TYPES };
});

/* ------------------------------------------------------------------ users of the shop + profile */

const canManage = u => u.role === 'shop' && (!u.parent_id || u.shop_role === 'admin');

route('GET', '/shop/users', SHOP, async ({ user }) => {
  const sid = shopOf(user);
  return { users: await q(`SELECT id, name, phone, email, active, shop_role, parent_id, created_at, last_seen FROM users WHERE id = $1 OR parent_id = $1 ORDER BY parent_id NULLS FIRST, name`, [sid]),
    can_manage: canManage(user) };
});

route('POST', '/shop/users', SHOP, async ctx => tx(async () => {
  const { user, body } = ctx;
  if (!canManage(user)) fail(403, 'Seul un administrateur de la boutique gère les utilisateurs.');
  const name = str(body.name, 80), phone = normPhone(body.phone) || null, email = normEmail(body.email) || null;
  if (!name) fail(400, 'Nom obligatoire.');
  if (!phone && !email) fail(400, 'Téléphone ou e-mail obligatoire.');
  if (phone && phone.length !== 8) fail(400, 'Téléphone invalide (8 chiffres).');
  if (email && !isEmail(email)) fail(400, 'Adresse e-mail invalide.');
  if (String(body.password || '').length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
  const role = body.shop_role === 'admin' ? 'admin' : 'agent';
  if (phone && await one(`SELECT 1 FROM users WHERE phone = $1`, [phone])) fail(409, 'Ce téléphone est déjà utilisé.');
  if (email && await one(`SELECT 1 FROM users WHERE lower(email) = $1`, [email])) fail(409, 'Cet e-mail est déjà utilisé.');
  const main = await one(`SELECT shop_name, agency_id, address FROM users WHERE id = $1`, [shopOf(user)]);
  const u = await one(`INSERT INTO users (role, name, phone, email, password_hash, agency_id, shop_name, address, parent_id, shop_role, status)
                       VALUES ('shop',$1,$2,$3,$4,$5,$6,$7,$8,$9,'off') RETURNING id, name, phone, email, active, shop_role`,
    [name, phone, email, await hashPassword(String(body.password)), main.agency_id, main.shop_name, main.address, shopOf(user), role]);
  await audit(ctx, 'user.create', 'user', u.id, null, { name, phone, email, shop_role: role, shop: shopOf(user) });
  return { user: u };
}));

route('PATCH', '/shop/users/:id', SHOP, async ctx => tx(async () => {
  const { user, body } = ctx;
  if (!canManage(user)) fail(403, 'Seul un administrateur de la boutique gère les utilisateurs.');
  const t = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1 AND parent_id = $2`, [int(ctx.params.id), shopOf(user)]);
  if (!t) fail(404, 'Utilisateur introuvable (le compte principal se gère avec votre agence).');
  const sets = [], vals = [t.id];
  const add = (c, v) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (typeof body.active === 'boolean') add('active', body.active);
  if (body.shop_role) add('shop_role', body.shop_role === 'admin' ? 'admin' : 'agent');
  if (body.name) add('name', str(body.name, 80));
  if (body.password != null) { if (String(body.password).length < 6) fail(400, 'Mot de passe : 6 caractères minimum.'); add('password_hash', await hashPassword(String(body.password))); }
  if (!sets.length) fail(400, 'Rien à modifier.');
  await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, vals);
  await audit(ctx, 'user.update', 'user', t.id, { active: t.active, shop_role: t.shop_role }, { ...body, password: body.password != null ? '••••••' : undefined });
  return { ok: true };
}));

route('GET', '/shop/profile', SHOP, async ({ user }) => {
  const p = await one(`SELECT u.id, u.shop_name, u.name, u.phone, u.email, u.address, u.print_format, u.rs_rate::float8 AS rs_rate, ag.name AS agency_name, ag.phone AS agency_phone
                       FROM users u LEFT JOIN agencies ag ON ag.id = u.agency_id WHERE u.id = $1`, [shopOf(user)]);
  return { profile: p, me: { id: user.id, name: user.name, shop_role: user.shop_role, print_format: user.print_format } };
});

/** Only the print format is chosen by the shop; identity data is managed by the agency. */
route('PATCH', '/shop/profile', SHOP, async ctx => {
  const f = ['a6', 'a4'].includes(ctx.body.print_format) ? ctx.body.print_format : null;
  if (!f) fail(400, 'Format d’impression invalide.');
  await q(`UPDATE users SET print_format = $2 WHERE id = $1`, [ctx.user.id, f]);
  return { ok: true, print_format: f };
});
