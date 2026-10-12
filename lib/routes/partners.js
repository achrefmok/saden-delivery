// §19 — partner management (admin): keys shown once, webhook settings, delivery log and manual resend.
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { str, int, bool } from '../domain.js';
import { audit } from '../audit.js';
import { newApiKey, newWebhookSecret, processWebhookQueue, resendDelivery } from '../partners.js';

const COLS = `p.id, p.name, p.key_prefix, p.shop_id, p.agency_id, p.webhook_url, p.active, p.last_used_at, p.created_at,
  ag.name AS agency_name, s.shop_name,
  (SELECT count(*) FROM orders o WHERE o.partner_id = p.id)::int AS orders,
  (SELECT count(*) FROM webhook_deliveries w WHERE w.partner_id = p.id AND w.status = 'failed')::int AS failed_webhooks`;

const checkUrl = u => {
  if (!u) return null;
  let url; try { url = new URL(u); } catch { fail(400, 'URL de webhook invalide.'); }
  if (!['https:', 'http:'].includes(url.protocol)) fail(400, 'URL de webhook : http(s) uniquement.');
  return url.toString();
};
async function checkRefs(b) {
  const agencyId = int(b.agency_id);
  if (!agencyId || !(await one(`SELECT id FROM agencies WHERE id = $1`, [agencyId]))) fail(400, 'Agence invalide.');
  const shopId = int(b.shop_id) || null;
  if (shopId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop'`, [shopId]))) fail(400, 'Boutique invalide.');
  return { agencyId, shopId };
}

route('GET', '/partners', ['admin'], async () => {
  await processWebhookQueue(5).catch(() => {});
  return { partners: await q(`SELECT ${COLS} FROM api_partners p JOIN agencies ag ON ag.id = p.agency_id LEFT JOIN users s ON s.id = p.shop_id ORDER BY p.name`) };
});

route('POST', '/partners', ['admin'], async ctx => {
  const b = ctx.body;
  const name = str(b.name, 80);
  if (!name) fail(400, 'Nom obligatoire.');
  const { agencyId, shopId } = await checkRefs(b);
  const k = newApiKey(), secret = newWebhookSecret();
  const p = await one(`INSERT INTO api_partners (name, key_prefix, key_hash, shop_id, agency_id, webhook_url, webhook_secret)
                       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name`, [name, k.key_prefix, k.key_hash, shopId, agencyId, checkUrl(str(b.webhook_url, 300)), secret]);
  await audit(ctx, 'partner.create', 'partner', p.id, null, { name, agency_id: agencyId, shop_id: shopId, key_prefix: k.key_prefix });
  // the full key and the webhook secret are returned once and never stored in clear
  return { partner: p, api_key: k.key, webhook_secret: secret };
});

route('PATCH', '/partners/:id', ['admin'], async ctx => {
  const cur = await one(`SELECT * FROM api_partners WHERE id = $1`, [int(ctx.params.id)]);
  if (!cur) fail(404, 'Partenaire introuvable.');
  const b = ctx.body;
  const { agencyId, shopId } = await checkRefs({ agency_id: b.agency_id ?? cur.agency_id, shop_id: b.shop_id !== undefined ? b.shop_id : cur.shop_id });
  const v = { name: b.name != null ? str(b.name, 80) || cur.name : cur.name, webhook_url: b.webhook_url !== undefined ? checkUrl(str(b.webhook_url, 300)) : cur.webhook_url,
    active: b.active !== undefined ? bool(b.active) : cur.active, agency_id: agencyId, shop_id: shopId };
  await q(`UPDATE api_partners SET name = $2, webhook_url = $3, active = $4, agency_id = $5, shop_id = $6 WHERE id = $1`, [cur.id, v.name, v.webhook_url, v.active, v.agency_id, v.shop_id]);
  await audit(ctx, 'partner.update', 'partner', cur.id, { name: cur.name, webhook_url: cur.webhook_url, active: cur.active }, { name: v.name, webhook_url: v.webhook_url, active: v.active });
  return { ok: true };
});

/** New key (the old one stops working immediately) — shown once. */
route('POST', '/partners/:id/rotate', ['admin'], async ctx => {
  const cur = await one(`SELECT id, key_prefix FROM api_partners WHERE id = $1`, [int(ctx.params.id)]);
  if (!cur) fail(404, 'Partenaire introuvable.');
  const k = newApiKey();
  await q(`UPDATE api_partners SET key_prefix = $2, key_hash = $3 WHERE id = $1`, [cur.id, k.key_prefix, k.key_hash]);
  await audit(ctx, 'partner.rotate_key', 'partner', cur.id, { key_prefix: cur.key_prefix }, { key_prefix: k.key_prefix });
  return { api_key: k.key };
});

route('POST', '/partners/:id/secret', ['admin'], async ctx => {
  const cur = await one(`SELECT id FROM api_partners WHERE id = $1`, [int(ctx.params.id)]);
  if (!cur) fail(404, 'Partenaire introuvable.');
  const secret = newWebhookSecret();
  await q(`UPDATE api_partners SET webhook_secret = $2 WHERE id = $1`, [cur.id, secret]);
  await audit(ctx, 'partner.rotate_secret', 'partner', cur.id);
  return { webhook_secret: secret };
});

route('GET', '/webhooks', ['admin'], async ({ query }) => ({
  deliveries: await q(`SELECT w.id, w.partner_id, p.name AS partner_name, o.ref, w.event, w.status, w.attempts, w.last_status, w.last_error,
                              w.next_attempt_at, w.delivered_at, w.created_at
                       FROM webhook_deliveries w JOIN api_partners p ON p.id = w.partner_id LEFT JOIN orders o ON o.id = w.order_id
                       WHERE ($1::int IS NULL OR w.partner_id = $1) ORDER BY w.id DESC LIMIT 100`, [int(query.partner_id) || null]),
}));

route('POST', '/webhooks/:id/resend', ['admin'], async ctx => {
  const r = await resendDelivery(int(ctx.params.id));
  await audit(ctx, 'webhook.resend', 'webhook', ctx.params.id, null, { status: r.status, last_status: r.last_status });
  return r;
});
