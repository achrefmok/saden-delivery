// §9 — scanning (camera QR / barcode or manual entry). The action is chosen before scanning;
// every scan writes an audit event (user, action, GPS when available).
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { str, num, int, Sql } from '../domain.js';
import { STAFF, scopeWhere, scopeAgency } from '../scope.js';
import { changeStatus } from '../status.js';
import { audit } from '../audit.js';

/** Statuses meaning the parcel is physically inside an agency. */
export const IN_AGENCY = ['en_agence', 'arrive', 'retour_agence', 'endommage'];

/** Scan actions implemented by other modules (bordereaux): name → async fn({ order, user, body, agencyId }) → result */
export const scanActions = {};

/** Extracts a parcel reference from a scanned payload (plain ref or tracking URL ?t=SD-…). */
export function refFromCode(code) {
  const raw = String(code || '').trim();
  const m = raw.match(/[?&]t=([^&#]+)/);
  return decodeURIComponent(m ? m[1] : raw).toUpperCase().replace(/\s/g, '').slice(0, 30);
}

/** Agency where a staff member is scanning: manager → his agency; admin → chosen agency or the parcel's. */
const scanAgency = (user, body, o) => scopeAgency(user, body.agency_id) || o.current_agency_id || o.origin_agency_id;

const ACTIONS = {
  // parcel dropped at / collected into the agency
  async reception({ o, user, agencyId }) {
    if (['attente', 'ramasse', 'affecte'].includes(o.status)) {
      await changeStatus(o, 'en_agence', { user, agencyId, note: null });
      return { message: 'Reçu en agence', status: 'en_agence' };
    }
    if (IN_AGENCY.includes(o.status)) {
      await q(`UPDATE orders SET current_agency_id = $2 WHERE id = $1`, [o.id, agencyId]);
      return { message: 'Déjà en agence (emplacement mis à jour)', status: o.status };
    }
    fail(409, `Réception impossible : statut « ${o.status} ».`);
  },
  // returned parcel back in the agency
  async return({ o, user, agencyId }) {
    if (o.status !== 'retour') fail(409, 'Ce colis n’est pas en retour.');
    await changeStatus(o, 'retour_agence', { user, agencyId });
    return { message: 'Retour reçu en agence', status: 'retour_agence' };
  },
  // inventory: compare scanned parcels with those expected in the agency
  async inventory({ o, agencyId }) {
    const expected = o.current_agency_id === agencyId && IN_AGENCY.includes(o.status);
    return { message: expected ? 'Attendu en agence' : 'Non attendu dans cette agence', expected, status: o.status };
  },
};

route('POST', '/scan', ['admin', 'manager', 'driver'], async ctx => {
  const { user, body } = ctx;
  const action = str(body.action, 30);
  const ref = refFromCode(body.code || body.ref);
  if (!ref) fail(400, 'Code illisible.');
  const s = new Sql([ref]);
  const o = await one(`SELECT o.* FROM orders o WHERE upper(o.ref) = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  const gps = { lat: num(body.lat), lng: num(body.lng) };
  if (!o) {
    await audit(ctx, 'scan.' + (action || '?'), 'order', ref, null, { found: false, ...gps });
    fail(404, `Colis ${ref} introuvable dans votre périmètre.`);
  }
  let result;
  if (user.role === 'driver') {
    if (action !== 'delivery') fail(403, 'Action réservée à l’agence.');
    result = { message: 'Mission ouverte', status: o.status };
  } else if (ACTIONS[action]) {
    result = await ACTIONS[action]({ o, user, body, agencyId: scanAgency(user, body, o) });
  } else if (scanActions[action]) {
    result = await scanActions[action]({ order: o, user, body, agencyId: scanAgency(user, body, o) });
  } else fail(400, 'Action de scan inconnue.');
  await audit(ctx, 'scan.' + action, 'order', o.id, { status: o.status }, { ref: o.ref, ...result, ...gps });
  return { order: { id: o.id, ref: o.ref, client_name: o.client_name, status: result.status || o.status }, ...result };
});

/** Parcels expected inside an agency (inventory baseline). */
route('GET', '/inventory', STAFF, async ({ user, query }) => {
  const agencyId = scopeAgency(user, query.agency_id);
  if (!agencyId) fail(400, 'Choisissez une agence.');
  return {
    agency_id: agencyId,
    expected: await q(`SELECT id, ref, client_name, status, updated_at FROM orders
                       WHERE current_agency_id = $1 AND status = ANY($2::text[]) ORDER BY ref`, [agencyId, IN_AGENCY]),
  };
});

/** Stores the inventory result (scanned vs expected) in the audit log. */
route('POST', '/inventory/report', STAFF, async ctx => {
  const { user, body } = ctx;
  const agencyId = scopeAgency(user, body.agency_id);
  if (!agencyId) fail(400, 'Choisissez une agence.');
  const scanned = [...new Set((Array.isArray(body.scanned) ? body.scanned : []).map(refFromCode))].slice(0, 2000);
  const expected = (await q(`SELECT ref FROM orders WHERE current_agency_id = $1 AND status = ANY($2::text[])`, [agencyId, IN_AGENCY])).map(r => r.ref);
  const missing = expected.filter(r => !scanned.includes(r)), unexpected = scanned.filter(r => !expected.includes(r));
  const summary = { agency_id: agencyId, expected: expected.length, scanned: scanned.length, missing, unexpected };
  await audit(ctx, 'inventory.report', 'agency', agencyId, null, summary);
  return summary;
});
