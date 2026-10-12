// §29 — attempt limits stored in PostgreSQL (fixed window), so they hold across Vercel instances.
import { q, one } from './db.js';
import { fail } from './auth.js';

/** Increments the counter of `key` and returns the number of hits in the current window. */
export async function hit(key, windowSec) {
  const r = await one(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count, window_start`, [key, windowSec]);
  if (Math.random() < 0.02) q(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`).catch(() => {});
  return r;
}

/** Throws 429 when `key` already reached `max` hits in the window (without counting this call). */
export async function guard(key, max, windowSec, message) {
  const r = await one(`SELECT count, window_start FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)`, [key, windowSec]);
  if (r && r.count >= max) {
    const retry = Math.max(1, Math.ceil(windowSec - (Date.now() - new Date(r.window_start).getTime()) / 1000));
    fail(429, message || 'Trop de tentatives, réessayez plus tard.', { retry_after: retry });
  }
}

/** Counts a call and throws 429 above `max` per window. */
export async function limit(key, max, windowSec, message) {
  const r = await hit(key, windowSec);
  if (r.count > max) {
    const retry = Math.max(1, Math.ceil(windowSec - (Date.now() - new Date(r.window_start).getTime()) / 1000));
    fail(429, message || 'Trop de requêtes, réessayez plus tard.', { retry_after: retry });
  }
}

export const reset = key => q(`DELETE FROM rate_limits WHERE key = $1`, [key]);

const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const LIMITS = {
  loginFailuresPerId: n(process.env.RL_LOGIN_ID, 8),        // failed logins per identifier / 15 min
  loginFailuresPerIp: n(process.env.RL_LOGIN_IP, 30),       // failed logins per IP / 15 min
  trackFailuresPerRef: n(process.env.RL_TRACK_REF, 10),     // wrong phone for a parcel / 10 min
  trackFailuresPerIp: n(process.env.RL_TRACK_IP, 30),       // unknown parcel or phone per IP / 10 min
  reviewPerRef: n(process.env.RL_REVIEW_REF, 10),           // review / claim submissions per parcel / 10 min
  apiPerMinute: n(process.env.RL_API_MIN, 120),             // partner API calls per key / minute
};
