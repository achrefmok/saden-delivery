// Shared domain constants and helpers (statuses, order query, events, agencies).
import { one } from './db.js';
import { normEmail } from './auth.js';
export { str, num, int, bool, need, TZ, startOf, TODAY, haversine, Sql } from './util.js';

// When set, the first-launch setup can only create the administrator with this e-mail.
export const ADMIN_EMAIL = normEmail(process.env.ADMIN_EMAIL);

export { STATUSES, EXCEPTIONS, DRIVER_EXCEPTIONS, ACTIVE, FINAL, RETURNS, actorOf, syncDriverStatus } from './status.js';
export const CASH_TYPES = { 'Encaissement': 1, 'Paiement livreur': -1, 'Dépense': -1, 'Règlement': -1, 'Transfert': -1, 'Correction': 0 };

export const ORDER_SELECT = `
  SELECT o.id, o.ref, o.client_name, o.client_phone, o.address, o.lat, o.lng,
         o.cod::float8 AS cod, o.payment_mode, o.weight::float8 AS weight, o.parcel_type, o.distance_km::float8 AS distance_km,
         o.delivery_fee::float8 AS delivery_fee, o.driver_share::float8 AS driver_share, o.saden_revenue::float8 AS saden_revenue,
         o.amount_to_remit::float8 AS amount_to_remit, o.sender_name, o.sender_phone, o.sender_address, o.external_ref,
         o.description, o.pieces, o.notes, o.source, o.status, o.driver_id, o.shop_id, o.manifest_id, o.created_at, o.updated_at,
         o.origin_agency_id, o.dest_agency_id, o.origin_city_id, o.dest_city_id, o.zone_id, o.current_agency_id,
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

export const otp4 = () => String(Math.floor(1000 + Math.random() * 9000));

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
