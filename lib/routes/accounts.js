// Accounts: admin manages everyone; an agency manager manages the drivers and shops of his agency.
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail, hashPassword, normPhone, normEmail, isEmail, USER_COLS } from '../auth.js';
import { str, int, need, Sql, defaultAgency } from '../domain.js';
import { ROLES, STAFF, scopeWhere } from '../scope.js';
import { audit, redact } from '../audit.js';

const LIST_COLS = USER_COLS.split(',').map(c => 'u.' + c.trim()).join(', ');

async function checkAgencyZone(agencyId, zoneId) {
  const ag = await one(`SELECT id, city_id FROM agencies WHERE id = $1`, [agencyId]);
  if (!ag) fail(400, 'Agence invalide.');
  if (zoneId && !(await one(`SELECT id FROM zones WHERE id = $1 AND city_id = $2`, [zoneId, ag.city_id])))
    fail(400, 'La zone doit appartenir à la ville de l’agence.');
  return ag;
}

/** Creates an account. `actor` is the staff member creating it (null for the first-launch admin). */
export async function createUser(b, actor) {
  const role = b.role;
  if (!ROLES.includes(role)) fail(400, 'Rôle invalide.');
  if (actor?.role === 'manager' && !['driver', 'shop'].includes(role)) fail(403, 'Un responsable ne peut créer que des livreurs et des boutiques.');
  const name = need(str(b.name, 80), 'Nom obligatoire.');
  const phone = normPhone(b.phone) || null;
  const email = normEmail(b.email) || null;
  if (phone && phone.length !== 8) fail(400, 'Téléphone invalide (8 chiffres).');
  if (email && !isEmail(email)) fail(400, 'Adresse e-mail invalide.');
  if (STAFF.includes(role) ? !phone && !email : !phone) fail(400, STAFF.includes(role) ? 'Téléphone ou e-mail obligatoire.' : 'Téléphone obligatoire (8 chiffres).');
  const password = String(b.password || '');
  if (password.length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
  if (role === 'shop') need(str(b.shop_name), 'Nom de la boutique obligatoire.');

  let agencyId = null, zoneId = int(b.zone_id) || null;
  if (role !== 'admin') {
    agencyId = actor?.role === 'manager' ? actor.agency_id : int(b.agency_id) || (role === 'manager' ? null : (await defaultAgency())?.id);
    if (!agencyId) fail(400, 'Agence obligatoire.');
    await checkAgencyZone(agencyId, zoneId);
  } else zoneId = null;

  if (phone && await one(`SELECT id FROM users WHERE phone = $1`, [phone])) fail(409, 'Ce numéro est déjà utilisé.');
  if (email && await one(`SELECT id FROM users WHERE lower(email) = $1`, [email])) fail(409, 'Cette adresse e-mail est déjà utilisée.');
  const u = await one(
    `INSERT INTO users (role, name, phone, email, password_hash, agency_id, zone_id, vehicle, shop_name, address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${USER_COLS}`,
    [role, name, phone, email, await hashPassword(password), agencyId, zoneId, str(b.vehicle, 40) || null,
     str(b.shop_name, 80) || null, str(b.address) || null, role === 'driver' ? 'off' : 'dispo']);
  if (role === 'manager') await q(`UPDATE agencies SET manager_id = $1 WHERE id = $2 AND manager_id IS NULL`, [u.id, agencyId]);
  await audit(actor ? { user: actor } : { user: u }, 'user.create', 'user', u.id, null, redact(u));
  return u;
}

route('GET', '/users', STAFF, async ({ user, query }) => {
  const s = new Sql();
  const where = scopeWhere(user, 'users', s, { agency: query.agency_id });
  return {
    users: await q(`SELECT ${LIST_COLS}, ag.name AS agency_name, z.name AS zone_name
                    FROM users u LEFT JOIN agencies ag ON ag.id = u.agency_id LEFT JOIN zones z ON z.id = u.zone_id
                    WHERE ${where} ${user.role === 'manager' ? `AND u.role IN ('driver','shop','manager')` : ''}
                    ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'driver' THEN 2 ELSE 3 END, u.name`, s.v),
  };
});

route('POST', '/users', STAFF, async ({ body, user }) => ({ user: await createUser(body, user) }));

route('PATCH', '/users/:id', STAFF, async ({ params, body, user }) => {
  const id = int(params.id);
  const target = await one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  if (!target) fail(404, 'Compte introuvable.');
  if (user.role === 'manager' && (target.agency_id !== user.agency_id || !['driver', 'shop'].includes(target.role)))
    fail(403, 'Hors de votre agence.');
  if (id === user.id && body.active === false) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
  const sets = [], vals = [id];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof body.active === 'boolean') add('active', body.active);
  if (body.password != null) {
    if (String(body.password).length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
    add('password_hash', await hashPassword(String(body.password)));
  }
  for (const k of ['name', 'vehicle', 'shop_name', 'address']) if (body[k] != null) add(k, str(body[k]) || null);
  if (body.rs_rate != null) {
    if (target.role !== 'shop' || user.role !== 'admin') fail(403, 'Taux de retenue : boutiques, administrateur uniquement.');
    const r = Number(body.rs_rate);
    if (!(r >= 0 && r <= 25)) fail(400, 'Taux de retenue invalide (0 à 25 %).');
    add('rs_rate', r);
  }
  if (body.agency_id !== undefined || body.zone_id !== undefined) {
    if (target.role === 'admin') fail(400, 'Un administrateur n’est rattaché à aucune agence.');
    const agencyId = body.agency_id !== undefined && user.role === 'admin' ? int(body.agency_id) : target.agency_id;
    const zoneId = body.zone_id !== undefined ? int(body.zone_id) || null : target.zone_id;
    await checkAgencyZone(agencyId, zoneId);
    add('agency_id', agencyId); add('zone_id', zoneId);
  }
  if (!sets.length) fail(400, 'Rien à modifier.');
  const updated = await one(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${USER_COLS}`, vals);
  const action = typeof body.active === 'boolean' ? (body.active ? 'user.activate' : 'user.deactivate') : body.password != null ? 'user.password_reset' : 'user.update';
  const pick = r => Object.fromEntries(Object.keys(body).filter(k => k !== 'password' && k in r).map(k => [k, r[k]]));
  await audit(null, action, 'user', id, pick(target), body.password != null ? { ...pick(updated), password: '••••••' } : pick(updated));
  return { user: updated };
});
