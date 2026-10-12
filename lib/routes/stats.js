// Dashboard overview + statistics, restricted to the user's perimeter (admin: optional ?agency_id filter).
import { route } from '../http.js';
import { q, one } from '../db.js';
import { ORDER_SELECT, FEE, DRIVER_SHARE, TZ, TODAY, Sql } from '../domain.js';
import { STAFF, scopeWhere } from '../scope.js';

/** Returns [whereSql, params] for an entity, with a fresh parameter list per query. */
const scoper = (user, query) => (entity, alias) => {
  const s = new Sql();
  return [scopeWhere(user, entity, s, { alias, agency: query.agency_id }), s.v];
};

route('GET', '/admin/overview', STAFF, async ({ user, query }) => {
  const sc = scoper(user, query);
  const [ow, ov] = sc('orders'), [dw, dv] = sc('users', 'u'), [mw, mv] = sc('manifests'), [cw, cv] = sc('cash');
  const [orders, drivers, shops, manifests, claims, ratings, cashTx, cashAgg, kpis] = await Promise.all([
    q(`${ORDER_SELECT} WHERE ${ow} ORDER BY o.created_at DESC LIMIT 500`, ov),
    q(`SELECT u.id, u.name, u.phone, u.active, u.agency_id, u.zone_id, z.name AS zone, u.vehicle, u.status, u.lat, u.lng, u.battery, u.last_seen,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('affecte','accepte','livraison','sur_place'))::int AS active_count,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.updated_at >= ${TODAY})::int AS today,
         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating,
         (SELECT count(*) FROM reviews r WHERE r.driver_id = u.id)::int AS reviews,
         (SELECT count(*) FROM claims c WHERE c.driver_id = u.id)::int AS claims,
         (SELECT comment FROM reviews r WHERE r.driver_id = u.id AND coalesce(r.comment, '') <> '' ORDER BY r.created_at DESC LIMIT 1) AS last_comment
       FROM users u LEFT JOIN zones z ON z.id = u.zone_id WHERE u.role = 'driver' AND ${dw} ORDER BY u.name`, dv),
    q(`SELECT u.id, u.name, u.shop_name, u.phone, u.agency_id, u.zone_id, u.address, u.active FROM users u WHERE u.role = 'shop' AND ${dw} ORDER BY u.shop_name`, dv),
    q(`SELECT m.*, (SELECT count(*) FROM orders o WHERE o.manifest_id = m.id)::int AS n FROM manifests m WHERE ${mw} ORDER BY m.created_at DESC LIMIT 50`, mv),
    q(`SELECT c.id, c.category, c.text, c.status, c.created_at, o.ref AS order_ref, o.client_name, d.name AS driver_name
       FROM claims c JOIN orders o ON o.id = c.order_id LEFT JOIN users d ON d.id = c.driver_id WHERE ${ow} ORDER BY c.created_at DESC LIMIT 200`, ov),
    one(`SELECT coalesce(round(avg(stars)::numeric, 1)::float8, 0) AS avg, count(*)::int AS n,
           count(*) FILTER (WHERE stars = 5)::int AS s5, count(*) FILTER (WHERE stars = 4)::int AS s4,
           count(*) FILTER (WHERE stars = 3)::int AS s3, count(*) FILTER (WHERE stars = 2)::int AS s2,
           count(*) FILTER (WHERE stars = 1)::int AS s1
         FROM reviews r JOIN orders o ON o.id = r.order_id WHERE r.created_at > now() - interval '30 days' AND ${ow}`, ov),
    q(`SELECT c.id, c.label, c.type, c.amount::float8 AS amount, c.created_at FROM cash_tx c WHERE c.created_at >= ${TODAY} AND ${cw} ORDER BY c.created_at DESC`, cv),
    one(`SELECT coalesce(sum(amount) FILTER (WHERE amount > 0 AND created_at >= ${TODAY}), 0)::float8 AS income,
           coalesce(-sum(amount) FILTER (WHERE type = 'Dépense' AND created_at >= ${TODAY}), 0)::float8 AS expenses,
           coalesce(sum(amount), 0)::float8 AS balance,
           coalesce(-sum(amount) FILTER (WHERE type = 'Règlement'), 0)::float8 AS settled
         FROM cash_tx c WHERE ${cw}`, cv),
    one(`SELECT
           count(*) FILTER (WHERE o.created_at >= ${TODAY})::int AS today,
           count(*) FILTER (WHERE o.created_at >= ${TODAY} - interval '1 day' AND o.created_at < ${TODAY})::int AS yesterday,
           count(*) FILTER (WHERE o.status = 'livre' AND o.updated_at >= ${TODAY})::int AS delivered,
           coalesce(sum(o.cod) FILTER (WHERE o.status = 'livre' AND o.updated_at >= ${TODAY}), 0)::float8 AS cod_today,
           count(*) FILTER (WHERE o.status IN ('refuse','absent') AND o.updated_at >= ${TODAY})::int AS returns,
           coalesce(sum(o.cod) FILTER (WHERE o.status = 'livre'), 0)::float8 AS cod_delivered
         FROM orders o WHERE ${ow}`, ov),
  ]);
  return { orders, drivers, shops, manifests, claims, ratings, cash: { tx: cashTx, ...cashAgg, cod_delivered: kpis.cod_delivered }, kpis, fee: FEE, driverShare: DRIVER_SHARE };
});

