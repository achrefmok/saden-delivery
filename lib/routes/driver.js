import { route } from '../http.js';
import { q, one } from '../db.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* driver */
route('GET', '/driver/overview', ['driver'], async ({ user }) => ({
  me: user,
  missions: await q(`${ORDER_SELECT}
    WHERE o.driver_id = $1 AND (o.status IN ('affecte','accepte','livraison','sur_place') OR o.updated_at >= ${TODAY})
    ORDER BY CASE WHEN o.status IN ('affecte','accepte','livraison','sur_place') THEN 0 ELSE 1 END, o.created_at`, [user.id]),
}));
