import { route } from '../http.js';
import { q, one } from '../db.js';
import { ORDER_SELECT, TODAY } from '../domain.js';
import { ACTIVE } from '../status.js';
import { userAgency } from './auth.js';

/* driver */
route('GET', '/driver/overview', ['driver'], async ({ user }) => ({
  me: user,
  agency: await userAgency(user),
  missions: await q(`${ORDER_SELECT}
    WHERE o.driver_id = $1 AND (o.status = ANY($2::text[]) OR o.updated_at >= ${TODAY})
    ORDER BY CASE WHEN o.status = ANY($2::text[]) THEN 0 ELSE 1 END, o.created_at`, [user.id, ACTIVE]),
}));
