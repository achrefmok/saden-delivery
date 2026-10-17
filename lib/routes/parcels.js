// « Colis » — professional parcel list: server-side pagination, advanced filters (incl. a pasted list of codes),
// export, labels in bulk, bulk status update through the state machine, status × agency / shop / driver matrix.
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { str, num, int, Sql, TZ, ORDER_SELECT } from '../domain.js';
import { STATUSES, changeStatus } from '../status.js';
import { STAFF, scopeWhere } from '../scope.js';
import { audit } from '../audit.js';
import { refFromCode } from './scan.js';

const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
const list = v => String(v || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);

/** WHERE clause of the advanced filters (always inside the user's perimeter). */
function filters(user, query, s) {
  const w = [scopeWhere(user, 'orders', s, { agency: query.agency_id })];
  const refs = list(query.refs).map(refFromCode).slice(0, 2000);
  if (refs.length) w.push(`(upper(o.ref) = ANY(${s.p(refs)}::text[]) OR upper(coalesce(o.external_ref, '')) = ANY(${s.p(refs)}::text[]))`);
  if (query.q) {
    const t = str(query.q, 80), p = s.p('%' + t + '%'), d = t.replace(/\D/g, '');
    w.push(`(o.ref ILIKE ${p} OR o.external_ref ILIKE ${p} OR o.client_name ILIKE ${p} OR o.address ILIKE ${p}${d.length >= 4 ? ` OR regexp_replace(o.client_phone, '\\D', '', 'g') LIKE ${s.p('%' + d + '%')}` : ''})`);
  }
  const st = list(query.status).filter(x => STATUSES.includes(x));
  if (st.length) w.push(`o.status = ANY(${s.p(st)}::text[])`);
  for (const [k, col] of [['shop_id', 'o.shop_id'], ['driver_id', 'o.driver_id'], ['dest_city_id', 'o.dest_city_id'], ['current_agency_id', 'o.current_agency_id'], ['origin_agency_id', 'o.origin_agency_id']])
    if (int(query[k])) w.push(`${col} = ${s.p(int(query[k]))}`);
  if (query.attempts !== undefined && query.attempts !== '') w.push(query.attempts === '4' ? 'o.attempts > 3' : `o.attempts = ${s.p(int(query.attempts))}`);
  if (num(query.cod_min) != null) w.push(`o.cod >= ${s.p(num(query.cod_min))}`);
  if (num(query.cod_max) != null) w.push(`o.cod <= ${s.p(num(query.cod_max))}`);
  if (isoDate(query.from)) w.push(`(o.created_at AT TIME ZONE '${TZ}')::date >= ${s.p(query.from)}::date`);
  if (isoDate(query.to)) w.push(`(o.created_at AT TIME ZONE '${TZ}')::date <= ${s.p(query.to)}::date`);
  if (isoDate(query.delivered_from) || isoDate(query.delivered_to)) {
    const c = [];
    if (isoDate(query.delivered_from)) c.push(`(e.created_at AT TIME ZONE '${TZ}')::date >= ${s.p(query.delivered_from)}::date`);
    if (isoDate(query.delivered_to)) c.push(`(e.created_at AT TIME ZONE '${TZ}')::date <= ${s.p(query.delivered_to)}::date`);
    w.push(`EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.status = 'livre' AND ${c.join(' AND ')})`);
  }
  if (query.in_stock === '1') w.push('o.in_stock');
  if (query.flagged === '1') w.push('o.flagged_at IS NOT NULL');
  if (['delivery', 'pickup'].includes(query.kind)) w.push(`o.kind = ${s.p(query.kind)}`);
  return w.join(' AND ');
}

const COLS = `o.id, o.ref, o.external_ref, o.kind, o.status, o.client_name, o.client_phone, o.address, o.description, o.pieces, o.notes,
  o.cod::float8 AS cod, o.payment_mode, o.delivery_fee::float8 AS delivery_fee, o.amount_to_remit::float8 AS amount_to_remit, o.weight::float8 AS weight,
  o.attempts, o.in_stock, o.flagged_at, o.rdv_at, o.created_at, o.updated_at, o.sender_name, o.sender_phone,
  sh.shop_name, sh.address AS pickup_address, d.name AS driver_name, d.phone AS driver_phone,
  dc.name AS dest_city_name, coalesce(z.name, o.zone) AS zone_name, gv.name AS dest_governorate, oa.name AS origin_agency_name, ca.name AS current_agency_name,
  (SELECT max(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.status = 'livre') AS delivered_at,
  (SELECT p.type FROM parcel_problems p WHERE p.order_id = o.id AND p.status = 'open' ORDER BY p.id DESC LIMIT 1) AS open_problem,
  (SELECT string_agg(m.ref, ', ' ORDER BY m.id) FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id WHERE i.order_id = o.id AND m.stage <> 5) AS manifests`;
const FROM = `FROM orders o LEFT JOIN users sh ON sh.id = o.shop_id LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN governorates gv ON gv.id = dc.governorate_id LEFT JOIN zones z ON z.id = o.zone_id
  LEFT JOIN agencies oa ON oa.id = o.origin_agency_id LEFT JOIN agencies ca ON ca.id = o.current_agency_id`;
