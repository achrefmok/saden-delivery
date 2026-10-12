// §29, §30 — audit log: who did what, on which entity, before/after values, from which IP.
import { AsyncLocalStorage } from 'node:async_hooks';
import { q } from './db.js';
import { statusHooks } from './status.js';

/** Current request ({ user, ip }), so deep helpers and hooks can audit without passing the context around. */
export const requestContext = new AsyncLocalStorage();

/**
 * audit(ctx, action, entity, entityId, before, after)
 *   ctx: { user, ip } (route context) — a missing user means an automatic/system action
 */
export async function audit(ctx, action, entity, entityId, before = null, after = null) {
  const store = requestContext.getStore();
  ctx = { user: ctx?.user ?? store?.user, ip: ctx?.ip ?? store?.ip };
  try {
    await q(`INSERT INTO audit_log (user_id, action, entity, entity_id, before, after, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ctx?.user?.id || null, action, entity || null, entityId == null ? null : String(entityId),
       before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), ctx?.ip || null]);
  } catch (e) { console.error('audit failed', e); }
}

/** Removes secrets before storing a row in the audit log. */
export const redact = row => {
  if (!row) return row;
  const { password_hash, key_hash, webhook_secret, otp, proof, ...rest } = row;
  return rest;
};

// status changes, assignments and cancellations are journaled from the state machine hook
statusHooks.push(({ order, from, to, user, note, driver }) => audit(user ? { user } : null,
  to === 'affecte' ? 'order.assign' : to === 'annule' ? 'order.cancel' : 'order.status', 'order', order.id,
  { status: from }, { status: to, ...(note ? { note } : {}), ...(driver ? { driver_id: driver.id, driver: driver.name } : {}) }));
