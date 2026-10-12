import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* claims */
route('POST', '/claims/:id/advance', ['admin'], async ({ params }) => {
  const c = await one(`UPDATE claims SET status = (status + 1) % 4 WHERE id = $1 RETURNING status`, [Number(params.id)]);
  if (!c) fail(404, 'Réclamation introuvable.');
  return c;
});
