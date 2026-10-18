// Agency fleet management (manager / admin): drivers' performance table, driver profile (missions, pickups, cash,
// history, performance), bulk assignment / unassignment through the state machine, parcels waiting for a driver,
// messages to a driver. Everything is restricted to the agency of the manager (admin: chosen agency).
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { str, int, Sql, TZ, TODAY, defaultAgency } from '../domain.js';
import { ACTIVE, DRIVER_EXCEPTIONS, changeStatus } from '../status.js';
import { STAFF, scopeAgency, scopeWhere } from '../scope.js';
import { audit } from '../audit.js';
import { handlingAgencyOf } from '../assign.js';
import { notify } from '../notify.js';

const FAILED = ['absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte'];
const IN_HAND = [...ACTIVE, ...DRIVER_EXCEPTIONS, 'retour'];
const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
async function fleetAgency(user, requested) {
  const id = scopeAgency(user, requested) || (user.role === 'admin' ? (await defaultAgency())?.id : null);
  if (!id) fail(400, 'Choisissez une agence.');
  return id;
}
async function agencyDriver(user, id) {
  const d = await one(`SELECT id, name, phone, agency_id, active, status, vehicle, zone_id, last_seen, battery, lat, lng, gps_consent_at, created_at FROM users WHERE id = $1 AND role = 'driver'`, [int(id)]);
  if (!d) fail(404, 'Livreur introuvable.');
  if (user.role === 'manager' && d.agency_id !== user.agency_id) fail(404, 'Livreur introuvable.');
  return d;
}
/** Period filter on event dates: explicit range, else the last `days` days (default 30). */
function period(query) {
  const from = isoDate(query.from), to = isoDate(query.to);
  if (from && to) return { sql: d => `(${d} AT TIME ZONE '${TZ}')::date BETWEEN '${from}'::date AND '${to}'::date`, label: { from, to } };
  const days = Math.min(Math.max(int(query.days) || 30, 1), 366);
  return { sql: d => `${d} > now() - interval '${days} days'`, label: { days } };
}
/** Performance block of one driver over the period (from the status history). */
const PERF = p => `
  (SELECT count(DISTINCT e.order_id) FROM order_events e WHERE e.user_id = u.id AND ${p('e.created_at')})::int AS assigned,
  (SELECT count(*) FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.status = 'livre' AND o.driver_id = u.id AND ${p('e.created_at')})::int AS delivered,
  (SELECT count(*) FROM order_events e WHERE e.user_id = u.id AND e.status = ANY('{${FAILED.join(',')}}'::text[]) AND ${p('e.created_at')})::int AS failed,
  (SELECT count(*) FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.status = 'livre' AND o.driver_id = u.id AND o.attempts = 0 AND ${p('e.created_at')})::int AS first_pass,
  (SELECT round(avg(EXTRACT(EPOCH FROM (e.created_at - (SELECT max(a.created_at) FROM order_events a WHERE a.order_id = e.order_id AND a.status = 'livraison' AND a.created_at <= e.created_at))) / 60))
     FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.status = 'livre' AND o.driver_id = u.id AND ${p('e.created_at')})::int AS avg_route_min,
  (SELECT coalesce(sum(o.cod), 0) FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.status = 'livre' AND o.driver_id = u.id AND o.payment_mode <> 'prepaid' AND ${p('e.created_at')})::float8 AS cod_period,
  (SELECT count(*) FROM parcel_problems pp WHERE pp.driver_id = u.id AND ${p('pp.created_at')})::int AS problems,
  (SELECT count(*) FROM order_calls c WHERE c.user_id = u.id AND ${p('c.created_at')})::int AS calls,
  (SELECT round(avg(r.stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id AND ${p('r.created_at')}) AS rating,
  (SELECT count(*) FROM claims cl WHERE cl.driver_id = u.id AND ${p('cl.created_at')})::int AS claims`;
/** Cash held by the driver: COD of delivered parcels (all time) − what he already handed over. */
const CASH = `
  (SELECT coalesce(sum(o.cod), 0) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.payment_mode <> 'prepaid')::float8 AS collected_total,
  (SELECT coalesce(sum(c.amount), 0) FROM cash_tx c WHERE c.driver_id = u.id AND c.type = 'Encaissement')::float8 AS remitted_total`;

