// Small shared helpers (validation, time boundaries, geo, SQL parameter builder).
import { fail } from './auth.js';

export const str = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
export const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const int = v => { const n = num(v); return n == null ? null : Math.trunc(n); };
export const need = (v, msg) => { if (v === '' || v == null) fail(400, msg); return v; };
export const bool = v => v === true || v === 'true' || v === 1 || v === '1';

// Day/week/month boundaries in local time, independent of the DB session timezone.
export const TZ = (process.env.APP_TZ || 'Africa/Tunis').replace(/'/g, '');
export const startOf = unit => `(date_trunc('${unit}', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
export const TODAY = startOf('day');

export function haversine(a, b) {
  if (!a || !b || a[0] == null || b[0] == null) return null;
  const R = 6371, r = x => x * Math.PI / 180;
  const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Builds parameterised SQL: const s = new Sql(); `... WHERE x = ${s.p(value)}` → s.v holds the values.
export class Sql {
  constructor(values = []) { this.v = [...values]; }
  p(x) { this.v.push(x); return '$' + this.v.length; }
}

export const clientIp = req =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
