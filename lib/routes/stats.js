import { route } from '../http.js';
import { q, one } from '../db.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* admin overview */
route('GET', '/admin/overview', ['admin'], async () => {
  const [orders, drivers, shops, manifests, claims, ratings, cashTx, cashAgg, kpis] = await Promise.all([
    q(`${ORDER_SELECT} ORDER BY o.created_at DESC LIMIT 500`),
    q(`SELECT u.id, u.name, u.phone, u.active, u.zone, u.vehicle, u.status, u.lat, u.lng, u.battery, u.last_seen,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('affecte','accepte','livraison','sur_place'))::int AS active_count,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.updated_at >= ${TODAY})::int AS today,
         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating,
         (SELECT count(*) FROM reviews r WHERE r.driver_id = u.id)::int AS reviews,
         (SELECT count(*) FROM claims c WHERE c.driver_id = u.id)::int AS claims,
         (SELECT comment FROM reviews r WHERE r.driver_id = u.id AND coalesce(r.comment, '') <> '' ORDER BY r.created_at DESC LIMIT 1) AS last_comment
       FROM users u WHERE u.role = 'driver' ORDER BY u.name`),
    q(`SELECT id, name, shop_name, phone, zone, address, active FROM users WHERE role = 'shop' ORDER BY shop_name`),
    q(`SELECT m.*, (SELECT count(*) FROM orders o WHERE o.manifest_id = m.id)::int AS n FROM manifests m ORDER BY m.created_at DESC LIMIT 50`),
    q(`SELECT c.id, c.category, c.text, c.status, c.created_at, o.ref AS order_ref, o.client_name, d.name AS driver_name
       FROM claims c JOIN orders o ON o.id = c.order_id LEFT JOIN users d ON d.id = c.driver_id ORDER BY c.created_at DESC LIMIT 200`),
    one(`SELECT coalesce(round(avg(stars)::numeric, 1)::float8, 0) AS avg, count(*)::int AS n,
           count(*) FILTER (WHERE stars = 5)::int AS s5, count(*) FILTER (WHERE stars = 4)::int AS s4,
           count(*) FILTER (WHERE stars = 3)::int AS s3, count(*) FILTER (WHERE stars = 2)::int AS s2,
           count(*) FILTER (WHERE stars = 1)::int AS s1
         FROM reviews WHERE created_at > now() - interval '30 days'`),
    q(`SELECT id, label, type, amount::float8 AS amount, created_at FROM cash_tx WHERE created_at >= ${TODAY} ORDER BY created_at DESC`),
    one(`SELECT coalesce(sum(amount) FILTER (WHERE amount > 0 AND created_at >= ${TODAY}), 0)::float8 AS income,
           coalesce(-sum(amount) FILTER (WHERE type = 'Dépense' AND created_at >= ${TODAY}), 0)::float8 AS expenses,
           coalesce(sum(amount), 0)::float8 AS balance,
           coalesce(-sum(amount) FILTER (WHERE type = 'Règlement'), 0)::float8 AS settled,
           (SELECT coalesce(sum(cod), 0) FROM orders WHERE status = 'livre')::float8 AS cod_delivered
         FROM cash_tx`),
    one(`SELECT
           (SELECT count(*) FROM orders WHERE created_at >= ${TODAY})::int AS today,
           (SELECT count(*) FROM orders WHERE created_at >= ${TODAY} - interval '1 day' AND created_at < ${TODAY})::int AS yesterday,
           (SELECT count(*) FROM orders WHERE status = 'livre' AND updated_at >= ${TODAY})::int AS delivered,
           (SELECT coalesce(sum(cod), 0) FROM orders WHERE status = 'livre' AND updated_at >= ${TODAY})::float8 AS cod_today,
           (SELECT count(*) FROM orders WHERE status IN ('refuse','absent') AND updated_at >= ${TODAY})::int AS returns`),
  ]);
  return { orders, drivers, shops, manifests, claims, ratings, cash: { tx: cashTx, ...cashAgg }, kpis, agency: AGENCY_CITY, fee: FEE, driverShare: DRIVER_SHARE };
});

route('GET', '/stats', ['admin'], async ({ query }) => {
  const p = Number(query.period) || 0;
  const days = [14, 7, 84][p] ?? 14;
  const local = `now() AT TIME ZONE '${TZ}'`;
  const series = p === 2
    ? `SELECT 'S' || row_number() OVER (ORDER BY d) AS l, d AT TIME ZONE '${TZ}' AS start, (d + interval '1 week') AT TIME ZONE '${TZ}' AS stop
       FROM generate_series(date_trunc('week', ${local}) - interval '11 weeks', date_trunc('week', ${local}), interval '1 week') d`
    : `SELECT to_char(d, 'DD/MM') AS l, d AT TIME ZONE '${TZ}' AS start, (d + interval '1 day') AT TIME ZONE '${TZ}' AS stop
       FROM generate_series(date_trunc('day', ${local}) - interval '${days - 1} days', date_trunc('day', ${local}), interval '1 day') d`;
  const since = `now() - interval '${days} days'`;
  const [bars, k, zones, top] = await Promise.all([
    q(`SELECT s.l, (SELECT count(*) FROM order_events e WHERE e.status = 'livre' AND e.created_at >= s.start AND e.created_at < s.stop)::int AS v
       FROM (${series}) s ORDER BY s.start`),
    one(`SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE status IN ('livre','absent','refuse','reporte'))::int AS finals,
           count(*) FILTER (WHERE status = 'refuse')::int AS refused,
           (SELECT round(avg(extract(epoch FROM e.created_at - o.created_at) / 60))::int FROM order_events e JOIN orders o ON o.id = e.order_id
              WHERE e.status = 'livre' AND e.created_at > ${since}) AS avg_min
         FROM orders WHERE created_at > ${since}`),
    q(`SELECT zone AS name, round(100.0 * count(*) FILTER (WHERE status = 'livre') / count(*))::int AS v
       FROM orders WHERE created_at > ${since} AND zone IS NOT NULL AND status IN ('livre','absent','refuse','reporte')
       GROUP BY zone ORDER BY v DESC`),
    q(`SELECT u.id, u.name,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.updated_at > ${since})::int AS delivered,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('livre','absent','refuse','reporte') AND o.updated_at > ${since})::int AS finals,
         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating
       FROM users u WHERE u.role = 'driver' ORDER BY delivered DESC, u.name LIMIT 5`),
  ]);
  return { bars, kpis: { ...k, revenue: k.delivered * FEE }, zones, top };
});
