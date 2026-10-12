import { route } from '../http.js';
import { one } from '../db.js';
import { fail } from '../auth.js';
import { int, Sql } from '../domain.js';
import { STAFF, scopeWhere } from '../scope.js';

/* claims */
route('POST', '/claims/:id/advance', STAFF, async ({ params, user }) => {
  const s = new Sql([int(params.id)]);
  const c = await one(`UPDATE claims SET status = (status + 1) % 4 WHERE id = $1 AND order_id IN
                         (SELECT o.id FROM orders o WHERE ${scopeWhere(user, 'orders', s)}) RETURNING status`, s.v);
  if (!c) fail(404, 'Réclamation introuvable.');
  return c;
});