route('GET', '/stats', STAFF, async ({ user, query }) => {
  const sc = scoper(user, query);
  const p = Number(query.period) || 0;
  const days = [14, 7, 84][p] ?? 14;
  const local = `now() AT TIME ZONE '${TZ}'`;
  const series = p === 2
    ? `SELECT 'S' || row_number() OVER (ORDER BY d) AS l, d AT TIME ZONE '${TZ}' AS start, (d + interval '1 week') AT TIME ZONE '${TZ}' AS stop
       FROM generate_series(date_trunc('week', ${local}) - interval '11 weeks', date_trunc('week', ${local}), interval '1 week') d`
    : `SELECT to_char(d, 'DD/MM') AS l, d AT TIME ZONE '${TZ}' AS start, (d + interval '1 day') AT TIME ZONE '${TZ}' AS stop
       FROM generate_series(date_trunc('day', ${local}) - interval '${days - 1} days', date_trunc('day', ${local}), interval '1 day') d`;
  const since = `now() - interval '${days} days'`;
  const [ow, ov] = sc('orders'), [uw, uv] = sc('users', 'u');
  const [bars, k, zones, top] = await Promise.all([
    q(`SELECT s.l, (SELECT count(*) FROM order_events e JOIN orders o ON o.id = e.order_id
                    WHERE e.status = 'livre' AND e.created_at >= s.start AND e.created_at < s.stop AND ${ow})::int AS v
       FROM (${series}) s ORDER BY s.start`, ov),
    one(`SELECT count(*)::int AS total,
           count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE o.status IN ('livre','absent','refuse','reporte'))::int AS finals,
           count(*) FILTER (WHERE o.status = 'refuse')::int AS refused,
           (SELECT round(avg(extract(epoch FROM e.created_at - o2.created_at) / 60))::int FROM order_events e JOIN orders o2 ON o2.id = e.order_id
              WHERE e.status = 'livre' AND e.created_at > ${since} AND o2.id IN (SELECT o.id FROM orders o WHERE ${ow})) AS avg_min
         FROM orders o WHERE o.created_at > ${since} AND ${ow}`, ov),
    q(`SELECT coalesce(z.name, o.zone) AS name, round(100.0 * count(*) FILTER (WHERE o.status = 'livre') / count(*))::int AS v
       FROM orders o LEFT JOIN zones z ON z.id = o.zone_id
       WHERE o.created_at > ${since} AND coalesce(z.name, o.zone) IS NOT NULL AND o.status IN ('livre','absent','refuse','reporte') AND ${ow}
       GROUP BY 1 ORDER BY v DESC`, ov),
    q(`SELECT u.id, u.name,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.updated_at > ${since})::int AS delivered,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('livre','absent','refuse','reporte') AND o.updated_at > ${since})::int AS finals,
         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating
       FROM users u WHERE u.role = 'driver' AND ${uw} ORDER BY delivered DESC, u.name LIMIT 5`, uv),
  ]);
  return { bars, kpis: { ...k, revenue: k.delivered * FEE }, zones, top };
});
