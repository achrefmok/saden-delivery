import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* bordereaux */
route('POST', '/manifests', ['admin'], async ({ user, body }) => {
  const to = need(str(body.to_city, 60), 'Destination obligatoire.');
  if (to === AGENCY_CITY) fail(400, 'Destination identique à l’agence.');
  const m = await one(
    `INSERT INTO manifests (ref, from_city, to_city, carrier, responsible)
     VALUES ('BRD-' || upper(left($1, 3)) || '-' || upper(left($2, 3)) || '-' || lpad(nextval('manifest_ref_seq')::text, 4, '0'), $1, $2, $3, $4)
     RETURNING id, ref`,
    [AGENCY_CITY, to, str(body.carrier, 80) || null, user.name]);
  const r = await q(`UPDATE orders SET manifest_id = $1, updated_at = now()
                     WHERE manifest_id IS NULL AND dest_city = $2 AND status IN ('cree','attente') RETURNING id`, [m.id, to]);
  return { manifest: m, attached: r.length };
});

route('POST', '/manifests/:id/next', ['admin'], async ({ user, params }) => {
  const m = await one(`SELECT id, stage FROM manifests WHERE id = $1`, [Number(params.id)]);
  if (!m) fail(404, 'Bordereau introuvable.');
  if (m.stage >= 4) fail(409, 'Bordereau déjà clôturé.');
  const stage = m.stage + 1;
  await q(`UPDATE manifests SET stage = $2 WHERE id = $1`, [m.id, stage]);
  const st = { 2: 'transit', 3: 'arrive' }[stage];
  if (st) {
    const rows = await q(`UPDATE orders SET status = $2, updated_at = now() WHERE manifest_id = $1 AND status NOT IN ('livre','refuse') RETURNING id`, [m.id, st]);
    for (const r of rows) await addEvent(r.id, st, actorOf(user));
  }
  return { stage };
});
