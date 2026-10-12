// Shared domain constants and helpers (statuses, order query, events).
import { q, one } from './db.js';
import { normEmail } from './auth.js';
export { str, num, need } from './util.js';
export { TZ, startOf, TODAY } from './util.js';

export const AGENCY_CITY = process.env.AGENCY_CITY || 'Gafsa';
// When set, the first-launch setup can only create the administrator with this e-mail.
export const ADMIN_EMAIL = normEmail(process.env.ADMIN_EMAIL);
export const FEE = Number(process.env.DELIVERY_FEE || 7);
export const DRIVER_SHARE = Number(process.env.DRIVER_SHARE || 2);

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
export const ROLE_LABEL = { admin: 'agence', driver: 'livreur', shop: 'boutique' };

export const ORDER_SELECT = `
  SELECT o.id, o.ref, o.client_name, o.client_phone, o.zone, o.address, o.lat, o.lng, o.dest_city,
         o.cod::float8 AS cod, o.status, o.driver_id, o.shop_id, o.manifest_id, o.created_at, o.updated_at,
         s.shop_name, d.name AS driver_name
  FROM orders o
  LEFT JOIN users s ON s.id = o.shop_id
  LEFT JOIN users d ON d.id = o.driver_id`;

export const actorOf = u => `${u.name} · ${ROLE_LABEL[u.role]}`;
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

