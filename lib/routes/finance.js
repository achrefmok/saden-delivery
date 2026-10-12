import { route } from '../http.js';
import { q } from '../db.js';
import { fail } from '../auth.js';
import { CASH_TYPES, str, num, int, need, defaultAgency } from '../domain.js';
import { STAFF, scopeAgency } from '../scope.js';

/* cash */
route('POST', '/cash', STAFF, async ({ user, body }) => {
  const type = str(body.type, 40);
  if (!(type in CASH_TYPES)) fail(400, 'Type invalide.');
  let amount = num(body.amount);
  if (amount == null || amount === 0) fail(400, 'Montant invalide.');
  if (CASH_TYPES[type]) amount = Math.abs(amount) * CASH_TYPES[type];
  const agencyId = scopeAgency(user, body.agency_id) || (await defaultAgency())?.id;
  await q(`INSERT INTO cash_tx (label, type, amount, created_by, agency_id) VALUES ($1,$2,$3,$4,$5)`,
    [need(str(body.label, 120), 'Libellé obligatoire.'), type, amount, user.id, int(agencyId)]);
  return { ok: true };
});
