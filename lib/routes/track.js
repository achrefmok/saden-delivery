import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail, normPhone } from '../auth.js';
import { AGENCY_CITY, ADMIN_EMAIL, FEE, DRIVER_SHARE, ORDER_STATUSES, ACTIVE, EXCEPTIONS, DRIVER_NEXT, CASH_TYPES, ORDER_SELECT, actorOf, otp4, addEvent, syncDriverStatus, str, num, need, TZ, startOf, TODAY } from '../domain.js';

/* public tracking (client) */
async function trackedOrder(body) {
  const ref = str(body.ref, 20).toUpperCase().replace(/\s/g, '');
  const phone = normPhone(body.phone);
  if (!ref || phone.length !== 8) fail(400, 'Numéro de colis et téléphone requis.');
  const o = await one(`SELECT o.*, o.cod::float8 AS cod, s.shop_name FROM orders o LEFT JOIN users s ON s.id = o.shop_id WHERE upper(o.ref) = $1`, [ref]);
  if (!o || normPhone(o.client_phone) !== phone) fail(404, 'Aucun colis ne correspond à ce numéro et ce téléphone.');
  return o;
}

route('POST', '/track', null, async ({ body }) => {
  const o = await trackedOrder(body);
  const [events, driver, review, claim] = await Promise.all([
    q(`SELECT status, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id`, [o.id]),
    o.driver_id ? one(`SELECT u.name, u.lat, u.lng, u.last_seen,
                         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating
                       FROM users u WHERE u.id = $1`, [o.driver_id]) : null,
    one(`SELECT stars FROM reviews WHERE order_id = $1`, [o.id]),
    one(`SELECT id FROM claims WHERE order_id = $1 LIMIT 1`, [o.id]),
  ]);
  const [first, last] = (driver?.name || '').split(' ');
  return {
    ref: o.ref, status: o.status, shop_name: o.shop_name, client_name: o.client_name, address: o.address, zone: o.zone,
    dest_city: o.dest_city, cod: o.cod, lat: o.lat, lng: o.lng, created_at: o.created_at,
    otp: ['livre', 'refuse'].includes(o.status) ? null : o.otp,
    events,
    driver: driver && { name: first + (last ? ' ' + last[0] + '.' : ''), rating: driver.rating, lat: driver.lat, lng: driver.lng, last_seen: driver.last_seen },
    reviewed: !!review, claimed: !!claim,
  };
});

route('POST', '/track/review', null, async ({ body }) => {
  const o = await trackedOrder(body);
  if (!['livre', ...EXCEPTIONS].includes(o.status)) fail(409, 'Vous pourrez donner votre avis une fois la livraison terminée.');
  const stars = num(body.stars);
  const cat = num(body.claim_category);
  if (stars != null) {
    if (o.status !== 'livre') fail(409, 'La note est réservée aux colis livrés.');
    if (!(stars >= 1 && stars <= 5)) fail(400, 'Note invalide.');
    if (await one(`SELECT id FROM reviews WHERE order_id = $1`, [o.id])) fail(409, 'Vous avez déjà noté cette livraison.');
    await q(`INSERT INTO reviews (order_id, driver_id, stars, comment) VALUES ($1,$2,$3,$4)`, [o.id, o.driver_id, Math.round(stars), str(body.comment, 500) || null]);
  }
  let claimRef = null;
  if (cat != null) {
    if (!(cat >= 0 && cat <= 6)) fail(400, 'Catégorie invalide.');
    const c = await one(`INSERT INTO claims (order_id, driver_id, category, text) VALUES ($1,$2,$3,$4) RETURNING id`,
      [o.id, o.driver_id, cat, str(body.comment, 500) || null]);
    claimRef = 'RC-' + String(c.id).padStart(4, '0');
  }
  if (stars == null && cat == null) fail(400, 'Choisissez une note ou un motif de réclamation.');
  return { ok: true, claim: claimRef };
});
