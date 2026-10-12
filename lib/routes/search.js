// §28 — global search inside the user's perimeter: parcel ref, phone (normalised), client, sender,
// external reference, bordereau, shop, driver. Results grouped by type, 20 max each.
import { route } from '../http.js';
import { q } from '../db.js';
import { str, Sql } from '../domain.js';
import { STAFF, scopeWhere } from '../scope.js';
import { refFromCode } from './scan.js';

const like = v => '%' + v.replace(/[\\%_]/g, m => '\\' + m) + '%';

route('GET', '/search', STAFF, async ({ user, query }) => {
  const raw = str(query.q, 100);
  if (raw.length < 2) return { orders: [], manifests: [], shops: [], drivers: [], exact: null };
  const text = refFromCode(raw).length && /[?&]t=/.test(raw) ? refFromCode(raw) : raw;   // scanned tracking URL → ref
  const digits = text.replace(/\D/g, '');
  const phone = digits.length >= 4 ? digits.slice(-8) : null;

  const so = new Sql(), pat = so.p(like(text)), ph = phone ? so.p(like(phone)) : null;
  const orders = q(
    `SELECT o.id, o.ref, o.external_ref, o.client_name, o.client_phone, o.sender_name, o.status, o.created_at, s.shop_name, dc.name AS dest_city_name
     FROM orders o LEFT JOIN users s ON s.id = o.shop_id LEFT JOIN cities dc ON dc.id = o.dest_city_id
     WHERE ${scopeWhere(user, 'orders', so, { agency: query.agency_id })}
       AND (o.ref ILIKE ${pat} OR o.external_ref ILIKE ${pat} OR o.client_name ILIKE ${pat} OR o.sender_name ILIKE ${pat}
            OR s.shop_name ILIKE ${pat} ${ph ? `OR regexp_replace(o.client_phone, '\\D', '', 'g') LIKE ${ph} OR regexp_replace(coalesce(o.sender_phone, ''), '\\D', '', 'g') LIKE ${ph}` : ''})
     ORDER BY (upper(o.ref) = upper(${so.p(text)})) DESC, o.created_at DESC LIMIT 20`, so.v);

  const sm = new Sql(), mp = sm.p(like(text));
  const manifests = q(
    `SELECT m.id, m.ref, m.type, m.stage, m.from_city, m.to_city, m.created_at FROM manifests m
     WHERE ${scopeWhere(user, 'manifests', sm, { agency: query.agency_id })} AND m.ref ILIKE ${mp} ORDER BY m.created_at DESC LIMIT 20`, sm.v);

  const people = role => {
    const s = new Sql(), p1 = s.p(like(text)), p2 = phone ? s.p(like(phone)) : null;
    return q(`SELECT u.id, u.name, u.shop_name, u.phone, u.status, u.active FROM users u
              WHERE u.role = ${s.p(role)} AND ${scopeWhere(user, 'users', s, { agency: query.agency_id })}
                AND (u.name ILIKE ${p1} OR coalesce(u.shop_name, '') ILIKE ${p1} ${p2 ? `OR u.phone LIKE ${p2}` : ''})
              ORDER BY coalesce(u.shop_name, u.name) LIMIT 20`, s.v);
  };
  const [o, m, shops, drivers] = await Promise.all([orders, manifests, people('shop'), people('driver')]);
  const exactOrder = o.find(x => x.ref.toUpperCase() === text.toUpperCase() || (x.external_ref && x.external_ref === text));
  const exactManifest = m.find(x => x.ref.toUpperCase() === text.toUpperCase());
  return {
    orders: o, manifests: m, shops, drivers,
    exact: exactOrder ? { type: 'order', id: exactOrder.id } : exactManifest ? { type: 'manifest', id: exactManifest.id, manifest_type: exactManifest.type } : null,
  };
});
