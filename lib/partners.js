// §19, §20 — partner API keys and outgoing webhooks.
//   Keys: "sk_live_" + 40 random chars, shown once; only a SHA-256 hash and a lookup prefix are stored.
//   Webhooks: JSON signed with HMAC-SHA256 (X-Saden-Signature: sha256=<hex>), logged in webhook_deliveries,
//   3 attempts max (immediate, then +2 min, +4 min — retried when the API is used, or resent from the admin).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { q, one, inTx } from './db.js';
import { fail } from './auth.js';
import { statusHooks } from './status.js';
import { guard, hit, limit, LIMITS } from './ratelimit.js';

const sha256 = s => createHash('sha256').update(s).digest('hex');
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const rand = n => [...randomBytes(n)].map(b => B62[b % 62]).join('');

export const PREFIX_LEN = 16;
export function newApiKey() {
  const key = 'sk_live_' + rand(40);
  return { key, key_prefix: key.slice(0, PREFIX_LEN), key_hash: sha256(key) };
}
export const newWebhookSecret = () => 'whsec_' + rand(32);

/** Authenticates "Authorization: Bearer sk_live_…" or "X-Api-Key: sk_live_…". */
export async function authenticatePartner(req, ip) {
  await guard('apiauth:ip:' + ip, 30, 600, 'Trop de clés invalides depuis cette adresse.');
  const h = req.headers.authorization || '';
  const key = (h.startsWith('Bearer ') ? h.slice(7) : req.headers['x-api-key'] || '').trim();
  if (!key.startsWith('sk_live_') || key.length < 30) fail(401, 'Clé API manquante ou invalide.');
  const p = await one(`SELECT * FROM api_partners WHERE key_prefix = $1`, [key.slice(0, PREFIX_LEN)]);
  const ok = p && timingSafeEqual(Buffer.from(sha256(key)), Buffer.from(p.key_hash));
  if (!ok) { await hit('apiauth:ip:' + ip, 600); fail(401, 'Clé API invalide.'); }
  if (!p.active) fail(403, 'Clé API désactivée.');
  await limit('api:' + p.id, LIMITS.apiPerMinute, 60, `Limite de ${LIMITS.apiPerMinute} requêtes par minute atteinte.`);
  q(`UPDATE api_partners SET last_used_at = now() WHERE id = $1`, [p.id]).catch(() => {});
  return p;
}

/* ---------- webhooks ---------- */
const EVENTS = { attente: 'order.received', affecte: 'order.assigned', livraison: 'order.in_delivery', livre: 'order.delivered',
  refuse: 'order.refused', annule: 'order.cancelled', retour: 'order.returned' };
const MAX_ATTEMPTS = 3;
export const signPayload = (secret, body) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

async function attempt(d) {
  const p = await one(`SELECT webhook_url, webhook_secret, active FROM api_partners WHERE id = $1`, [d.partner_id]);
  if (!p?.webhook_url || !p.active) {
    await q(`UPDATE webhook_deliveries SET status = 'failed', last_error = 'Aucune URL de webhook active' WHERE id = $1`, [d.id]);
    return false;
  }
  const body = JSON.stringify(d.payload);
  let code = null, err = null;
  try {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(p.webhook_url, {
      method: 'POST', signal: ctrl.signal, body,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'SADEN-Webhooks/1.0', 'X-Saden-Event': d.event,
                 'X-Saden-Delivery': String(d.id), 'X-Saden-Signature': signPayload(p.webhook_secret || '', body) },
    });
    clearTimeout(timer);
    code = r.status;
    if (!r.ok) err = `HTTP ${r.status}`;
  } catch (e) { err = e.name === 'AbortError' ? 'Délai dépassé (4 s)' : e.message; }
  const attempts = d.attempts + 1;
  if (!err) {
    await q(`UPDATE webhook_deliveries SET status = 'delivered', attempts = $2, last_status = $3, last_error = NULL, delivered_at = now() WHERE id = $1`, [d.id, attempts, code]);
    return true;
  }
  await q(`UPDATE webhook_deliveries SET status = $2, attempts = $3, last_status = $4, last_error = $5,
             next_attempt_at = now() + make_interval(mins => $6) WHERE id = $1`,
    [d.id, attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', attempts, code, String(err).slice(0, 300), 2 ** attempts]);
  return false;
}

/** Retries due deliveries (bounded, so it can run inside a request on serverless). */
export async function processWebhookQueue(limit = 5) {
  const due = await q(`SELECT * FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY id LIMIT $1`, [limit]);
  for (const d of due) await attempt(d).catch(e => console.error('webhook', e));
  return due.length;
}

/** Manual resend from the admin: one more attempt, even after the 3 automatic ones. */
export async function resendDelivery(id) {
  const d = await one(`SELECT * FROM webhook_deliveries WHERE id = $1`, [id]);
  if (!d) fail(404, 'Envoi introuvable.');
  await q(`UPDATE webhook_deliveries SET attempts = 0, status = 'pending' WHERE id = $1`, [id]);
  const ok = await attempt({ ...d, attempts: 0 });
  return one(`SELECT id, status, attempts, last_status, last_error, delivered_at FROM webhook_deliveries WHERE id = $1`, [id]).then(r => ({ ok, ...r }));
}

/** Webhook on every status change of an order created by a partner. */
statusHooks.push(async ({ order, from, to, note, driver }) => {
  const o = await one(`SELECT o.id, o.ref, o.external_ref, o.partner_id, p.webhook_url FROM orders o JOIN api_partners p ON p.id = o.partner_id
                       WHERE o.id = $1 AND p.active`, [order.id]);
  if (!o?.webhook_url) return;
  const event = EVENTS[to] || 'order.status_changed';
  const payload = {
    event, created_at: new Date().toISOString(),
    data: { ref: o.ref, external_ref: o.external_ref, status: to, previous_status: from,
            ...(note && ['refuse', 'annule', 'retour', 'absent', 'reporte', 'numero_incorrect', 'adresse_incorrecte', 'endommage'].includes(to) ? { reason: note } : {}),
            ...(driver ? { driver: { first_name: String(driver.name || '').split(' ')[0] } } : {}) },
  };
  const d = await one(`INSERT INTO webhook_deliveries (partner_id, order_id, event, payload) VALUES ($1,$2,$3,$4) RETURNING *`,
    [o.partner_id, o.id, event, JSON.stringify(payload)]);
  payload.id = d.id;
  await q(`UPDATE webhook_deliveries SET payload = $2 WHERE id = $1`, [d.id, JSON.stringify(payload)]);
  // inside a business transaction the HTTP call waits for the queue (no network I/O while rows are locked)
  if (!inTx()) await attempt({ ...d, payload });
});
