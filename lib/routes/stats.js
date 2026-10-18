// Dashboard overview + statistics, restricted to the user's perimeter (admin: optional ?agency_id filter).
import { route } from '../http.js';
import { q, one } from '../db.js';
import { ORDER_SELECT, TZ, TODAY, Sql, int } from '../domain.js';
import { fail } from '../auth.js';
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
    q(`SELECT m.*, oa.name AS origin_agency_name, da.name AS dest_agency_name,
              (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id)::int AS n,
              (SELECT count(*) FROM manifest_items i WHERE i.manifest_id = m.id AND i.received_at IS NOT NULL)::int AS received
       FROM manifests m LEFT JOIN agencies oa ON oa.id = m.origin_agency_id LEFT JOIN agencies da ON da.id = m.dest_agency_id
       WHERE ${mw} ORDER BY m.created_at DESC LIMIT 50`, mv),
    q(`SELECT c.id, c.category, c.text, c.status, c.internal_note, c.created_at, c.updated_at, o.ref AS order_ref, o.client_name, d.name AS driver_name
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
           coalesce(sum(o.cod) FILTER (WHERE o.status = 'livre'), 0)::float8 AS cod_delivered,
           coalesce(sum(o.amount_to_remit) FILTER (WHERE o.status = 'livre'), 0)::float8 AS remit_delivered,
           coalesce(sum(o.amount_to_remit) FILTER (WHERE o.status = 'livre' AND o.updated_at >= ${TODAY}), 0)::float8 AS remit_today,
           coalesce(sum(o.saden_revenue) FILTER (WHERE o.status = 'livre' AND o.updated_at >= ${TODAY}), 0)::float8 AS saden_today,
           coalesce(sum(o.driver_share) FILTER (WHERE o.status = 'livre' AND o.updated_at >= ${TODAY}), 0)::float8 AS drivers_today,
           coalesce(sum(o.delivery_fee) FILTER (WHERE o.status = 'livre' AND o.updated_at >= ${TODAY}), 0)::float8 AS fees_today
         FROM orders o WHERE ${ow}`, ov),
  ]);
  const ratingsBy = {
    agencies: await q(`SELECT ag.name, round(avg(r.stars)::numeric, 2)::float8 AS avg, count(*)::int AS n FROM reviews r JOIN orders o ON o.id = r.order_id
                       JOIN agencies ag ON ag.id = coalesce(o.dest_agency_id, o.origin_agency_id) WHERE r.created_at > now() - interval '30 days' AND ${ow} GROUP BY ag.name ORDER BY avg DESC`, ov),
    cities: await q(`SELECT dc.name, round(avg(r.stars)::numeric, 2)::float8 AS avg, count(*)::int AS n FROM reviews r JOIN orders o ON o.id = r.order_id
                     JOIN cities dc ON dc.id = o.dest_city_id WHERE r.created_at > now() - interval '30 days' AND ${ow} GROUP BY dc.name ORDER BY avg DESC`, ov),
  };
  return { ratingsBy, orders, drivers, shops, manifests, claims, ratings, cash: { tx: cashTx, ...cashAgg, cod_delivered: kpis.cod_delivered, remit_delivered: kpis.remit_delivered }, kpis };
});

// §24 — statistics with filters: period (preset or from/to), agency, city, driver, shop. All values are bound parameters.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FINALS = ['livre', 'absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte', 'endommage', 'perdu', 'annule', 'retour', 'retour_agence', 'restitue'];