const SORTS = { created_desc: 'o.created_at DESC, o.id DESC', created_asc: 'o.created_at, o.id', updated_desc: 'o.updated_at DESC, o.id DESC', cod_desc: 'o.cod DESC, o.id DESC', attempts_desc: 'o.attempts DESC, o.id DESC', ref: 'o.ref' };

route('GET', '/parcels', STAFF, async ({ user, query }) => {
  const size = [25, 50, 100, 200].includes(int(query.size)) ? int(query.size) : 50, page = Math.max(int(query.page) || 1, 1);
  const s = new Sql(), w = filters(user, query, s);
  const total = (await one(`SELECT count(*)::int AS n FROM orders o WHERE ${w}`, s.v)).n;
  const sum = await one(`SELECT coalesce(sum(o.cod), 0)::float8 AS cod FROM orders o WHERE ${w}`, s.v);
  const rows = await q(`SELECT ${COLS} ${FROM} WHERE ${w} ORDER BY ${SORTS[query.sort] || SORTS.created_desc} LIMIT ${size} OFFSET ${(page - 1) * size}`, s.v);
  const refs = list(query.refs).map(refFromCode);
  const notFound = refs.length ? refs.filter(r => !rows.some(x => x.ref.toUpperCase() === r || (x.external_ref || '').toUpperCase() === r)) : [];
  return { total, page, size, pages: Math.max(1, Math.ceil(total / size)), cod_total: sum.cod, rows, ...(refs.length && total <= size ? { not_found: notFound } : {}) };
});

/** Export of every filtered parcel (capped), for the Excel file built in the browser. */
route('GET', '/parcels/export', STAFF, async ctx => {
  const s = new Sql(), w = filters(ctx.user, ctx.query, s);
  const rows = await q(`SELECT ${COLS} ${FROM} WHERE ${w} ORDER BY ${SORTS[ctx.query.sort] || SORTS.created_desc} LIMIT 20000`, s.v);
  await audit(ctx, 'parcels.export', 'order', null, null, { rows: rows.length, filters: Object.fromEntries(Object.entries(ctx.query).filter(([k]) => k !== 'refs')) });
  return { rows, capped: rows.length === 20000 };
});

/** Full parcel rows for labels (A6 / A4 / Zebra). */
route('POST', '/parcels/labels', STAFF, async ({ user, body }) => {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(int).filter(Boolean).slice(0, 500);
  if (!ids.length) fail(400, 'Aucun colis sélectionné.');
  const s = new Sql([ids]);
  return { orders: await q(`${ORDER_SELECT} WHERE o.id = ANY($1::int[]) AND ${scopeWhere(user, 'orders', s)} ORDER BY o.ref`, s.v) };
});

/**
 * Bulk status update (« mise à jour en masse »): every parcel goes through the state machine on its own
 * (own transaction), so one refused transition never blocks the others; the report lists both.
 */
route('POST', '/parcels/bulk-status', STAFF, async ctx => {
  const { user, body } = ctx;
  const to = str(body.status, 30);
  if (!STATUSES.includes(to)) fail(400, 'Statut invalide.');
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(int).filter(Boolean))].slice(0, 500);
  if (!ids.length) fail(400, 'Aucun colis sélectionné.');
  const note = str(body.note, 500) || null;
  const done = [], errors = [];
  for (const id of ids) {
    try {
      await tx(async () => {
        const s = new Sql([id]);
        const o = await one(`SELECT o.* FROM orders o WHERE o.id = $1 AND ${scopeWhere(user, 'orders', s)} FOR UPDATE`, s.v);
        if (!o) fail(404, `Colis #${id} introuvable.`);
        if (o.status === to) fail(409, `${o.ref} est déjà « ${to} ».`);
        await changeStatus(o, to, { user, note });
        done.push(o.ref);
      });
    } catch (e) { if (e.status) errors.push(e.message); else throw e; }
  }
  await audit(ctx, 'parcels.bulk_status', 'order', null, null, { status: to, note, done, errors: errors.length });
  return { done, errors };
});

/** Status × agency / shop / driver matrix (counts), inside the perimeter. */
route('GET', '/parcels/matrix', STAFF, async ({ user, query }) => {
  const by = ['agency', 'shop', 'driver', 'city'].includes(query.by) ? query.by : 'agency';
  const key = { agency: 'coalesce(ca.name, oa.name)', shop: "coalesce(sh.shop_name, '—')", driver: "coalesce(d.name, '— sans livreur —')", city: "coalesce(dc.name, '—')" }[by];
  const s = new Sql(), w = filters(user, query, s);
  const rows = await q(`SELECT ${key} AS k, o.status, count(*)::int AS n ${FROM} WHERE ${w} GROUP BY 1, 2`, s.v);
  const keys = [...new Set(rows.map(r => r.k))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  const statuses = STATUSES.filter(st => rows.some(r => r.status === st));
  const cell = (k, st) => rows.find(r => r.k === k && r.status === st)?.n || 0;
  return { by, statuses, rows: keys.map(k => ({ key: k, counts: Object.fromEntries(statuses.map(st => [st, cell(k, st)])), total: statuses.reduce((a, st) => a + cell(k, st), 0) })) };
});
