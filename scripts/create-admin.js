// Creates (or promotes) an administrator account identified by e-mail, with a new password.
//   npm run create-admin -- hachem.jaxdelivery@gmail.com "Hachem"
// Uses DATABASE_URL from .env (Supabase) — or the local PGlite database when it is not set.
// The password is generated and printed once; pass ADMIN_PASSWORD=... to choose it instead.
import { randomBytes } from 'node:crypto';

try { process.loadEnvFile('.env'); } catch {}
const { one, close } = await import('../lib/db.js');
const { hashPassword, normEmail, isEmail, USER_COLS } = await import('../lib/auth.js');

const email = normEmail(process.argv[2] || process.env.ADMIN_EMAIL);
const name = process.argv[3] || email.split('@')[0];
if (!isEmail(email)) {
  console.error('Usage : npm run create-admin -- <email> ["Nom"]');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
if (password.length < 6) { console.error('Mot de passe : 6 caractères minimum.'); process.exit(1); }
const hash = await hashPassword(password);

const existing = await one(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
const u = existing
  ? await one(`UPDATE users SET role = 'admin', active = TRUE, password_hash = $2 WHERE id = $1 RETURNING ${USER_COLS}`, [existing.id, hash])
  : await one(`INSERT INTO users (role, name, email, password_hash, status) VALUES ('admin', $1, $2, $3, 'dispo') RETURNING ${USER_COLS}`, [name, email, hash]);

console.log(`${existing ? 'Compte promu administrateur' : 'Administrateur créé'} : ${u.name} <${u.email}>`);
if (!process.env.ADMIN_PASSWORD) console.log(`Mot de passe : ${password}   (à changer depuis Comptes → Mot de passe)`);
await close();
