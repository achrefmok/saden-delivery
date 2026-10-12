// §29, §30 — audit log: who did what, on which entity, before/after values, from which IP.
import { q } from './db.js';

/**
 * audit(ctx, action, entity, entityId, before, after)
 *   ctx: { user, ip } (route context) — a missing user means an automatic/system action
 */
export async function audit(ctx, action, entity, entityId, before = null, after = null) {
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