route('GET', '/fleet/drivers', STAFF, async ({ user, query }) => {
  const ag = await fleetAgency(user, query.agency_id), p = period(query);
  const rows = await q(
    `SELECT u.id, u.name, u.phone, u.active, u.status, u.vehicle, u.last_seen, u.battery, u.lat, u.lng, z.name AS zone_name,
            (u.last_seen IS NULL OR u.last_seen < now() - interval '15 minutes') AS stale,
            (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = ANY($2::text[]))::int AS active_count,
            (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND NOT o.in_stock AND o.status = ANY($3::text[]))::int AS in_hand,
            (SELECT count(*) FROM order_events e JOIN orders o ON o.id = e.order_id WHERE e.status = 'livre' AND o.driver_id = u.id AND e.created_at >= ${TODAY})::int AS today_delivered,
            (SELECT count(*) FROM order_events e WHERE e.user_id = u.id AND e.status = ANY($4::text[]) AND e.created_at >= ${TODAY})::int AS today_failed,
            ${CASH}, ${PERF(p.sql)}
     FROM users u LEFT JOIN zones z ON z.id = u.zone_id WHERE u.role = 'driver' AND u.agency_id = $1 ORDER BY u.active DESC, u.name`, [ag, ACTIVE, IN_HAND, FAILED]);
  const drivers = rows.map(d => ({ ...d, to_remit: Math.round((d.collected_total - d.remitted_total) * 1000) / 1000,
    success_rate: d.delivered + d.failed ? Math.round(d.delivered / (d.delivered + d.failed) * 1000) / 10 : null,
    first_pass_rate: d.delivered ? Math.round(d.first_pass / d.delivered * 1000) / 10 : null }));
  const sum = k => drivers.reduce((a, d) => a + (d[k] || 0), 0);
  return { agency_id: ag, period: p.label, drivers,
    totals: { drivers: drivers.filter(d => d.active).length, on_duty: drivers.filter(d => d.active && ['dispo', 'livraison'].includes(d.status)).length,
      in_hand: sum('in_hand'), today_delivered: sum('today_delivered'), today_failed: sum('today_failed'), to_remit: Math.round(sum('to_remit') * 1000) / 1000,
      delivered: sum('delivered'), failed: sum('failed') } };
});

route('GET', '/fleet/drivers/:id', STAFF, async ({ user, params, query }) => {
  const d = await agencyDriver(user, params.id), p = period(query);
  const [perf, missions, pickups, history, remits, daily, reviews, zone] = await Promise.all([
    one(`SELECT ${CASH}, ${PERF(p.sql)} FROM users u WHERE u.id = $1`, [d.id]),
    q(`SELECT o.id, o.ref, o.status, o.client_name, o.client_phone, o.address, o.cod::float8 AS cod, o.payment_mode, o.in_stock, o.attempts, o.rdv_at, o.kind,
              coalesce(z.name, o.zone) AS zone_name, dc.name AS dest_city_name, sh.shop_name, o.updated_at
       FROM orders o LEFT JOIN zones z ON z.id = o.zone_id LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN users sh ON sh.id = o.shop_id
       WHERE o.driver_id = $1 AND o.status = ANY($2::text[]) ORDER BY o.updated_at`, [d.id, IN_HAND]),
    q(`SELECT m.id, m.ref, m.type, m.stage, m.created_at, sh.shop_name, (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id)::int AS n
       FROM manifests m LEFT JOIN users sh ON sh.id = m.shop_id WHERE m.driver_id = $1 AND m.stage IN (0, 1, 2, 3) ORDER BY m.created_at DESC LIMIT 20`, [d.id]),
    q(`SELECT e.created_at, e.status, e.note, o.id AS order_id, o.ref, o.client_name, o.cod::float8 AS cod
       FROM order_events e JOIN orders o ON o.id = e.order_id
       WHERE (e.user_id = $1 OR (e.status = 'affecte' AND o.driver_id = $1)) ORDER BY e.created_at DESC, e.id DESC LIMIT 80`, [d.id]),
    q(`SELECT c.id, c.label, c.amount::float8 AS amount, c.created_at, u.name AS by_name, m.ref AS manifest_ref FROM cash_tx c LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN manifests m ON m.id = c.manifest_id WHERE c.driver_id = $1 AND c.type = 'Encaissement' ORDER BY c.created_at DESC LIMIT 30`, [d.id]),
    q(`SELECT to_char((e.created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day, count(*) FILTER (WHERE e.status = 'livre')::int AS delivered,
              count(*) FILTER (WHERE e.status = ANY($2::text[]))::int AS failed
       FROM order_events e JOIN orders o ON o.id = e.order_id WHERE o.driver_id = $1 AND e.created_at > now() - interval '30 days'
         AND (e.status = 'livre' OR e.status = ANY($2::text[])) GROUP BY 1 ORDER BY 1`, [d.id, FAILED]),
    q(`SELECT r.stars, r.comment, r.created_at, o.ref FROM reviews r JOIN orders o ON o.id = r.order_id WHERE r.driver_id = $1 ORDER BY r.created_at DESC LIMIT 10`, [d.id]),
    d.zone_id ? one(`SELECT name FROM zones WHERE id = $1`, [d.zone_id]) : null,
  ]);
  return { driver: { ...d, zone_name: zone?.name || null }, period: p.label,
    perf: { ...perf, to_remit: Math.round((perf.collected_total - perf.remitted_total) * 1000) / 1000,
      success_rate: perf.delivered + perf.failed ? Math.round(perf.delivered / (perf.delivered + perf.failed) * 1000) / 10 : null,
      first_pass_rate: perf.delivered ? Math.round(perf.first_pass / perf.delivered * 1000) / 10 : null },
    missions, pickups, history, remits, daily, reviews };
});

