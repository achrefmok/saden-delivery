// §19, §20 — public partner API, versioned under /api/v1 (documentation: docs/API.md).
// Authentication: "Authorization: Bearer sk_live_…" or "X-Api-Key". A partner only ever sees its own orders;
// OTP codes and delivery proofs are never exposed.
import { route, reply, setPartnerAuth } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { str, num, int } from '../domain.js';
import { createOrder } from './orders.js';
import { computePrice, PAYMENT_MODES } from '../pricing.js';
import { authenticatePartner, processWebhookQueue } from '../partners.js';

setPartnerAuth(req => authenticatePartner(req));

const V1_SELECT = `
  SELECT o.id, o.ref, o.external_ref, o.status, o.client_name, o.client_phone, o.address, o.lat, o.lng,
         o.cod::float8 AS cod, o.goods_value::float8 AS goods_value, o.payment_mode, o.delivery_fee::float8 AS delivery_fee,
         o.amount_to_remit::float8 AS amount_to_remit, o.pieces, o.weight::float8 AS weight, o.description, o.notes, o.sender_name,
         dc.name AS city, coalesce(z.name, o.zone) AS zone, o.created_at, o.updated_at
  FROM orders o LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN zones z ON z.id = o.zone_id`;

const origin = req => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

async function present(req, o) {
  const items = await q(`SELECT name, qty, price::float8 AS price FROM order_items WHERE order_id = $1 ORDER BY id`, [o.id]);
  const { id, ...rest } = o;
  return { ...rest, items, tracking_url: `${origin(req)}/?t=${encodeURIComponent(o.ref)}` };
}

async function partnerOrder(partner, ref) {
  const o = await one(`${V1_SELECT} WHERE o.partner_id = $1 AND (upper(o.ref) = upper($2) OR o.external_ref = $2)`, [partner.id, String(ref)]);
  if (!o) fail(404, 'Commande introuvable.');
  return o;
}

async function resolveCity(b) {
  const c = int(b.city_id)
    ? await one(`SELECT id FROM cities WHERE id = $1 AND active`, [int(b.city_id)])
    : await one(`SELECT c.id FROM cities c JOIN governorates g ON g.id = c.governorate_id
                 WHERE c.active AND lower(c.name) = lower($1) AND ($2::text IS NULL OR lower(g.name) = lower($2)) ORDER BY c.id LIMIT 1`,
      [str(b.city, 80), str(b.governorate, 80) || null]);
  if (!c) fail(422, 'Ville inconnue : utilisez city_id ou le nom exact d’une ville active.');
  let zoneId = null;
  if (b.zone_id || b.zone) {
    const z = int(b.zone_id)
      ? await one(`SELECT id FROM zones WHERE id = $1 AND city_id = $2 AND active`, [int(b.zone_id), c.id])
      : await one(`SELECT id FROM zones WHERE city_id = $1 AND active AND lower(name) = lower($2)`, [c.id, str(b.zone, 80)]);
    if (!z) fail(422, 'Zone inconnue pour cette ville.');
    zoneId = z.id;
  }
  return { cityId: c.id, zoneId };
}

function parseItems(items) {
  if (items == null) return [];
  if (!Array.isArray(items) || items.length > 100) fail(422, 'items : tableau de produits attendu (100 max).');
  return items.map((it, i) => {
    const name = str(it?.name, 120), qty = int(it?.qty ?? 1), price = it?.price == null ? null : num(it.price);
    if (!name || !(qty > 0) || (price != null && price < 0)) fail(422, `items[${i}] invalide (name, qty > 0, price ≥ 0).`);
    return { name, qty, price };
  });
}