route('GET', '/stats', STAFF, async ({ user, query }) => {
  const p = Number(query.period) || 0;
  const custom = DATE_RE.test(query.from || '') && DATE_RE.test(query.to || '');
  const days = custom ? null : [14, 7, 84][p] ?? 14;
  if (custom && (query.from > query.to)) fail(400, 'Période invalide (début après fin).');

  /** WHERE clause of the filtered orders (scope + filters + creation period), on a fresh parameter list. */
  const filtered = (withDates = true) => {
    const s = new Sql();
    const w = [scopeWhere(user, 'orders', s, { agency: query.agency_id })];
    if (int(query.city_id)) w.push(`o.dest_city_id = ${s.p(int(query.city_id))}`);
    if (int(query.driver_id)) w.push(`o.driver_id = ${s.p(int(query.driver_id))}`);
    if (int(query.shop_id)) w.push(`o.shop_id = ${s.p(int(query.shop_id))}`);
    if (withDates) {
      if (custom) w.push(`o.created_at >= (${s.p(query.from)}::date)::timestamp AT TIME ZONE '${TZ}'`, `o.created_at < ((${s.p(query.to)}::date) + 1)::timestamp AT TIME ZONE '${TZ}'`);
      else w.push(`o.created_at > now() - make_interval(days => ${s.p(days)})`);
    }
    return [w.join(' AND '), s];
  };

  // time buckets: days, or weeks for long ranges
  const span = custom ? (new Date(query.to) - new Date(query.from)) / 864e5 + 1 : days;
  if (span > 400) fail(400, 'Période trop longue (400 jours max).');
  const unit = span > 45 ? 'week' : 'day';
  const [bw, bs] = filtered(false);
  const fromExpr = custom ? `${bs.p(query.from)}::date::timestamp` : `date_trunc('day', now() AT TIME ZONE '${TZ}') - make_interval(days => ${bs.p(days - 1)})`;
  const toExpr = custom ? `${bs.p(query.to)}::date::timestamp` : `date_trunc('day', now() AT TIME ZONE '${TZ}')`;
  const bars = q(
    `SELECT CASE WHEN '${unit}' = 'week' THEN 'S' || to_char(d, 'IW') ELSE to_char(d, 'DD/MM') END AS l,
            (SELECT count(*) FROM order_events e JOIN orders o ON o.id = e.order_id
              WHERE e.status = 'livre' AND e.created_at >= d AT TIME ZONE '${TZ}' AND e.created_at < (d + interval '1 ${unit}') AT TIME ZONE '${TZ}' AND ${bw})::int AS v
     FROM generate_series(date_trunc('${unit}', ${fromExpr}), ${toExpr}, interval '1 ${unit}') d ORDER BY d`, bs.v);

  const [fw, fs] = filtered();
  const F = `orders o WHERE ${fw}`;
  const [k, zones, cities, shops, top, ratingAg, ratingCity] = await Promise.all([
    one(`SELECT count(*)::int AS total,
           count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE o.status = ANY('{${FINALS.join(',')}}'::text[]))::int AS finals,
           count(*) FILTER (WHERE o.status = 'refuse')::int AS refused,
           count(*) FILTER (WHERE o.status IN ('retour','retour_agence','restitue','refuse'))::int AS returns,
           count(*) FILTER (WHERE o.status = 'annule')::int AS cancelled,
           count(*) FILTER (WHERE o.status IN ('absent','reporte','numero_incorrect','adresse_incorrecte','endommage','perdu'))::int AS incidents,
           coalesce(sum(o.delivery_fee) FILTER (WHERE o.status = 'livre'), 0)::float8 AS revenue,
           coalesce(sum(o.saden_revenue) FILTER (WHERE o.status = 'livre'), 0)::float8 AS saden_revenue,
           coalesce(sum(o.cod) FILTER (WHERE o.status = 'livre'), 0)::float8 AS cod,
           (SELECT round(avg(extract(epoch FROM e.created_at - o2.created_at) / 60))::int FROM order_events e JOIN orders o2 ON o2.id = e.order_id
              WHERE e.status = 'livre' AND o2.id IN (SELECT o.id FROM ${F})) AS avg_min
         FROM ${F}`, fs.v),
    q(`SELECT coalesce(z.name, o.zone) AS name, count(*)::int AS n,
              round(100.0 * count(*) FILTER (WHERE o.status = 'livre') / count(*))::int AS v
       FROM orders o LEFT JOIN zones z ON z.id = o.zone_id
       WHERE ${fw} AND coalesce(z.name, o.zone) IS NOT NULL AND o.status = ANY('{${FINALS.join(',')}}'::text[])
       GROUP BY 1 ORDER BY v DESC, n DESC LIMIT 15`, fs.v),
    q(`SELECT dc.name, count(*)::int AS n, count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
              coalesce(sum(o.delivery_fee) FILTER (WHERE o.status = 'livre'), 0)::float8 AS revenue
       FROM orders o JOIN cities dc ON dc.id = o.dest_city_id WHERE ${fw} GROUP BY dc.name ORDER BY n DESC LIMIT 15`, fs.v),
    q(`SELECT coalesce(s.shop_name, o.sender_name, '—') AS name, count(*)::int AS n,
              count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
              count(*) FILTER (WHERE o.status IN ('retour','retour_agence','restitue','refuse'))::int AS returns,
              coalesce(sum(o.delivery_fee) FILTER (WHERE o.status = 'livre'), 0)::float8 AS revenue
       FROM orders o LEFT JOIN users s ON s.id = o.shop_id WHERE ${fw} GROUP BY 1 ORDER BY n DESC LIMIT 20`, fs.v),
    q(`SELECT d.id, d.name, count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
              count(*) FILTER (WHERE o.status = ANY('{${FINALS.join(',')}}'::text[]))::int AS finals,
              (SELECT round(avg(r.stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = d.id AND r.order_id IN (SELECT o.id FROM ${F})) AS rating
       FROM orders o JOIN users d ON d.id = o.driver_id WHERE ${fw} GROUP BY d.id, d.name ORDER BY delivered DESC, d.name LIMIT 10`, fs.v),
    q(`SELECT ag.name, round(avg(r.stars)::numeric, 2)::float8 AS avg, count(*)::int AS n
       FROM reviews r JOIN orders o ON o.id = r.order_id JOIN agencies ag ON ag.id = coalesce(o.dest_agency_id, o.origin_agency_id)
       WHERE ${fw} GROUP BY ag.name ORDER BY avg DESC`, fs.v),
    q(`SELECT dc.name, round(avg(r.stars)::numeric, 2)::float8 AS avg, count(*)::int AS n
       FROM reviews r JOIN orders o ON o.id = r.order_id JOIN cities dc ON dc.id = o.dest_city_id
       WHERE ${fw} GROUP BY dc.name ORDER BY avg DESC`, fs.v),
  ]);
  return { bars: await bars, unit, kpis: k, zones, cities, shops, top, ratings: { agencies: ratingAg, cities: ratingCity } };
});

