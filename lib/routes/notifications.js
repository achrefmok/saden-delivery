// §25 — in-app notifications of the current user (bell).
import { route } from '../http.js';
import { q, one } from '../db.js';
import { int } from '../domain.js';
import { ROLES } from '../scope.js';

route('GET', '/notifications', ROLES, async ({ user }) => {
  const [items, unread] = await Promise.all([
    q(`SELECT n.id, n.type, n.order_id, n.title, n.body, n.read_at, n.created_at, o.ref
       FROM notifications n LEFT JOIN orders o ON o.id = n.order_id WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 30`, [user.id]),
    one(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [user.id]),
  ]);
  return { items, unread: unread.n };
});

route('POST', '/notifications/read', ROLES, async ({ user, body }) => {
  const ids = Array.isArray(body.ids) ? body.ids.map(int).filter(Boolean) : null;
  if (ids?.length) await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL`, [user.id, ids]);
  else await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [user.id]);
  return { ok: true };
});