/* create (idempotent through external_ref or the Idempotency-Key header) */
route('POST', '/v1/orders', 'partner', async ({ req, body, partner }) => {
  processWebhookQueue(3).catch(() => {});
  const idemKey = str(req.headers['idempotency-key'], 120) || null;
  const extRef = str(body.external_ref, 80) || null;
  const replay = async id => reply(200, { order: await present(req, await one(`${V1_SELECT} WHERE o.id = $1`, [id])), idempotent_replay: true }, { 'Idempotent-Replay': 'true' });
  if (idemKey) {
    const k = await one(`SELECT order_id FROM idempotency_keys WHERE partner_id = $1 AND key = $2`, [partner.id, idemKey]);
    if (k?.order_id) return replay(k.order_id);
  }
  if (extRef) {
    const ex = await one(`SELECT id FROM orders WHERE partner_id = $1 AND external_ref = $2`, [partner.id, extRef]);
    if (ex) return replay(ex.id);
  }
  const items = parseItems(body.items);
  const { cityId, zoneId } = await resolveCity(body);
  if (body.payment_mode && !PAYMENT_MODES.includes(body.payment_mode)) fail(422, 'payment_mode : cod, prepaid ou sender_pays.');
  const goods = body.amount != null ? num(body.amount) : items.reduce((a, it) => a + (it.price ?? 0) * it.qty, 0) || null;
  const input = {
    origin_agency_id: partner.agency_id, shop_id: partner.shop_id || null,
    sender_name: partner.shop_id ? null : str(body.shop_name, 80) || partner.name,
    sender_phone: body.shop_phone, sender_address: body.shop_address,
    client_name: body.client_name, client_phone: body.client_phone, address: body.address, lat: body.lat, lng: body.lng,
    dest_city_id: cityId, zone_id: zoneId, cod: body.cod ?? 0, payment_mode: body.payment_mode || 'cod',
    weight: body.weight, parcel_type: body.parcel_type, pieces: body.pieces ?? (items.reduce((a, it) => a + it.qty, 0) || 1),
    description: body.description || items.map(it => `${it.qty} × ${it.name}`).join(', ').slice(0, 300),
    external_ref: extRef, notes: body.notes, goods_value: goods,
  };
  let o;
  try {
    o = await createOrder(input, { role: 'admin', id: null, name: 'API ' + partner.name },
      { source: 'api:' + partner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), partner_id: partner.id, actor: `API · ${partner.name}` });
  } catch (e) {
    if (e.code === '23505' && extRef) {        // concurrent request with the same external_ref
      const ex = await one(`SELECT id FROM orders WHERE partner_id = $1 AND external_ref = $2`, [partner.id, extRef]);
      if (ex) return replay(ex.id);
    }
    if (e.status === 400) fail(422, e.message);
    throw e;
  }
  for (const it of items) await q(`INSERT INTO order_items (order_id, name, qty, price) VALUES ($1,$2,$3,$4)`, [o.id, it.name, it.qty, it.price]);
  if (idemKey) await q(`INSERT INTO idempotency_keys (partner_id, key, order_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [partner.id, idemKey, o.id]);
  return reply(201, { order: await present(req, await one(`${V1_SELECT} WHERE o.id = $1`, [o.id])) });
});

route('GET', '/v1/orders/:ref', 'partner', async ({ req, params, partner }) => ({ order: await present(req, await partnerOrder(partner, params.ref)) }));

route('GET', '/v1/orders/:ref/status', 'partner', async ({ params, partner }) => {
  const o = await partnerOrder(partner, params.ref);
  return { ref: o.ref, external_ref: o.external_ref, status: o.status, updated_at: o.updated_at };
});

route('GET', '/v1/orders/:ref/tracking', 'partner', async ({ req, params, partner }) => {
  const o = await partnerOrder(partner, params.ref);
  const events = await q(`SELECT status, created_at AS at FROM order_events WHERE order_id = $1 ORDER BY created_at, id`, [o.id]);
  return { ref: o.ref, external_ref: o.external_ref, status: o.status, events, tracking_url: `${origin(req)}/?t=${encodeURIComponent(o.ref)}` };
});

/* update: only some fields, and only before a driver is assigned */
const PATCHABLE = ['client_name', 'client_phone', 'address', 'lat', 'lng', 'notes', 'description', 'cod'];
route('PATCH', '/v1/orders/:ref', 'partner', async ({ req, params, body, partner }) => {
  const o = await partnerOrder(partner, params.ref);
  if (!['cree', 'attente'].includes(o.status)) fail(409, 'Commande déjà prise en charge : modification impossible.');
  const bad = Object.keys(body).filter(k => !PATCHABLE.includes(k));
  if (bad.length) fail(422, `Champs non modifiables : ${bad.join(', ')}.`);
  const sets = [], vals = [o.id];
  const set = (c, v) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
  if (body.client_name != null) { const v = str(body.client_name, 80); if (!v) fail(422, 'client_name vide.'); set('client_name', v); }
  if (body.client_phone != null) { const v = str(body.client_phone, 30); if (String(v).replace(/\D/g, '').slice(-8).length !== 8) fail(422, 'client_phone invalide.'); set('client_phone', v); }
  if (body.address != null) { const v = str(body.address); if (!v) fail(422, 'address vide.'); set('address', v); }
  for (const k of ['lat', 'lng']) if (body[k] !== undefined) set(k, num(body[k]));
  if (body.notes !== undefined) set('notes', str(body.notes, 500) || null);
  if (body.description !== undefined) set('description', str(body.description, 300) || null);
  if (body.cod !== undefined) {
    const cod = num(body.cod); if (cod == null || cod < 0) fail(422, 'cod invalide.');
    const full = await one(`SELECT * FROM orders WHERE id = $1`, [o.id]);
    const codEff = full.payment_mode === 'prepaid' ? 0 : cod;
    const p = await computePrice({ ...full, cod: codEff, weight: full.weight == null ? null : Number(full.weight), km: full.distance_km == null ? null : Number(full.distance_km) });
    set('cod', codEff); set('delivery_fee', p.delivery_fee); set('driver_share', p.driver_share); set('saden_revenue', p.saden_revenue);
    set('amount_to_remit', p.amount_to_remit); set('pricing_rule_id', p.rule.id);
  }
  if (!sets.length) fail(422, 'Rien à modifier.');
  await q(`UPDATE orders SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
  await q(`INSERT INTO order_events (order_id, status, old_status, actor, note) VALUES ($1, $2, $2, $3, $4)`,
    [o.id, o.status, `API · ${partner.name}`, 'Modification : ' + Object.keys(body).join(', ')]);
  return { order: await present(req, await one(`${V1_SELECT} WHERE o.id = $1`, [o.id])) };
});
