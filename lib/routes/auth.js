import { route } from '../http.js';
import { q, one } from '../db.js';
import { normEmail, normPhone, checkPassword, signToken, fail, USER_COLS } from '../auth.js';
import { ADMIN_EMAIL, num } from '../domain.js';
import { ROLES } from '../scope.js';
import { createUser } from './accounts.js';
import { audit } from '../audit.js';
import { guard, hit, reset, LIMITS } from '../ratelimit.js';

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

route('POST', '/auth/login', null, async ({ body, ip }) => {
  const id = String(body.login ?? body.phone ?? '').trim();
  // §29: failed attempts are limited per identifier and per IP (stored in the database)
  const idKey = 'login:id:' + (id.includes('@') ? normEmail(id) : normPhone(id)), ipKey = 'login:ip:' + ip;
  const msg = 'Trop de tentatives de connexion. Réessayez dans quelques minutes.';
  await guard(idKey, LIMITS.loginFailuresPerId, 900, msg);
  await guard(ipKey, LIMITS.loginFailuresPerIp, 900, msg);
  const u = id.includes('@')
    ? await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE lower(email) = $1`, [normEmail(id)])
    : await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE phone = $1`, [normPhone(id)]);
  if (!id || !u || !(await checkPassword(String(body.password || ''), u.password_hash))) {
    await hit(idKey, 900); await hit(ipKey, 900);
    await audit({ user: null, ip }, 'auth.login_failed', 'user', u?.id ?? null, null, { login: id.slice(0, 80) });
    fail(401, 'Identifiant ou mot de passe incorrect.');
  }
  if (!u.active) fail(403, 'Compte désactivé. Contactez l’agence.');
  await reset(idKey);
  delete u.password_hash;
  return { token: signToken(u), user: u, agency: await userAgency(u) };
});

route('GET', '/me', ROLES, async ({ user }) => ({ user, agency: await userAgency(user) }));

// §12 — the position is only accepted while the driver is on duty (available or delivering) and has consented
route('POST', '/me/location', ['driver'], async ({ user, body }) => {
  if (!user.gps_consent_at) fail(428, 'Consentement GPS requis.', { code: 'gps_consent_required' });
  if (!['dispo', 'livraison'].includes(user.status)) fail(409, 'Position non partagée hors service (pause / hors ligne).');
  const lat = num(body.lat), lng = num(body.lng), bat = num(body.battery);
  if (lat == null || lng == null) fail(400, 'Position invalide.');
  await q(`UPDATE users SET lat = $2, lng = $3, battery = $4, last_seen = now() WHERE id = $1`, [user.id, lat, lng, bat == null ? null : Math.round(bat)]);
  return { ok: true };
});

route('POST', '/me/status', ['driver'], async ({ user, body }) => {
  if (!['dispo', 'pause', 'off'].includes(body.status)) fail(400, 'Statut invalide.');
  if (body.status === 'dispo' && !user.gps_consent_at) {
    // first time on duty: explicit consent to share the position during service hours
    if (body.gps_consent !== true) fail(428, 'Consentement GPS requis avant de passer « Disponible ».', { code: 'gps_consent_required' });
    await q(`UPDATE users SET gps_consent_at = now() WHERE id = $1`, [user.id]);
    await audit(null, 'driver.gps_consent', 'user', user.id, null, { consent: true });
  }
  await q(`UPDATE users SET status = $2, last_seen = now() WHERE id = $1`, [user.id, body.status]);
  return { ok: true, sharing: ['dispo', 'livraison'].includes(body.status) };
});
