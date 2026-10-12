import { route } from '../http.js';
import { q, one } from '../db.js';
import { ORDER_SELECT, TODAY } from '../domain.js';
import { userAgency } from './auth.js';

/* driver */
route('GET', '/driver/overview', ['driver'], async ({ user }) => ({
  me: user,
  agency: await userAgency(user),
  missions: await q(`${ORDER_SELECT}
    WHERE o.driver_id = $1 AND (o.status IN ('affecte','accepte','livraison','sur_place') OR o.updated_at >= ${TODAY})
    ORDER BY CASE WHEN o.status IN ('affecte','accepte','livraison','sur_place') THEN 0 ELSE 1 END, o.created_at`, [user.id]),
}));
