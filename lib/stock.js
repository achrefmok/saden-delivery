// Stock per agency: physical presence of a parcel = orders.in_stock + orders.current_agency_id.
// Every entry / exit writes one stock_movements row in the same statement chain as the change
// (inside the caller's transaction when there is one). Updates are conditional and take a row lock,
// so the same parcel can never be received twice nor leave twice (no duplicated movement).
import { q, one } from './db.js';

/** Status reached → implicit stock effect (explicit flows pass their own reason / bordereau). */
export const STOCK_IN = { en_agence: 'reception', arrive: 'transfer_in', retour_agence: 'return' };
export const STOCK_OUT = { transit: 'transfer_out', livraison: 'delivery', sur_place: 'delivery', livre: 'delivery', restitue: 'restitution', perdu: 'lost' };

export const MOVE_REASONS = {
  reception: 'Réception en agence', transfer_in: 'Réception transfert', transfer_out: 'Départ transfert', return: 'Retour en agence',
  return_driver: 'Retour livreur', dispatch: 'Remise au livreur', delivery: 'Sortie livraison', restitution: 'Restitution boutique',
  lost: 'Déclaré perdu', inventory_adjust: 'Correction d’inventaire', cancel: 'Annulation de bordereau', exchange_pickup: 'Récupération échange',
  relocation: 'Changement d’agence',
};

async function move(orderId, agencyId, direction, reason, { manifestId = null, user = null, note = null } = {}) {
  await q(`INSERT INTO stock_movements (order_id, agency_id, direction, reason, manifest_id, user_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [orderId, agencyId, direction, reason, manifestId, user?.id || null, note]);
}

/** Puts a parcel in the stock of `agencyId`. Returns false when it already is there (double reception). */
export async function stockIn(orderId, agencyId, opts = {}) {
  if (!agencyId) return false;
  const r = await one(
    `WITH prev AS (SELECT id, in_stock, current_agency_id FROM orders WHERE id = $1 FOR UPDATE)
     UPDATE orders o SET in_stock = TRUE, current_agency_id = $2, updated_at = now() FROM prev
     WHERE o.id = prev.id AND NOT (prev.in_stock AND prev.current_agency_id IS NOT DISTINCT FROM $2)
     RETURNING prev.in_stock AS was_in, prev.current_agency_id AS was_agency`, [orderId, agencyId]);
  if (!r) return false;
  if (r.was_in && r.was_agency) await move(orderId, r.was_agency, 'out', 'relocation', opts);
  await move(orderId, agencyId, 'in', opts.reason || 'reception', opts);
  return true;
}

/** Takes a parcel out of its agency stock. Returns false when it was not in stock. */
export async function stockOut(orderId, opts = {}) {
  const r = await one(
    `WITH prev AS (SELECT id, current_agency_id FROM orders WHERE id = $1 AND in_stock FOR UPDATE)
     UPDATE orders o SET in_stock = FALSE, updated_at = now() FROM prev WHERE o.id = prev.id
     RETURNING prev.current_agency_id AS agency_id`, [orderId]);
  if (!r) return false;
  if (r.agency_id) await move(orderId, r.agency_id, 'out', opts.reason || 'delivery', opts);
  return true;
}

/** Called by changeStatus() after every transition (not a swallowed hook: it must not silently fail). */
export async function syncStock(orderId, to, ctx = {}) {
  const opts = { reason: ctx.stock?.reason, manifestId: ctx.stock?.manifest_id || null, user: ctx.user || null, note: ctx.stock?.note || null };
  if (STOCK_IN[to]) {
    const o = await one(`SELECT current_agency_id, origin_agency_id FROM orders WHERE id = $1`, [orderId]);
    await stockIn(orderId, o.current_agency_id || o.origin_agency_id, { ...opts, reason: opts.reason || STOCK_IN[to] });
  } else if (STOCK_OUT[to]) await stockOut(orderId, { ...opts, reason: opts.reason || STOCK_OUT[to] });
}

/** Records a stock anomaly (missing, extra, damaged, unknown code…). */
export async function addAnomaly({ agencyId, orderId = null, code = null, kind, source, manifestId = null, note = null, user = null }) {
  const dup = await one(`SELECT id FROM stock_anomalies WHERE status = 'open' AND agency_id = $1 AND kind = $2 AND source = $3
                          AND manifest_id IS NOT DISTINCT FROM $4 AND (order_id = $5 OR (order_id IS NULL AND $5::int IS NULL AND code = $6))`,
    [agencyId, kind, source, manifestId, orderId, code]);
  if (dup) return dup;
  return one(`INSERT INTO stock_anomalies (agency_id, order_id, code, kind, source, manifest_id, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [agencyId, orderId, code, kind, source, manifestId, note, user?.id || null]);
}
