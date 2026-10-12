// Shared domain constants and helpers (statuses, order query, events, agencies).
import { q, one } from './db.js';
import { normEmail } from './auth.js';
export { str, num, int, bool, need, TZ, startOf, TODAY, haversine, Sql } from './util.js';

// When set, the first-launch setup can only create the administrator with this e-mail.
export const ADMIN_EMAIL = normEmail(process.env.ADMIN_EMAIL);

export const ORDER_STATUSES = ['cree', 'attente', 'affecte', 'accepte', 'ramasse', 'transit', 'arrive', 'livraison', 'sur_place', 'livre', 'absent', 'refuse', 'reporte'];
export const ACTIVE = ['affecte', 'accepte', 'livraison', 'sur_place'];
export const EXCEPTIONS = ['absent', 'refuse', 'reporte'];
export const DRIVER_NEXT = {
  affecte: ['accepte'],
  accepte: ['livraison', ...EXCEPTIONS],
  livraison: ['sur_place', ...EXCEPTIONS],
  sur_place: ['livre', ...EXCEPTIONS],
};
export const CASH_TYPES = { 'Encaissement': 1, 'Paiement livreur': -1, 'Dépense': -1, 'Règlement': -1, 'Transfert': -1, 'Correction': 0 };
export const ROLE_LABEL = { admin: 'admin', manager: 'agence', driver: 'livreur', shop: 'boutique' };

export const ORDER_SELECT = `
  SELECT o.id, o.ref, o.client_name, o.client_phone, o.address, o.lat, o.lng,
         o.cod::float8 AS cod, o.payment_mode, o.weight::float8 AS weight, o.parcel_type, o.distance_km::float8 AS distance_km,
         o.delivery_fee::float8 AS delivery_fee, o.driver_share::float8 AS driver_share, o.saden_revenue::float8 AS saden_revenue,
         o.amount_to_remit::float8 AS amount_to_remit, o.sender_name, o.sender_phone, o.sender_address, o.external_ref,
         o.description, o.pieces, o.notes, o.source, o.status, o.driver_id, o.shop_id, o.manifest_id, o.created_at, o.updated_at,
         o.origin_agency_id, o.dest_agency_id, o.origin_city_id, o.dest_city_id, o.zone_id,
         (o.origin_city_id IS DISTINCT FROM o.dest_city_id) AS intercity,
         s.shop_name, d.name AS driver_name,
         oc.name AS origin_city_name, dc.name AS dest_city_name,
         coalesce(z.name, o.zone) AS zone_name, z.lat AS zone_lat, z.lng AS zone_lng,
         oa.name AS origin_agency_name, da.name AS dest_agency_name
  FROM orders o
  LEFT JOIN users s ON s.id = o.shop_id
  LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN cities oc ON oc.id = o.origin_city_id
  LEFT JOIN cities dc ON dc.id = o.dest_city_id
  LEFT JOIN zones z ON z.id = o.zone_id
  LEFT JOIN agencies oa ON oa.id = o.origin_agency_id
  LEFT JOIN agencies da ON da.id = o.dest_agency_id`;

export const actorOf = u => `${u.name} · ${ROLE_LABEL[u.role] || u.role}`;
export const otp4 = () => String(Math.floor(1000 + Math.random() * 9000));

export const addEvent = (orderId, status, actor, x = {}) => q(
  `INSERT INTO order_events (order_id, status, actor, lat, lng, proof_type, proof) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [orderId, status, actor, x.lat ?? null, x.lng ?? null, x.proof_type ?? null, x.proof ?? null]);

export async function syncDriverStatus(driverId) {
  if (!driverId) return;
  const busy = await one(`SELECT count(*)::int AS n FROM orders WHERE driver_id = $1 AND status IN ('livraison','sur_place')`, [driverId]);
  if (busy.n > 0) await q(`UPDATE users SET status = 'livraison' WHERE id = $1 AND status IN ('dispo','livraison')`, [driverId]);
  else await q(`UPDATE users SET status = 'dispo' WHERE id = $1 AND status = 'livraison'`, [driverId]);
}

/** Agency delivering to a destination: the agency serving the zone, else an active agency of the city. */
export async function resolveDestAgency(cityId, zoneId) {
  if (zoneId) {
    const r = await one(`SELECT ag.id FROM agency_zones az JOIN agencies ag ON ag.id = az.agency_id
                         WHERE az.zone_id = $1 AND ag.active ORDER BY ag.id LIMIT 1`, [zoneId]);
    if (r) return r.id;
  }
  const r = await one(`SELECT id FROM agencies WHERE city_id = $1 AND active ORDER BY id LIMIT 1`, [cityId]);
  return r?.id || null;
}

/** Agency currently responsible for the parcel: destination agency once an inter-city parcel left. */
export const handlingAgency = o =>
  o.origin_city_id !== o.dest_city_id && ['transit', 'arrive'].includes(o.status) ? o.dest_agency_id : o.origin_agency_id;

export const defaultAgency = () => one(`SELECT id, city_id FROM agencies WHERE active ORDER BY id LIMIT 1`);
