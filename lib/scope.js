// Single place that decides what each role may see (§7, §29).
//   admin   → everything (optionally narrowed by an agency filter chosen in the UI)
//   manager → only his agency (orders leaving from or arriving to it, its staff, its cash…)
//   shop    → only its own orders            driver → only its own missions
import { fail } from './auth.js';
import { int, Sql } from './util.js';

export const ROLES = ['admin', 'manager', 'driver', 'shop'];
export const STAFF = ['admin', 'manager'];

/** Agency the request is restricted to: manager → his agency; admin → optional ?agency_id filter. */
export function scopeAgency(user, requested) {
  if (user.role === 'manager') {
    if (!user.agency_id) fail(403, 'Responsable sans agence : contactez l’administrateur.');
    return user.agency_id;
  }
  if (user.role === 'admin') return int(requested) || null;
  return user.agency_id || null;
}

/**
 * SQL condition restricting `entity` rows to the user's perimeter.
 *   entity: 'orders' | 'users' | 'manifests' | 'cash' | 'agencies'
 *   s: Sql builder (values are always parameterised) · alias: table alias · agency: admin filter
 */
export function scopeWhere(user, entity, s, { alias, agency } = {}) {
  const a = alias || { orders: 'o', users: 'u', manifests: 'm', cash: 'c', agencies: 'ag' }[entity];
  const ag = user.role === 'admin' || user.role === 'manager' ? scopeAgency(user, agency) : null;
  switch (entity) {
    case 'orders':
      if (user.role === 'shop') return `${a}.shop_id = ${s.p(user.id)}`;
      if (user.role === 'driver') return `${a}.driver_id = ${s.p(user.id)}`;
      if (!ag) return 'TRUE';
      { const p = s.p(ag); return `(${a}.origin_agency_id = ${p} OR ${a}.dest_agency_id = ${p})`; }
    case 'users':
      if (user.role === 'shop' || user.role === 'driver') return `${a}.id = ${s.p(user.id)}`;
      return ag ? `${a}.agency_id = ${s.p(ag)}` : 'TRUE';
    case 'manifests':
      if (!ag) return user.role === 'admin' ? 'TRUE' : 'FALSE';
      { const p = s.p(ag); return `(${a}.origin_agency_id = ${p} OR ${a}.dest_agency_id = ${p})`; }
    case 'cash':
      if (!ag) return user.role === 'admin' ? 'TRUE' : 'FALSE';
      return `${a}.agency_id = ${s.p(ag)}`;
    case 'agencies':
      if (!ag) return user.role === 'admin' ? 'TRUE' : 'FALSE';
      return `${a}.id = ${s.p(ag)}`;
  }
  return 'FALSE';
}

/** Throws 404 unless the order exists and is inside the user's perimeter. */
export async function orderInScope(one, user, id, cols = 'o.*') {
  const s = new Sql([int(id)]);
  const o = await one(`SELECT ${cols} FROM orders o WHERE o.id = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!o) fail(404, 'Colis introuvable.');
  return o;
}

/** Throws 403 unless a staff member may act on this agency. */
export function assertAgency(user, agencyId) {
  if (user.role === 'admin') return;
  if (user.role === 'manager' && user.agency_id && Number(agencyId) === user.agency_id) return;
  fail(403, 'Hors de votre agence.');
}