/** Parcels of the agency waiting for a driver (local deliveries ready, arrived inter-city parcels, exchange pickups). */
route('GET', '/fleet/unassigned', STAFF, async ({ user, query }) => {
  const ag = await fleetAgency(user, query.agency_id);
  const rows = await q(
    `SELECT o.id, o.ref, o.status, o.kind, o.client_name, o.client_phone, o.address, o.cod::float8 AS cod, o.payment_mode, o.in_stock, o.attempts, o.rdv_at,
            o.zone_id, coalesce(z.name, o.zone) AS zone_name, dc.name AS dest_city_name, sh.shop_name, o.created_at, o.updated_at, o.weight::float8 AS weight,
            o.origin_city_id, o.dest_city_id, o.origin_agency_id, o.dest_agency_id, o.current_agency_id
     FROM orders o LEFT JOIN zones z ON z.id = o.zone_id LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN users sh ON sh.id = o.shop_id
     WHERE o.driver_id IS NULL AND o.status IN ('attente','en_agence','arrive') AND (o.origin_agency_id = $1 OR o.dest_agency_id = $1)
     ORDER BY o.rdv_at NULLS LAST, o.created_at LIMIT 500`, [ag]);
  return { agency_id: ag, parcels: rows.filter(o => handlingAgencyOf(o) === ag) };
});

/** Bulk assignment: each parcel goes through the state machine on its own; refused ones are listed. */
route('POST', '/fleet/assign', STAFF, async ctx => {
  const { user, body } = ctx;
  const ids = [...new Set((Array.isArray(body.order_ids) ? body.order_ids : []).map(int).filter(Boolean))].slice(0, 300);
  if (!ids.length) fail(400, 'Aucun colis sélectionné.');
  const d = await agencyDriver(user, body.driver_id);
  if (!d.active) fail(409, `${d.name} est désactivé.`);
  const done = [], errors = [];
  for (const id of ids) {
    try {
      await tx(async () => {
        const s = new Sql([id]);
        const o = await one(`SELECT o.* FROM orders o WHERE o.id = $1 AND ${scopeWhere(user, 'orders', s)} FOR UPDATE`, s.v);
        if (!o) fail(404, `Colis #${id} introuvable.`);
        if (handlingAgencyOf(o) !== d.agency_id) fail(409, `${o.ref} est traité par une autre agence.`);
        if (o.driver_id === d.id && o.status === 'affecte') fail(409, `${o.ref} est déjà affecté à ${d.name}.`);
        await changeStatus(o, 'affecte', { user, driver: { id: d.id, name: d.name } });
        done.push(o.ref);
      });
    } catch (e) { if (e.status) errors.push(e.message); else throw e; }
  }
  await audit(ctx, 'fleet.assign', 'user', d.id, null, { driver: d.name, done, errors: errors.length });
  return { done, errors };
});

/** Takes parcels back from a driver who has not started them (still « affecté »). */
route('POST', '/fleet/unassign', STAFF, async ctx => {
  const { user, body } = ctx;
  const ids = [...new Set((Array.isArray(body.order_ids) ? body.order_ids : []).map(int).filter(Boolean))].slice(0, 300);
  if (!ids.length) fail(400, 'Aucun colis sélectionné.');
  const note = str(body.note, 300) || 'Désaffecté par l’agence';
  const done = [], errors = [];
  for (const id of ids) {
    try {
      await tx(async () => {
        const s = new Sql([id]);
        const o = await one(`SELECT o.* FROM orders o WHERE o.id = $1 AND ${scopeWhere(user, 'orders', s)} FOR UPDATE`, s.v);
        if (!o) fail(404, `Colis #${id} introuvable.`);
        if (o.status !== 'affecte') fail(409, `${o.ref} : déjà pris en charge par le livreur (« ${o.status} »).`);
        // in the agency → back on the shelf; still at the shop → waiting for a new pickup
        await changeStatus(o, o.in_stock ? 'en_agence' : 'attente', { user, note });
        if (o.in_stock) await q(`UPDATE orders SET driver_id = NULL WHERE id = $1`, [o.id]);
        done.push(o.ref);
      });
    } catch (e) { if (e.status) errors.push(e.message); else throw e; }
  }
  await audit(ctx, 'fleet.unassign', 'order', null, null, { done, errors: errors.length, note });
  return { done, errors };
});

/** In-app message from the agency to one driver. */
route('POST', '/fleet/drivers/:id/message', STAFF, async ctx => {
  const d = await agencyDriver(ctx.user, ctx.params.id);
  const text = str(ctx.body.text, 500);
  if (!text) fail(400, 'Message vide.');
  await notify('inapp', { userIds: [d.id], type: 'agency.message', title: `Message de ${ctx.user.name}`, body: text });
  await audit(ctx, 'fleet.message', 'user', d.id, null, { text });
  return { ok: true };
});
