// §11, §30 — order status machine (server side, for every role) and status history.
// Every status change goes through changeStatus(): transition check, mandatory reason for exceptions,
// event with old/new status + user + note, driver availability, then hooks (audit, notifications, webhooks).
import { q, one } from './db.js';
import { fail } from './auth.js';
import { syncStock } from './stock.js';

export const STATUSES = [
  'cree', 'attente', 'en_agence', 'affecte', 'accepte', 'ramasse', 'transit', 'arrive', 'livraison', 'sur_place', 'livre',
  'absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte', 'endommage', 'perdu', 'annule',
  'retour', 'retour_agence', 'restitue',
];
/** Problems a driver can report on the doorstep (reason required). */
export const DRIVER_EXCEPTIONS = ['absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte', 'endommage'];
/** All "delivery failed / incident" statuses, used for filters and stats. */
export const EXCEPTIONS = [...DRIVER_EXCEPTIONS, 'perdu'];
export const RETURNS = ['retour', 'retour_agence', 'restitue'];
export const FINAL = ['livre', 'annule', 'restitue', 'perdu'];
/** Statuses where the parcel is with a driver. */
export const ACTIVE = ['affecte', 'accepte', 'ramasse', 'livraison', 'sur_place'];
export const NOTE_REQUIRED = [...DRIVER_EXCEPTIONS, 'perdu', 'annule', 'retour'];

// Who may move a parcel from one status to another.
//   staff = admin / agency manager (inside their perimeter) · driver = assigned driver · shop = owner · system = automatic
const S = 'staff', D = 'driver', SH = 'shop', SYS = 'system';
const T = {
  cree: { attente: [SYS] },
  attente: { en_agence: [S, SYS], affecte: [S, SYS], transit: [SYS] },
  en_agence: { affecte: [S, SYS], transit: [SYS], retour: [S] },
  affecte: { accepte: [D], affecte: [S, SYS], attente: [S], en_agence: [S] },
  accepte: { ramasse: [D], livraison: [D], attente: [S] },
  ramasse: { livraison: [D], en_agence: [S, D] },
  transit: { arrive: [S, SYS] },
  arrive: { affecte: [S, SYS], retour: [S] },
  livraison: { sur_place: [D] },
  sur_place: { livre: [D] },
  endommage: { retour: [S], attente: [S] },
  retour: { retour_agence: [S] },
  retour_agence: { restitue: [S] },
};
for (const from of ['accepte', 'ramasse', 'livraison', 'sur_place']) for (const e of DRIVER_EXCEPTIONS) (T[from][e] = [D, S]);
for (const e of DRIVER_EXCEPTIONS.filter(x => x !== 'endommage'))
  T[e] = { attente: [S], affecte: [S], retour: [S] };                      // replan, new driver, or send back
for (const from of ['attente', 'en_agence', 'arrive', 'transit']) T[from].endommage = [S];
// parcel brought back to the agency by its driver (return bordereau / stock entry confirmed by the agency)
for (const from of [...DRIVER_EXCEPTIONS, 'accepte', 'livraison', 'sur_place']) T[from].en_agence = [S];
// staff may cancel or declare lost at any time before delivery; the shop only before the parcel is handled
for (const from of STATUSES.filter(s => !FINAL.includes(s))) {
  T[from] = T[from] || {};
  T[from].annule = [S];
  if (!RETURNS.includes(from)) T[from].perdu = [S];
}
T.cree.annule.push(SH); T.attente.annule.push(SH);

export const roleToken = (user, system) => (system ? SYS : ['admin', 'manager'].includes(user?.role) ? S : user?.role === 'driver' ? D : user?.role === 'shop' ? SH : null);

/** Transitions available to a user for an order (for the UI). */
export function allowedNext(order, user) {
  const tok = roleToken(user);
  if (tok === D && order.driver_id !== user.id) return [];
  if (tok === SH && order.shop_id !== user.id) return [];
  return Object.entries(T[order.status] || {})
    .filter(([to, roles]) => roles.includes(tok) && to !== 'affecte')   // assignment has its own screen
    .map(([to]) => ({ status: to, note_required: NOTE_REQUIRED.includes(to) }));
}

