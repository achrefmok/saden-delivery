import { route } from '../http.js';
import { q, one } from '../db.js';
import { normEmail, normPhone, checkPassword, signToken, fail, USER_COLS } from '../auth.js';
import { ADMIN_EMAIL, num } from '../domain.js';
import { ROLES } from '../scope.js';
import { createUser } from './accounts.js';

/** Agency (and city) a user belongs to, for the UI header. */
export const userAgency = u => u.agency_id
  ? one(`SELECT ag.id, ag.name, ag.city_id, ag.lat, ag.lng, ag.auto_assign, c.name AS city_name
         FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1`, [u.agency_id])
  : null;

route('GET', '/auth/status', null, async () => {
  const a = await one(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
  return { needsSetup: a.n === 0, ...(a.n === 0 && ADMIN_EMAIL ? { setupEmail: ADMIN_EMAIL } : {}) };
});

route('POST', '/auth/setup', null, async ({ body }) => {
  const a = await one(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
  if (a.n > 0) fail(409, 'Un administrateur existe déjà.');
  if (ADMIN_EMAIL && normEmail(body.email) !== ADMIN_EMAIL) fail(403, 'Ce compte administrateur est réservé à une autre adresse e-mail.');
  const u = await createUser({ ...body, role: 'admin' }, null);
  return { token: signToken(u), user: u, agency: null };
});

route('POST', '/auth/login', null, async ({ body }) => {
  const id = String(body.login ?? body.phone ?? '').trim();
  const u = id.includes('@')
    ? await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE lower(email) = $1`, [normEmail(id)])
    : await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE phone = $1`, [normPhone(id)]);
  if (!id || !u || !(await checkPassword(String(body.password || ''), u.password_hash))) fail(401, 'Identifiant ou mot de passe incorrect.');
  if (!u.active) fail(403, 'Compte désactivé. Contactez l’agence.');
  delete u.password_hash;
  return { token: signToken(u), user: u, agency: await userAgency(u) };
});

route('GET', '/me', ROLES, async ({ user }) => ({ user, agency: await userAgency(user) }));

route('POST', '/me/location', ['driver'], async ({ user, body }) => {
  const lat = num(body.lat), lng = num(body.lng), bat = num(body.battery);
  if (lat == null || lng == null) fail(400, 'Position invalide.');
  await q(`UPDATE users SET lat = $2, lng = $3, battery = $4, last_seen = now() WHERE id = $1`, [user.id, lat, lng, bat == null ? null : Math.round(bat)]);
  return { ok: true };
});

route('POST', '/me/status', ['driver'], async ({ user, body }) => {
  if (!['dispo', 'pause', 'off'].includes(body.status)) fail(400, 'Statut invalide.');
  await q(`UPDATE users SET status = $2, last_seen = now() WHERE id = $1`, [user.id, body.status]);
  return { ok: true };
});
