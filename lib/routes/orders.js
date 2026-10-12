// Orders: creation (staff / shop), detail, assignment, status changes — always inside the user's perimeter.
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail, normPhone } from '../auth.js';
import {
  ORDER_STATUSES, DRIVER_NEXT, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus,
  str, num, int, need, Sql, resolveDestAgency, handlingAgency, defaultAgency,
} from '../domain.js';
import { STAFF, scopeWhere, orderInScope } from '../scope.js';

/** Validates the destination (city → zone) and the origin agency, then inserts the order. */
export async function createOrder(body, user) {
  const client_name = need(str(body.client_name, 80), 'Nom du client obligatoire.');
  const client_phone = str(body.client_phone, 30);
  if (normPhone(client_phone).length !== 8) fail(400, 'Téléphone du client invalide.');
  const address = need(str(body.address), 'Adresse obligatoire.');
  const cod = num(body.cod) ?? 0;
  if (cod < 0) fail(400, 'Montant invalide.');

  const destCityId = int(body.dest_city_id);
  const city = destCityId && await one(`SELECT id FROM cities WHERE id = $1 AND active`, [destCityId]);
  if (!city) fail(400, 'Ville de destination invalide.');
  const zoneId = int(body.zone_id) || null;
  if (zoneId && !(await one(`SELECT id FROM zones WHERE id = $1 AND city_id = $2 AND active`, [zoneId, destCityId])))
    fail(400, 'La zone doit appartenir à la ville de destination.');

  let shop = null;
  if (user.role === 'shop') shop = user;
  else if (int(body.shop_id)) {
    shop = await one(`SELECT id, agency_id FROM users WHERE id = $1 AND role = 'shop' AND active`, [int(body.shop_id)]);
    if (!shop) fail(400, 'Boutique invalide.');
    if (user.role === 'manager' && shop.agency_id !== user.agency_id) fail(403, 'Cette boutique dépend d’une autre agence.');
  }
  const originId = user.role === 'shop' || user.role === 'manager' ? user.agency_id
    : int(body.origin_agency_id) || shop?.agency_id || (await defaultAgency())?.id;
  const origin = originId && await one(`SELECT id, city_id FROM agencies WHERE id = $1 AND active`, [originId]);
  if (!origin) fail(400, 'Agence de départ invalide.');
  const destAgencyId = await resolveDestAgency(destCityId, zoneId);

  const o = await one(
    `INSERT INTO orders (ref, shop_id, client_name, client_phone, address, lat, lng, cod, otp,
                         origin_agency_id, origin_city_id, dest_city_id, dest_agency_id, zone_id)
     VALUES ('SD-' || nextval('order_ref_seq'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, ref`,
    [shop?.id || null, client_name, client_phone, address, num(body.lat), num(body.lng), cod, otp4(),
     origin.id, origin.city_id, destCityId, destAgencyId, zoneId]);
  await addEvent(o.id, 'cree', actorOf(user));
  await addEvent(o.id, 'attente', 'Système');
  return o;
}

route('POST', '/orders', ['admin', 'manager', 'shop'], async ({ user, body }) => ({ order: await createOrder(body, user) }));

route('GET', '/orders/:id', STAFF, async ({ params, user }) => {
  const { id } = await orderInScope(one, user, params.id, 'o.id');
  const order = await one(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  const { otp } = await one(`SELECT otp FROM orders WHERE id = $1`, [id]);
  const events = await q(`SELECT id, status, actor, lat, lng, proof_type, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id`, [id]);
  return { order: { ...order, otp }, events };
});

route('GET', '/events/:id/proof', STAFF, async ({ params, user }) => {
  const e = await one(`SELECT order_id, proof_type, proof FROM order_events WHERE id = $1`, [int(params.id)]);
  if (!e?.proof) fail(404, 'Aucune preuve.');
  await orderInScope(one, user, e.order_id, 'o.id');
  return { proof_type: e.proof_type, proof: e.proof };
});

route('POST', '/orders/:id/assign', STAFF, async ({ user, params, body }) => {
  const o = await orderInScope(one, user, params.id);
  if (!['attente', 'arrive', 'reporte', 'absent', 'affecte'].includes(o.status)) fail(409, 'Ce colis ne peut pas être affecté maintenant.');
  const d = await one(`SELECT id, name, agency_id FROM users WHERE id = $1 AND role = 'driver' AND active`, [int(body.driver_id)]);
  if (!d) fail(400, 'Livreur invalide.');
  const allowed = o.origin_city_id !== o.dest_city_id ? [o.origin_agency_id, o.dest_agency_id] : [handlingAgency(o)];
  if (!allowed.includes(d.agency_id)) fail(400, 'Ce livreur ne dépend pas de l’agence qui traite ce colis.');
  if (user.role === 'manager' && d.agency_id !== user.agency_id) fail(403, 'Ce livreur dépend d’une autre agence.');
  await q(`UPDATE orders SET driver_id = $2, status = 'affecte', updated_at = now() WHERE id = $1`, [o.id, d.id]);
  await addEvent(o.id, 'affecte', `${actorOf(user)} → ${d.name}`);
  return { ok: true };
});

route('POST', '/orders/:id/status', ['admin', 'manager', 'driver'], async ({ user, params, body }) => {
  const o = await orderInScope(one, user, params.id, 'o.id, o.status, o.driver_id, o.otp');
  const next = String(body.status || '');
  if (!ORDER_STATUSES.includes(next)) fail(400, 'Statut invalide.');
  const x = { lat: num(body.lat), lng: num(body.lng) };
  if (user.role === 'driver') {
    if (!(DRIVER_NEXT[o.status] || []).includes(next)) fail(409, 'Action impossible à cette étape.');
    if (next === 'livre') {
      x.proof_type = body.proof_type;
      if (body.proof_type === 'otp') {
        if (String(body.otp || '') !== o.otp) fail(400, 'Code OTP incorrect.');
      } else if (['photo', 'sign'].includes(body.proof_type)) {
        const p = String(body.proof || '');
        if (!p.startsWith('data:image/') || p.length > 3_000_000) fail(400, 'Preuve invalide.');
        x.proof = p;
      } else fail(400, 'Preuve de livraison requise.');
    }
  }
  const replan = next === 'attente';
  await q(`UPDATE orders SET status = $2, updated_at = now()${replan ? ', driver_id = NULL' : ''} WHERE id = $1`, [o.id, next]);
  await addEvent(o.id, next, actorOf(user), x);
  await syncDriverStatus(o.driver_id);
  return { ok: true };
});
