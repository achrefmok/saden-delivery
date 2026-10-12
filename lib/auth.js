import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { one } from './db.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

function secret() {
  const s = process.env.JWT_SECRET || (process.env.VERCEL ? null : 'dev-secret-change-me');
  if (!s) throw Object.assign(new Error('Configuration : variable JWT_SECRET manquante sur Vercel.'), { config: true });
  return s;
}

export const hashPassword = p => bcrypt.hash(p, 10);
export const checkPassword = (p, h) => bcrypt.compare(p, h);
export const signToken = u => jwt.sign({ sub: u.id, role: u.role }, secret(), { expiresIn: '30d' });

// Normalised phone: digits only, keep the last 8 (Tunisian numbers) so "+216 98 412 337" == "98412337".
export const normPhone = p => String(p || '').replace(/\D/g, '').slice(-8);

export const normEmail = e => String(e || '').trim().toLowerCase();
export const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export const USER_COLS = `id, role, name, phone, email, active, agency_id, zone_id, zone, vehicle, shop_name, address, status, lat, lng, battery, last_seen, gps_consent_at, created_at`;

export async function currentUser(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  let payload;
  try { payload = jwt.verify(h.slice(7), secret()); } catch { return null; }
  return one(`SELECT ${USER_COLS} FROM users WHERE id = $1 AND active`, [payload.sub]);
}
