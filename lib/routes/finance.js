import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* cash */
route('POST', '/cash', ['admin'], async ({ user, body }) => {
  const type = str(body.type, 40);
  if (!(type in CASH_TYPES)) fail(400, 'Type invalide.');
  let amount = num(body.amount);
  if (amount == null || amount === 0) fail(400, 'Montant invalide.');
  if (CASH_TYPES[type]) amount = Math.abs(amount) * CASH_TYPES[type];
  await q(`INSERT INTO cash_tx (label, type, amount, created_by) VALUES ($1,$2,$3,$4)`,
    [need(str(body.label, 120), 'Libellé obligatoire.'), type, amount, user.id]);
  return { ok: true };
});