/**
 * Advanced statistics (parcels created in the period, default 90 days): delivery performance by attempts,
 * return / exchange rates, problems by type, claims by category, drivers, agencies comparison, top shippers,
 * distribution by governorate, daily volume.
 */
route('GET', '/stats/advanced', STAFF, async ({ user, query }) => {
  const custom = DATE_RE.test(query.from || '') && DATE_RE.test(query.to || '');
  if (custom && query.from > query.to) fail(400, 'Période invalide (début après fin).');
  const s = new Sql(), w = [scopeWhere(user, 'orders', s, { agency: query.agency_id }), `o.kind = 'delivery'`];
  if (int(query.shop_id)) w.push(`o.shop_id = ${s.p(int(query.shop_id))}`);
  if (custom) w.push(`(o.created_at AT TIME ZONE '${TZ}')::date BETWEEN ${s.p(query.from)}::date AND ${s.p(query.to)}::date`);
  else w.push(`o.created_at > now() - interval '90 days'`);
  const W = w.join(' AND '), V = s.v;
  const DELIV = `(SELECT max(e.created_at) FROM order_events e WHERE e.order_id = o.id AND e.status = 'livre')`;
  const [k, problems, claims, drivers, agencies, shops, govs, days, exch] = await Promise.all([
    one(`SELECT count(*)::int AS total,
                count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
                count(*) FILTER (WHERE o.status = 'livre' AND o.attempts = 0)::int AS first_pass,
                count(*) FILTER (WHERE o.status = 'livre' AND o.attempts > 0)::int AS multi_pass,
                count(*) FILTER (WHERE o.status IN ('retour','retour_agence','restitue'))::int AS returns,
                count(*) FILTER (WHERE o.status IN ('retour','retour_agence','restitue') AND o.attempts >= 3)::int AS returns_3,
                count(*) FILTER (WHERE o.attempts >= 3 AND o.status <> 'livre')::int AS never_3,
                round(avg(o.attempts) FILTER (WHERE o.status = 'livre'), 2)::float8 AS avg_attempts
         FROM orders o WHERE ${W}`, V),
    q(`SELECT p.type, count(*)::int AS n FROM parcel_problems p JOIN orders o ON o.id = p.order_id WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`, V),
    q(`SELECT c.category, count(*)::int AS n FROM claims c JOIN orders o ON o.id = c.order_id WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`, V),
    q(`SELECT d.id, d.name, count(*)::int AS assigned, count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
              round(avg(o.attempts) FILTER (WHERE o.status = 'livre'), 2)::float8 AS avg_attempts,
              count(*) FILTER (WHERE o.status = 'livre' AND o.attempts = 0)::int AS first_pass
       FROM orders o JOIN users d ON d.id = o.driver_id WHERE ${W} GROUP BY 1, 2 ORDER BY 4 DESC, 2 LIMIT 50`, V),
    q(`SELECT ag.name, count(*)::int AS total, count(*) FILTER (WHERE o.status = 'livre')::int AS delivered,
              count(*) FILTER (WHERE o.status IN ('retour','retour_agence','restitue'))::int AS returns,
              round(avg(EXTRACT(EPOCH FROM (${DELIV} - o.created_at)) / 86400) FILTER (WHERE o.status = 'livre')::numeric, 1)::float8 AS avg_days
       FROM orders o JOIN agencies ag ON ag.id = coalesce(o.dest_agency_id, o.origin_agency_id) WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`, V),
    q(`SELECT sh.shop_name AS name, count(*)::int AS n, count(*) FILTER (WHERE o.status = 'livre')::int AS delivered
       FROM orders o JOIN users sh ON sh.id = o.shop_id WHERE ${W} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, V),
    q(`SELECT coalesce(g.name, '—') AS name, count(*)::int AS n FROM orders o LEFT JOIN cities c ON c.id = o.dest_city_id
       LEFT JOIN governorates g ON g.id = c.governorate_id WHERE ${W} GROUP BY 1 ORDER BY 2 DESC`, V),
    q(`SELECT to_char((o.created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS d, count(*)::int AS n FROM orders o WHERE ${W} GROUP BY 1 ORDER BY 1`, V),
    one(`SELECT count(*)::int AS n FROM orders x WHERE x.kind = 'pickup' AND x.related_order_id IN (SELECT o.id FROM orders o WHERE ${W})`, V),
  ]);
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
  return {
    period: custom ? { from: query.from, to: query.to } : { days: 90 },
    kpis: { ...k, exchanges: exch.n, first_pass_pct: pct(k.first_pass, k.delivered), multi_pass_pct: pct(k.multi_pass, k.delivered),
      never_3_pct: pct(k.returns_3, k.returns), return_rate: pct(k.returns, k.total), exchange_rate: pct(exch.n, k.total), delivery_rate: pct(k.delivered, k.total) },
    problems, claims, drivers, agencies, shops, governorates: govs, days,
  };
});
