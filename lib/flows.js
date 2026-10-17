// Physical flows of parcels, shared by « Entrée en stock », the scanner and the bordereaux.
// Every flow goes through the state machine (changeStatus) — which writes the stock movement — so the
// status history, the stock and the audit always tell the same story.
import { q, one } from './db.js';
import { fail } from './auth.js';
import { changeStatus, recordCreation, syncDriverStatus, DRIVER_EXCEPTIONS, ACTIVE, FINAL } from './status.js';
import { stockIn, stockOut } from './stock.js';
import { handlingAgencyOf } from './assign.js';
import { otp4 } from './domain.js';

/** Return motives (bordereau de retour / entrée en stock): key → [label, incident status recorded first]. */
export const RETURN_REASONS = {
  absent: ['Client absent', 'absent'],
  injoignable: ['Client injoignable', 'numero_incorrect'],
  refus: ['Refus du client', 'refuse'],
  adresse: ['Adresse incorrecte', 'adresse_incorrecte'],
  reporte: ['Livraison reportée', 'reporte'],
  boutique: ['Retour demandé par la boutique', null],
  autre: ['Autre', null],
};
export const reasonLabel = (key, comment) => (RETURN_REASONS[key]?.[0] || key || '') + (comment ? ' — ' + comment : '');
export function checkReason(key, comment) {
  if (!RETURN_REASONS[key]) fail(400, 'Motif de retour invalide.');
  if (key === 'autre' && !String(comment || '').trim()) fail(400, 'Commentaire obligatoire pour le motif « Autre ».');
}

const reload = id => one(`SELECT * FROM orders WHERE id = $1`, [id]);

/** Parcel is with a driver (out of the agency) and may come back through a return. */
export const withDriver = o => !o.in_stock && !!o.driver_id && !FINAL.includes(o.status) && o.status !== 'transit'
  && [...ACTIVE, ...DRIVER_EXCEPTIONS, 'retour'].includes(o.status);

/**
 * A driver brings a parcel back: the motive is recorded (incident status when the parcel was still
 * « in progress »), then the agency confirms the entry → en_agence (or retour_agence when the shop asked for it).
 */
export async function bringBack(user, order, { reason, comment, agencyId, manifestId = null }) {
  checkReason(reason, comment);
  if (order.in_stock) fail(409, `${order.ref} est déjà en stock.`);
  if (!withDriver(order)) fail(409, `${order.ref} n’est pas chez un livreur (statut « ${order.status} »).`);
  const note = reasonLabel(reason, comment), driverId = order.driver_id;
  const stock = { reason: 'return_driver', manifest_id: manifestId };
  let o = order;
  const step = async to => { await changeStatus(o, to, { user, note, agencyId, stock }); o = await reload(o.id); };
  const incident = RETURN_REASONS[reason][1];
  if (incident && ['accepte', 'ramasse', 'livraison', 'sur_place'].includes(o.status)) await step(incident);
  if (o.status === 'retour') await step('retour_agence');
  else {
    if (o.status !== 'en_agence') await step('en_agence');
    if (reason === 'boutique') { await step('retour'); await step('retour_agence'); }
  }
  // back on the shelf: no driver any more (the history keeps who had it)
  await q(`UPDATE orders SET driver_id = NULL WHERE id = $1`, [o.id]);
  await syncDriverStatus(driverId);
  return reload(o.id);
}

/** Parcel deposited by a shop / collected by a driver from a shop → enters the stock of the agency. */
export async function receiveDeposit(user, order, agencyId) {
  if (['attente', 'ramasse', 'affecte'].includes(order.status)) {
    await changeStatus(order, 'en_agence', { user, agencyId, stock: { reason: 'reception' } });
    // on the shelf: the driver who collected it no longer holds it
    if (order.driver_id) { await q(`UPDATE orders SET driver_id = NULL WHERE id = $1`, [order.id]); await syncDriverStatus(order.driver_id); }
    return reload(order.id);
  }
  fail(409, `Réception impossible : statut « ${order.status} ».`);
}

