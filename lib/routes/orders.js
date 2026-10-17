// Orders: creation (staff / shop), detail, assignment, status changes — always inside the user's perimeter.
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail, normPhone } from '../auth.js';
import { ORDER_SELECT, otp4, str, num, int, need, Sql, resolveDestAgency, defaultAgency } from '../domain.js';
import { rankCandidates, autoAssign, handlingAgencyOf } from '../assign.js';
import { changeStatus, recordCreation, allowedNext } from '../status.js';
import { STAFF, scopeWhere, orderInScope } from '../scope.js';
import { computePrice, PAYMENT_MODES, PARCEL_TYPES } from '../pricing.js';

/**
 * Validates and inserts an order (§8, §22). Used by staff, shops and the partner API.
 * opts.source: 'manual' | 'shop' | 'api:<partner>' · opts.partner_id: partner creating the order
 */
export async function createOrder(body, user, opts = {}) {
  const client_name = need(str(body.client_name, 80), 'Nom du client obligatoire.');
  const client_phone = str(body.client_phone, 30);
  if (normPhone(client_phone).length !== 8) fail(400, 'Téléphone du client invalide.');
  const client_phone2 = str(body.client_phone2, 30) || null;
  if (client_phone2 && normPhone(client_phone2).length !== 8) fail(400, 'Téléphone 2 du client invalide.');
  const address = need(str(body.address), 'Adresse obligatoire.');
  const cod = num(body.cod) ?? 0;
  if (cod < 0) fail(400, 'Montant invalide.');
  const pieces = body.pieces == null || body.pieces === '' ? 1 : int(body.pieces);
  if (!(pieces >= 1 && pieces <= 999)) fail(400, 'Nombre de pièces invalide.');

  const destCityId = int(body.dest_city_id);
  const city = destCityId && await one(`SELECT id FROM cities WHERE id = $1 AND active`, [destCityId]);
  if (!city) fail(400, 'Ville de destination invalide.');
  const zoneId = int(body.zone_id) || null;
  if (zoneId && !(await one(`SELECT id FROM zones WHERE id = $1 AND city_id = $2 AND active`, [zoneId, destCityId])))
    fail(400, 'La zone doit appartenir à la ville de destination.');

  let shop = null;
  if (user.role === 'shop') shop = { id: user.shop_id || user.id, agency_id: user.agency_id, shop_name: user.shop_name, phone: user.shop_phone || user.phone, address: user.address };
  else if (int(body.shop_id)) {
    shop = await one(`SELECT id, agency_id, shop_name, phone, address FROM users WHERE id = $1 AND role = 'shop' AND active`, [int(body.shop_id)]);
    if (!shop) fail(400, 'Boutique invalide.');
    if (user.role === 'manager' && shop.agency_id !== user.agency_id) fail(403, 'Cette boutique dépend d’une autre agence.');
  }
  const originId = user.role === 'shop' || user.role === 'manager' ? user.agency_id
    : int(body.origin_agency_id) || shop?.agency_id || (await defaultAgency())?.id;
  const origin = originId && await one(`SELECT id, city_id, name, phone, address FROM agencies WHERE id = $1 AND active`, [originId]);
  if (!origin) fail(400, 'Agence de départ invalide.');
  const destAgencyId = await resolveDestAgency(destCityId, zoneId);

  const payment_mode = body.payment_mode || 'cod';
  if (!PAYMENT_MODES.includes(payment_mode)) fail(400, 'Mode de paiement invalide.');
  const weight = num(body.weight);
  if (weight != null && (weight <= 0 || weight > 1000)) fail(400, 'Poids invalide (kg).');
  const parcel_type = str(body.parcel_type, 40) || null;
  if (parcel_type && !PARCEL_TYPES.includes(parcel_type)) fail(400, 'Type de colis invalide.');
  const lat = num(body.lat), lng = num(body.lng);
  const codEff = payment_mode === 'prepaid' ? 0 : cod;

  // sender: explicit fields, else the shop, else the origin agency
  const sender_name = str(body.sender_name, 80) || shop?.shop_name || origin.name;
  const sender_phone = str(body.sender_phone, 30) || shop?.phone || origin.phone || null;
  if (sender_phone && normPhone(sender_phone).length !== 8) fail(400, 'Téléphone de l’expéditeur invalide.');
  const sender_address = str(body.sender_address) || shop?.address || origin.address || null;
  const source = opts.source || (user.role === 'shop' ? 'shop' : 'manual');

  // price computed from the rules and frozen on the order (§21)
  const price = await computePrice({ origin_agency_id: origin.id, origin_city_id: origin.city_id, dest_city_id: destCityId, zone_id: zoneId,
    shop_id: shop?.id || null, weight, parcel_type, cod: codEff, payment_mode, lat, lng });

  const cols = {
    status: 'cree', shop_id: shop?.id || null, client_name, client_phone, client_phone2, address, lat, lng, cod: codEff, otp: otp4(),
    origin_agency_id: origin.id, origin_city_id: origin.city_id, dest_city_id: destCityId, dest_agency_id: destAgencyId, zone_id: zoneId,
    payment_mode, weight, parcel_type, pieces, distance_km: price.km, pricing_rule_id: price.rule.id,
    delivery_fee: price.delivery_fee, driver_share: price.driver_share, saden_revenue: price.saden_revenue, amount_to_remit: price.amount_to_remit,
    sender_name, sender_phone, sender_address, external_ref: str(body.external_ref, 80) || null,
    description: str(body.description, 300) || null, notes: str(body.notes, 500) || null, source,
    goods_value: body.goods_value == null ? null : num(body.goods_value),
    ...(opts.partner_id ? { partner_id: opts.partner_id } : {}),
  };
  const keys = Object.keys(cols);
  const o = await one(
    `INSERT INTO orders (ref, ${keys.join(', ')}) VALUES ('SD-' || nextval('order_ref_seq'), ${keys.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id, ref`,
    keys.map(k => cols[k]));
  await recordCreation({ id: o.id, shop_id: cols.shop_id, driver_id: null }, opts.actor ? null : user, opts.actor);
  // §14 automatic mode of the agency (local parcels at creation, inter-city ones on arrival)
  await autoAssign(o.id).catch(e => console.error('auto-assign', e));
  // « colis d'échange »: an item is collected from the client at delivery (linked order E + ref)
  if (body.exchange === true || body.exchange === 'oui' || body.exchange === '1') {
    const { createPickup } = await import('../flows.js');
    const full = await one(`SELECT * FROM orders WHERE id = $1`, [o.id]);
    const p = await createPickup(user, full, { description: str(body.exchange_description, 300) || `Échange — à récupérer avec ${o.ref}`, agencyId: destAgencyId || origin.id });
    o.exchange_ref = p.ref;
  }
  return o;
}

