import { route } from '../http.js';
import { q, one } from '../db.js';
import { ORDER_SELECT, startOf } from '../domain.js';
import { userAgency } from './auth.js';

/* shop */
route('GET', '/shop/overview', ['shop'], async ({ user }) => {
  const [orders, k] = await Promise.all([
    q(`${ORDER_SELECT} WHERE o.shop_id = $1 ORDER BY o.created_at DESC LIMIT 300`, [user.id]),
    one(`SELECT count(*)::int AS month,
           count(*) FILTER (WHERE status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE status IN ('livre','absent','refuse','reporte'))::int AS finals,
           coalesce(sum(cod) FILTER (WHERE status = 'livre'), 0)::float8 AS cod
         FROM orders WHERE shop_id = $1 AND created_at >= ${startOf('month')}`, [user.id]),
  ]);
  return { me: user, orders, kpis: k, agency: await userAgency(user) };
});
