// Delivery attempts and parcel problems (operations follow-up).
// Every failed delivery reported by a driver (or set by the agency) adds one attempt to the parcel and opens a
// problem in the queue of the agency handling it; agents call the client, set an appointment, mark it treated or
// « faux problème ». Called from changeStatus(), in the same transaction as the status change.
import { q, one } from './db.js';

/** Problem types (value → label). */
export const PROBLEM_TYPES = {
  absent: 'Client absent', injoignable: 'Injoignable', ne_repond_pas: 'Ne répond pas', adresse_erronee: 'Adresse erronée',
  numero_errone: 'Numéro erroné', rdv: 'Rendez-vous', refus: 'Refus / annulé par le client', non_serieux: 'Client non sérieux',
  montant_incorrect: 'Montant incorrect', endommage: 'Endommagé', autre: 'Autre',
};
/** Incident status → problem type; the first five are failed delivery attempts. */
export const INCIDENT_TYPE = { absent: 'absent', refuse: 'refus', reporte: 'rdv', numero_incorrect: 'numero_errone', adresse_incorrecte: 'adresse_erronee', endommage: 'endommage' };
export const FAILED_ATTEMPT = ['absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte'];
export const CALL_OUTCOMES = { joint: 'Client joint', ne_repond_pas: 'Ne répond pas', injoignable: 'Injoignable / éteint', numero_errone: 'Numéro erroné', rappeler: 'À rappeler' };

/** Agency in charge of a parcel's problem: the driver's agency, else where the parcel is, else its origin. */
const agencyFor = orderId => one(
  `SELECT coalesce(d.agency_id, o.current_agency_id, o.dest_agency_id, o.origin_agency_id) AS id
   FROM orders o LEFT JOIN users d ON d.id = o.driver_id WHERE o.id = $1`, [orderId]);

export async function openProblem({ orderId, type, note = null, user = null, driverId = null, rdvAt = null }) {
  const o = await one(`SELECT attempts, driver_id FROM orders WHERE id = $1`, [orderId]);
  const ag = await agencyFor(orderId);
  // one open problem per parcel: the previous one is superseded by the new attempt
  await q(`UPDATE parcel_problems SET status = 'treated', resolution = 'Remplacé par un nouveau problème', treated_at = now()
           WHERE order_id = $1 AND status = 'open'`, [orderId]);
  return one(`INSERT INTO parcel_problems (order_id, agency_id, type, note, attempt, driver_id, created_by, rdv_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orderId, ag?.id || null, type, note, o?.attempts || 0, driverId ?? o?.driver_id ?? null, user?.id || null, rdvAt]);
}

/** Hook of the state machine: attempt counter + problem for every incident. */
const CLOSING = { livre: 'livré', annule: 'annulé', restitue: 'restitué à l’expéditeur', perdu: 'déclaré perdu' };

export async function onIncident(order, to, ctx = {}) {
  if (CLOSING[to]) {
    await q(`UPDATE parcel_problems SET status = 'treated', resolution = $2, treated_at = now() WHERE order_id = $1 AND status = 'open'`,
      [order.id, `Clôturé automatiquement : colis ${CLOSING[to]}`]);
    return;
  }
  if (!INCIDENT_TYPE[to]) return;
  if (FAILED_ATTEMPT.includes(to)) await q(`UPDATE orders SET attempts = attempts + 1 WHERE id = $1`, [order.id]);
  await openProblem({ orderId: order.id, type: INCIDENT_TYPE[to], note: ctx.note ?? null, user: ctx.user || null, driverId: order.driver_id ?? null });
}