route('POST', '/orders', ['admin', 'manager', 'shop'], async ({ user, body }) => ({ order: await createOrder(body, user) }));

route('GET', '/orders/:id', STAFF, async ({ params, user }) => {
  const { id } = await orderInScope(one, user, params.id, 'o.id');
  const order = await one(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  const { otp } = await one(`SELECT otp FROM orders WHERE id = $1`, [id]);
  const events = await q(`SELECT e.id, e.status, e.old_status, e.actor, e.note, e.lat, e.lng, e.proof_type, e.created_at
                          FROM order_events e WHERE e.order_id = $1 ORDER BY e.created_at, e.id`, [id]);
  const assignable = ['attente', 'en_agence', 'arrive', 'affecte', 'absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte'].includes(order.status);
  const ranking = assignable ? await rankCandidates(await one(`SELECT * FROM orders WHERE id = $1`, [id])) : null;
  return { order: { ...order, otp }, events, allowed: allowedNext(order, user), assignment: ranking };
});

route('GET', '/events/:id/proof', STAFF, async ({ params, user }) => {
  const e = await one(`SELECT order_id, proof_type, proof FROM order_events WHERE id = $1`, [int(params.id)]);
  if (!e?.proof) fail(404, 'Aucune preuve.');
  await orderInScope(one, user, e.order_id, 'o.id');
  return { proof_type: e.proof_type, proof: e.proof };
});

/** §14 ranked candidates (same agency, distance, availability, zone, load, vehicle) with the score detail. */
route('GET', '/orders/:id/candidates', STAFF, async ({ params, user }) => rankCandidates(await orderInScope(one, user, params.id)));

route('POST', '/orders/:id/assign', STAFF, async ({ user, params, body }) => {
  const o = await orderInScope(one, user, params.id);
  const d = await one(`SELECT id, name, agency_id FROM users WHERE id = $1 AND role = 'driver' AND active`, [int(body.driver_id)]);
  if (!d) fail(400, 'Livreur invalide.');
  if (d.agency_id !== handlingAgencyOf(o)) fail(400, 'Ce livreur ne dépend pas de l’agence qui traite ce colis.');
  if (user.role === 'manager' && d.agency_id !== user.agency_id) fail(403, 'Ce livreur dépend d’une autre agence.');
  await changeStatus(o, 'affecte', { user, driver: d });
  return { ok: true };
});

/** Status change by staff (state machine), the assigned driver (with proof for delivery) or the shop (cancel). */
route('POST', '/orders/:id/status', ['admin', 'manager', 'driver', 'shop'], async ({ user, params, body }) => {
  const o = await orderInScope(one, user, params.id, 'o.id, o.status, o.driver_id, o.shop_id, o.otp');
  const to = String(body.status || '');
  const ctx = { user, note: body.note, lat: num(body.lat), lng: num(body.lng) };
  if (to === 'livre') {
    ctx.proof_type = body.proof_type;
    if (body.proof_type === 'otp') {
      if (String(body.otp || '') !== o.otp) fail(400, 'Code OTP incorrect.');
    } else if (['photo', 'sign'].includes(body.proof_type)) {
      const p = String(body.proof || '');
      if (!p.startsWith('data:image/') || p.length > 3_000_000) fail(400, 'Preuve invalide.');
      ctx.proof = p;
    } else fail(400, 'Preuve de livraison requise.');
  }
  return changeStatus(o, to, ctx);
});

route('POST', '/orders/:id/cancel', ['admin', 'manager', 'shop'], async ({ user, params, body }) => {
  const o = await orderInScope(one, user, params.id, 'o.id, o.status, o.driver_id, o.shop_id');
  return changeStatus(o, 'annule', { user, note: body.note || (user.role === 'shop' ? 'Annulée par la boutique' : '') });
});
