import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { actorOf, addEvent, int, Sql, defaultAgency } from '../domain.js';
import { STAFF, scopeWhere } from '../scope.js';

/* bordereaux */
route('POST', '/manifests', STAFF, async ({ user, body }) => {
  const originId = user.role === 'manager' ? user.agency_id : int(body.origin_agency_id) || (await defaultAgency())?.id;
  const origin = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1`, [originId]);
  const dest = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1 AND ag.active`, [int(body.dest_agency_id)]);
  if (!origin) fail(400, 'Agence de départ invalide.');
  if (!dest) fail(400, 'Agence de destination invalide.');
  if (dest.id === origin.id) fail(400, 'Destination identique à l’agence de départ.');
  const m = await one(
    `INSERT INTO manifests (ref, from_city, to_city, carrier, responsible, origin_agency_id, dest_agency_id)
     VALUES ('BRD-' || upper(left($1, 3)) || '-' || upper(left($2, 3)) || '-' || lpad(nextval('manifest_ref_seq')::text, 4, '0'), $1, $2, $3, $4, $5, $6)
     RETURNING id, ref`,
    [origin.city, dest.city, String(body.carrier || '').trim().slice(0, 80) || null, user.name, origin.id, dest.id]);
  const r = await q(`UPDATE orders SET manifest_id = $1, updated_at = now()
                     WHERE manifest_id IS NULL AND origin_agency_id = $2 AND dest_agency_id = $3 AND status IN ('cree','attente') RETURNING id`,
    [m.id, origin.id, dest.id]);
  return { manifest: m, attached: r.length };
});

route('POST', '/manifests/:id/next', STAFF, async ({ user, params }) => {
  const s = new Sql([int(params.id)]);
  const m = await one(`SELECT m.id, m.stage FROM manifests m WHERE m.id = $1 AND ${scopeWhere(user, 'manifests', s)}`, s.v);
  if (!m) fail(404, 'Bordereau introuvable.');
  if (m.stage >= 4) fail(409, 'Bordereau déjà clôturé.');
  const stage = m.stage + 1;
  await q(`UPDATE manifests SET stage = $2 WHERE id = $1`, [m.id, stage]);
  const st = { 2: 'transit', 3: 'arrive' }[stage];
  if (st) {
    const rows = await q(`UPDATE orders SET status = $2, updated_at = now() WHERE manifest_id = $1 AND status NOT IN ('livre','refuse') RETURNING id`, [m.id, st]);
    for (const r of rows) await addEvent(r.id, st, actorOf(user));
  }
  return { stage };
});
