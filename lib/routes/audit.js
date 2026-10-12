// §29, §30 — « Journal » (admin): filterable audit log.
import { route } from '../http.js';
import { q } from '../db.js';
import { str, int, Sql, TZ } from '../domain.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

route('GET', '/audit', ['admin'], async ({ query }) => {
  const s = new Sql(), w = ['TRUE'];
  if (str(query.entity, 40)) w.push(`a.entity = ${s.p(str(query.entity, 40))}`);
  if (str(query.action, 60)) w.push(`a.action ILIKE ${s.p(str(query.action, 60).replace(/[\\%_]/g, m => '\\' + m) + '%')}`);
  if (int(query.user_id)) w.push(`a.user_id = ${s.p(int(query.user_id))}`);
  if (str(query.entity_id, 40)) w.push(`a.entity_id = ${s.p(str(query.entity_id, 40))}`);
  if (DATE_RE.test(query.from || '')) w.push(`a.created_at >= (${s.p(query.from)}::date)::timestamp AT TIME ZONE '${TZ}'`);
  if (DATE_RE.test(query.to || '')) w.push(`a.created_at < ((${s.p(query.to)}::date) + 1)::timestamp AT TIME ZONE '${TZ}'`);
  const limit = Math.min(int(query.limit) || 200, 500), offset = Math.max(int(query.offset) || 0, 0);
  const rows = await q(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.before, a.after, a.ip, a.created_at, u.name AS user_name, u.role AS user_role,
            CASE WHEN a.entity = 'order' THEN (SELECT ref FROM orders WHERE id::text = a.entity_id) END AS order_ref
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE ${w.join(' AND ')} ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`, s.v);
  const facets = await q(`SELECT DISTINCT entity FROM audit_log WHERE entity IS NOT NULL ORDER BY entity`);
  return { rows, entities: facets.map(f => f.entity) };
});