/**
 * Checks that a parcel may be handed to `driver` from `agencyId` stock (dispatch / exchange).
 * Returns null when compatible, else the reason.
 */
export function dispatchProblem(o, agencyId) {
  if (o.kind === 'pickup') return 'colis à récupérer (utilisez un bordereau d’échange)';
  if (!o.in_stock || o.current_agency_id !== agencyId) return 'pas en stock dans cette agence';
  if (!['en_agence', 'arrive', 'affecte', 'attente'].includes(o.status)) return `statut « ${o.status} » incompatible`;
  if (o.origin_city_id !== o.dest_city_id && o.dest_agency_id !== agencyId) return 'colis inter-villes : à envoyer par bordereau inter-agences';
  if (handlingAgencyOf({ ...o, current_agency_id: agencyId }) !== agencyId && o.dest_agency_id !== agencyId) return 'livré par une autre agence';
  return null;
}

/** Hands a parcel over to the driver: assignment (if needed) then exit from the stock. */
export async function handOver(user, order, driver, { manifestId, agencyId }) {
  const problem = dispatchProblem(order, agencyId);
  if (problem) fail(409, `${order.ref} : ${problem}.`);
  let o = order;
  if (o.status !== 'affecte' || o.driver_id !== driver.id) {
    await changeStatus(o, 'affecte', { user, driver, stock: { manifest_id: manifestId } });
    o = await reload(o.id);
  }
  await stockOut(o.id, { reason: 'dispatch', manifestId, user });
  return reload(o.id);
}

/** Exchange: creates the « pickup » order (item to collect from the client), linked to the parcel delivered. */
export async function createPickup(user, deliver, { description, agencyId }) {
  // reference of the item to collect: « E » + parcel reference (-2, -3… for later exchanges of the same parcel)
  const n = (await one(`SELECT count(*)::int AS n FROM orders WHERE related_order_id = $1 AND kind = 'pickup'`, [deliver.id])).n;
  const ref = 'E' + deliver.ref + (n ? '-' + (n + 1) : '');
  const o = await one(
    `INSERT INTO orders (ref, status, kind, related_order_id, shop_id, client_name, client_phone, address, lat, lng, zone, zone_id,
                         dest_city, dest_city_id, origin_city_id, origin_agency_id, dest_agency_id, cod, payment_mode, pieces, description,
                         sender_name, sender_phone, sender_address, delivery_fee, driver_share, saden_revenue, amount_to_remit, otp, source, notes)
     SELECT $5, 'cree', 'pickup', o.id, o.shop_id, o.client_name, o.client_phone, o.address, o.lat, o.lng, o.zone, o.zone_id,
            o.dest_city, o.dest_city_id, ag.city_id, $2, $2, 0, 'prepaid', 1, $3,
            o.client_name, o.client_phone, o.address, 0, 0, 0, 0, $4, 'exchange', 'Échange — à récupérer chez le client (' || o.ref || ')'
     FROM orders o JOIN agencies ag ON ag.id = $2 WHERE o.id = $1
     RETURNING id, ref, shop_id`, [deliver.id, agencyId, String(description || '').slice(0, 300) || `Retour échange de ${deliver.ref}`, otp4(), ref]);
  await recordCreation({ id: o.id, shop_id: o.shop_id, driver_id: null }, user);
  return reload(o.id);
}

/** Pickup collected by the driver and brought to the agency → in stock (returned by a client). */
export async function receivePickup(user, order, agencyId, manifestId = null) {
  if (order.in_stock) return order;
  if (!['attente', 'affecte', 'accepte', 'ramasse', 'livraison', 'sur_place'].includes(order.status)) fail(409, `${order.ref} : statut « ${order.status} » incompatible.`);
  await changeStatus(order, 'en_agence', { user, agencyId, note: 'Récupéré chez le client (échange)', stock: { reason: 'exchange_pickup', manifest_id: manifestId } });
  if (order.driver_id) { await q(`UPDATE orders SET driver_id = NULL WHERE id = $1`, [order.id]); await syncDriverStatus(order.driver_id); }
  return reload(order.id);
}

export { stockIn, stockOut };