/** Hooks run after each status change: fn({ order, from, to, user, note }) — audit, notifications, webhooks. */
export const statusHooks = [];

export async function syncDriverStatus(driverId) {
  if (!driverId) return;
  const busy = await one(`SELECT count(*)::int AS n FROM orders WHERE driver_id = $1 AND status IN ('livraison','sur_place')`, [driverId]);
  if (busy.n > 0) await q(`UPDATE users SET status = 'livraison' WHERE id = $1 AND status IN ('dispo','livraison')`, [driverId]);
  else await q(`UPDATE users SET status = 'dispo' WHERE id = $1 AND status = 'livraison'`, [driverId]);
}

const ROLE_LABEL = { admin: 'admin', manager: 'agence', driver: 'livreur', shop: 'boutique' };
export const actorOf = u => (u ? `${u.name} · ${ROLE_LABEL[u.role] || u.role}` : 'Système');

/**
 * changeStatus(order, to, { user, system, note, lat, lng, proof_type, proof, driver, agencyId, actor, stock })
 *   order: row with at least id, status, driver_id, shop_id
 *   stock: { reason, manifest_id, note } — details of the stock movement this transition implies (lib/stock.js)
 */
export async function changeStatus(order, to, ctx = {}) {
  const from = order.status;
  if (!STATUSES.includes(to)) fail(400, 'Statut invalide.');
  const tok = roleToken(ctx.user, ctx.system);
  if (tok === D && order.driver_id !== ctx.user.id) fail(403, 'Ce colis ne vous est pas affecté.');
  if (tok === SH && order.shop_id !== ctx.user.id) fail(403, 'Ce colis n’appartient pas à votre boutique.');
  if (!(T[from]?.[to] || []).includes(tok)) fail(409, `Action impossible : « ${from} » → « ${to} » non autorisé pour ce rôle.`);
  const note = String(ctx.note || '').trim().slice(0, 500) || null;
  if (NOTE_REQUIRED.includes(to) && !note && tok !== SYS) fail(400, 'Motif obligatoire pour ce statut.');

  const sets = ['status = $2', 'updated_at = now()'], vals = [order.id, to];
  const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (to === 'attente') set('driver_id', null);
  if (to === 'affecte') set('driver_id', ctx.driver.id);
  if (ctx.agencyId !== undefined) set('current_agency_id', ctx.agencyId);
  vals.push(from);
  const updated = await one(`UPDATE orders SET ${sets.join(', ')} WHERE id = $1 AND status = $${vals.length} RETURNING id`, vals);
  if (!updated) fail(409, 'Le colis a changé de statut entre-temps, rechargez.');

  await q(`INSERT INTO order_events (order_id, status, old_status, user_id, actor, note, lat, lng, proof_type, proof)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [order.id, to, from, ctx.user?.id || null, ctx.actor || actorOf(ctx.user) + (ctx.driver ? ' → ' + ctx.driver.name : ''), note,
     ctx.lat ?? null, ctx.lng ?? null, ctx.proof_type ?? null, ctx.proof ?? null]);
  await syncStock(order.id, to, ctx);
  await syncDriverStatus(order.driver_id);
  if (ctx.driver && ctx.driver.id !== order.driver_id) await syncDriverStatus(ctx.driver.id);
  for (const h of statusHooks) {
    try { await h({ order, from, to, user: ctx.user || null, note, driver: ctx.driver || null }); }
    catch (e) { console.error('status hook failed', e); }
  }
  return { from, to };
}

/** First events of a new order (creation is not a transition). */
export async function recordCreation(order, user, actor) {
  await q(`INSERT INTO order_events (order_id, status, user_id, actor) VALUES ($1, 'cree', $2, $3)`, [order.id, user?.id || null, actor || actorOf(user)]);
  await changeStatus({ ...order, status: 'cree' }, 'attente', { system: true, actor: 'Système' });
}
