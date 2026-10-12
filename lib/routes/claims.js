// §27 — claims processing. Status: 0 Nouvelle → 1 En cours → 2 Traitée → 3 Fermée.
// Changes only move forward; reopening a closed claim is explicit (reason required) and traced.
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { str, int, Sql } from '../domain.js';
import { STAFF, scopeWhere } from '../scope.js';
import { audit } from '../audit.js';

const LABELS = ['Nouvelle', 'En cours', 'Traitée', 'Fermée'];

async function claimInScope(user, id) {
  const s = new Sql([int(id)]);
  const c = await one(`SELECT c.* FROM claims c JOIN orders o ON o.id = c.order_id WHERE c.id = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!c) fail(404, 'Réclamation introuvable.');
  return c;
}

route('PATCH', '/claims/:id', STAFF, async ({ params, body, user }) => {
  const c = await claimInScope(user, params.id);
  const note = str(body.internal_note, 1000) || null;
  let to = body.status == null ? c.status : int(body.status);
  if (!(to >= 0 && to <= 3)) fail(400, 'Statut invalide.');
  const reopen = body.reopen === true;
  if (reopen) {
    if (c.status !== 3) fail(409, 'Seule une réclamation fermée peut être rouverte.');
    if (!note) fail(400, 'Indiquez le motif de la réouverture.');
    to = 1;
  } else if (to < c.status) fail(409, `Retour en arrière impossible (${LABELS[c.status]} → ${LABELS[to]}) : utilisez « Rouvrir ».`);
  if (to === c.status && !note) fail(400, 'Rien à modifier.');
  await q(`UPDATE claims SET status = $2, internal_note = coalesce($3, internal_note), updated_at = now() WHERE id = $1`, [c.id, to, note]);
  await q(`INSERT INTO claim_events (claim_id, user_id, old_status, new_status, note) VALUES ($1,$2,$3,$4,$5)`, [c.id, user.id, c.status, to, note]);
  await audit(null, reopen ? 'claim.reopen' : to !== c.status ? 'claim.status' : 'claim.note', 'claim', c.id,
    { status: LABELS[c.status] }, { status: LABELS[to], ...(note ? { note } : {}) });
  return { status: to };
});

route('GET', '/claims/:id/history', STAFF, async ({ params, user }) => {
  const c = await claimInScope(user, params.id);
  return {
    events: await q(`SELECT e.old_status, e.new_status, e.note, e.created_at, u.name AS user_name
                     FROM claim_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.claim_id = $1 ORDER BY e.created_at, e.id`, [c.id]),
  };
});
