import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail, hashPassword, normPhone, normEmail, isEmail, USER_COLS } from '../auth.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* accounts (admin) */
export async function createUser(b) {
  const role = b.role;
  if (!['admin', 'driver', 'shop'].includes(role)) fail(400, 'Rôle invalide.');
  const name = need(str(b.name, 80), 'Nom obligatoire.');
  const phone = normPhone(b.phone) || null;
  const email = normEmail(b.email) || null;
  if (phone && phone.length !== 8) fail(400, 'Téléphone invalide (8 chiffres).');
  if (email && !isEmail(email)) fail(400, 'Adresse e-mail invalide.');
  if (role === 'admin' ? !phone && !email : !phone) fail(400, role === 'admin' ? 'Téléphone ou e-mail obligatoire.' : 'Téléphone obligatoire (8 chiffres).');
  const password = String(b.password || '');
  if (password.length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
  if (role === 'shop') need(str(b.shop_name), 'Nom de la boutique obligatoire.');
  if (phone && await one(`SELECT id FROM users WHERE phone = $1`, [phone])) fail(409, 'Ce numéro est déjà utilisé.');
  if (email && await one(`SELECT id FROM users WHERE lower(email) = $1`, [email])) fail(409, 'Cette adresse e-mail est déjà utilisée.');
  return one(
    `INSERT INTO users (role, name, phone, email, password_hash, zone, vehicle, shop_name, address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${USER_COLS}`,
    [role, name, phone, email, await hashPassword(password), str(b.zone, 80) || null, str(b.vehicle, 40) || null,
     str(b.shop_name, 80) || null, str(b.address) || null, role === 'driver' ? 'off' : 'dispo']);
}

route('GET', '/users', ['admin'], async () => ({
  users: await q(`SELECT ${USER_COLS} FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'driver' THEN 1 ELSE 2 END, name`),
}));

route('POST', '/users', ['admin'], async ({ body }) => ({ user: await createUser(body) }));

route('PATCH', '/users/:id', ['admin'], async ({ params, body, user }) => {
  const id = Number(params.id);
  const target = await one(`SELECT id, role FROM users WHERE id = $1`, [id]);
  if (!target) fail(404, 'Compte introuvable.');
  if (id === user.id && body.active === false) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
  const sets = [], vals = [id];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof body.active === 'boolean') add('active', body.active);
  if (body.password != null) {
    if (String(body.password).length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
    add('password_hash', await hashPassword(String(body.password)));
  }
  for (const k of ['name', 'zone', 'vehicle', 'shop_name', 'address']) if (body[k] != null) add(k, str(body[k]) || null);
  if (!sets.length) fail(400, 'Rien à modifier.');
  return { user: await one(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${USER_COLS}`, vals) };
});
