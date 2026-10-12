import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail, normPhone } from '../auth.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* orders */
route('POST', '/orders', ['admin', 'shop'], async ({ user, body }) => {
  const client_name = need(str(body.client_name, 80), 'Nom du client obligatoire.');
  const client_phone = str(body.client_phone, 30);
  if (normPhone(client_phone).length !== 8) fail(400, 'Téléphone du client invalide.');
  const address = need(str(body.address), 'Adresse obligatoire.');
  const cod = num(body.cod) ?? 0;
  if (cod < 0) fail(400, 'Montant invalide.');
  const dest = str(body.dest_city, 60);
  let shopId = user.role === 'shop' ? user.id : (num(body.shop_id) || null);
  if (shopId && user.role === 'admin' && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop'`, [shopId]))) fail(400, 'Boutique invalide.');
  const o = await one(
    `INSERT INTO orders (ref, shop_id, client_name, client_phone, zone, address, lat, lng, dest_city, cod, otp)
     VALUES ('SD-' || nextval('order_ref_seq'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, ref`,
    [shopId, client_name, client_phone, str(body.zone, 80) || null, address, num(body.lat), num(body.lng),
     dest && dest !== AGENCY_CITY ? dest : null, cod, otp4()]);
  await addEvent(o.id, 'cree', actorOf(user));
  await addEvent(o.id, 'attente', 'Système');
  return { order: o };
});

route('GET', '/orders/:id', ['admin'], async ({ params }) => {
  const order = await one(`${ORDER_SELECT} WHERE o.id = $1`, [Number(params.id)]);
  if (!order) fail(404, 'Colis introuvable.');
  const { otp } = await one(`SELECT otp FROM orders WHERE id = $1`, [order.id]);
  const events = await q(`SELECT id, status, actor, lat, lng, proof_type, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id`, [order.id]);
  return { order: { ...order, otp }, events };
});

route('GET', '/events/:id/proof', ['admin'], async ({ params }) => {
  const e = await one(`SELECT proof_type, proof FROM order_events WHERE id = $1`, [Number(params.id)]);
  if (!e?.proof) fail(404, 'Aucune preuve.');
  return e;
});

route('POST', '/orders/:id/assign', ['admin'], async ({ user, params, body }) => {
  const o = await one(`SELECT id, status, driver_id FROM orders WHERE id = $1`, [Number(params.id)]);
  if (!o) fail(404, 'Colis introuvable.');
  if (!['attente', 'arrive', 'reporte', 'absent', 'affecte'].includes(o.status)) fail(409, 'Ce colis ne peut pas être affecté maintenant.');
  const d = await one(`SELECT id, name FROM users WHERE id = $1 AND role = 'driver' AND active`, [num(body.driver_id)]);
  if (!d) fail(400, 'Livreur invalide.');
  await q(`UPDATE orders SET driver_id = $2, status = 'affecte', updated_at = now() WHERE id = $1`, [o.id, d.id]);
  await addEvent(o.id, 'affecte', `${actorOf(user)} → ${d.name}`);
  return { ok: true };
});

route('POST', '/orders/:id/status', ['admin', 'driver'], async ({ user, params, body }) => {
  const o = await one(`SELECT id, status, driver_id, otp FROM orders WHERE id = $1`, [Number(params.id)]);
  if (!o) fail(404, 'Colis introuvable.');
  const next = String(body.status || '');
  if (!ORDER_STATUSES.includes(next)) fail(400, 'Statut invalide.');
  const x = { lat: num(body.lat), lng: num(body.lng) };
  if (user.role === 'driver') {
    if (o.driver_id !== user.id) fail(403, 'Ce colis ne vous est pas affecté.');
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
