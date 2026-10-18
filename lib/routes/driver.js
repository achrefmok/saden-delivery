// Driver app: missions, pickups to collect at shops (confirmed by scan), parcels to bring back, cash held,
// history, call log. A driver only ever sees and touches the parcels assigned to him.
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { ORDER_SELECT, TODAY, TZ, str, int } from '../domain.js';
import { ACTIVE, DRIVER_EXCEPTIONS, changeStatus } from '../status.js';
import { audit } from '../audit.js';
import { userAgency } from './auth.js';
import { refFromCode } from './scan.js';

const D = ['driver'];
const FAILED = ['absent', 'refuse', 'reporte', 'numero_incorrect', 'adresse_incorrecte'];
export const CALL_OUTCOMES = { joint: 'Client joint', ne_repond_pas: 'Ne répond pas', injoignable: 'Injoignable / éteint', numero_errone: 'Numéro erroné', rappeler: 'À rappeler', rdv: 'Rendez-vous pris' };

route('GET', '/driver/overview', D, async ({ user }) => {
  const [missions, pickups, back, cash, today] = await Promise.all([
    q(`${ORDER_SELECT}
       WHERE o.driver_id = $1 AND (o.status = ANY($2::text[]) OR o.updated_at >= ${TODAY})
       ORDER BY CASE WHEN o.status = ANY($2::text[]) THEN 0 ELSE 1 END, o.rdv_at NULLS LAST, o.created_at`, [user.id, ACTIVE]),
    // pickups announced to the driver: shop, address, parcels still to collect
    q(`SELECT m.id, m.ref, m.stage, m.pickup_date, coalesce(m.pickup_address, sh.address) AS address, sh.shop_name, sh.phone AS shop_phone, sh.lat, sh.lng,
              (SELECT json_agg(json_build_object('id', o.id, 'ref', o.ref, 'client_name', o.client_name, 'status', o.status, 'collected', o.status = 'ramasse' OR i.loaded_at IS NOT NULL, 'received', i.received_at IS NOT NULL) ORDER BY o.ref)
                 FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = m.id) AS items
       FROM manifests m LEFT JOIN users sh ON sh.id = m.shop_id
       WHERE m.type = 'pickup' AND m.driver_id = $1 AND m.stage IN (1, 2) ORDER BY m.created_at`, [user.id]),
    // failed deliveries / returns the driver must bring back to the agency
    q(`SELECT o.id, o.ref, o.status, o.client_name, o.address, o.cod::float8 AS cod, o.updated_at FROM orders o
       WHERE o.driver_id = $1 AND NOT o.in_stock AND o.status = ANY($2::text[]) ORDER BY o.updated_at`, [user.id, [...DRIVER_EXCEPTIONS, 'retour']]),
    one(`SELECT (SELECT coalesce(sum(o.cod), 0) FROM orders o WHERE o.driver_id = $1 AND o.status = 'livre' AND o.payment_mode <> 'prepaid')::float8 AS collected_total,
                (SELECT coalesce(sum(c.amount), 0) FROM cash_tx c WHERE c.driver_id = $1 AND c.type = 'Encaissement')::float8 AS remitted_total,
                (SELECT coalesce(sum(o.cod), 0) FROM order_events e JOIN orders o ON o.id = e.order_id
                   WHERE e.status = 'livre' AND o.driver_id = $1 AND o.payment_mode <> 'prepaid' AND e.created_at >= ${TODAY})::float8 AS collected_today`, [user.id]),
    one(`SELECT count(*) FILTER (WHERE e.status = 'livre')::int AS delivered, count(*) FILTER (WHERE e.status = ANY($2::text[]))::int AS failed
         FROM order_events e WHERE e.user_id = $1 AND e.created_at >= ${TODAY}`, [user.id, FAILED]),
  ]);
  return { me: user, agency: await userAgency(user), missions, pickups, back,
    cash: { ...cash, to_remit: Math.round((cash.collected_total - cash.remitted_total) * 1000) / 1000 }, today, call_outcomes: CALL_OUTCOMES };
});

/** Driver history (deliveries and failed attempts), by period. */
route('GET', '/driver/history', D, async ({ user, query }) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : null, to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : null;
  const kind = query.kind === 'failed' ? FAILED : query.kind === 'delivered' ? ['livre'] : ['livre', ...FAILED];
  const rows = await q(
    `SELECT e.created_at, e.status, e.note, e.proof_type, o.id AS order_id, o.ref, o.client_name, o.address, o.cod::float8 AS cod, o.payment_mode
     FROM order_events e JOIN orders o ON o.id = e.order_id
     WHERE e.user_id = $1 AND e.status = ANY($2::text[])
       ${from ? `AND (e.created_at AT TIME ZONE '${TZ}')::date >= $3::date` : ''} ${to ? `AND (e.created_at AT TIME ZONE '${TZ}')::date <= $${from ? 4 : 3}::date` : ''}
     ORDER BY e.created_at DESC LIMIT 300`, [user.id, kind, ...(from ? [from] : []), ...(to ? [to] : [])]);
  const delivered = rows.filter(r => r.status === 'livre');
  return { rows, totals: { delivered: delivered.length, failed: rows.length - delivered.length, cod: Math.round(delivered.reduce((a, r) => a + (r.payment_mode === 'prepaid' ? 0 : r.cod), 0) * 1000) / 1000 } };
});

/** Cash detail: what was collected (per parcel, last 30 days) and what was handed over to the agency. */
route('GET', '/driver/cash', D, async ({ user }) => ({
  collected: await q(`SELECT e.created_at, o.ref, o.client_name, o.cod::float8 AS cod FROM order_events e JOIN orders o ON o.id = e.order_id
                      WHERE e.status = 'livre' AND o.driver_id = $1 AND o.payment_mode <> 'prepaid' AND e.created_at > now() - interval '30 days' ORDER BY e.created_at DESC`, [user.id]),
  remits: await q(`SELECT c.created_at, c.label, c.amount::float8 AS amount, u.name AS by_name FROM cash_tx c LEFT JOIN users u ON u.id = c.created_by
                   WHERE c.driver_id = $1 AND c.type = 'Encaissement' ORDER BY c.created_at DESC LIMIT 50`, [user.id]),
}));

/** Call to the client from the app, with its outcome (kept on the parcel). */
route('POST', '/driver/calls', D, async ctx => {
  const { user, body } = ctx;
  const o = await one(`SELECT id, ref, client_phone FROM orders WHERE id = $1 AND driver_id = $2`, [int(body.order_id), user.id]);
  if (!o) fail(404, 'Colis introuvable dans vos missions.');
  if (!CALL_OUTCOMES[body.outcome]) fail(400, 'Résultat d’appel invalide.');
  const c = await one(`INSERT INTO order_calls (order_id, user_id, phone, outcome, note) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [o.id, user.id, str(body.phone, 30) || o.client_phone, body.outcome, str(body.note, 300) || null]);
  return { id: c.id };
});

/**
 * Pickup at a shop: the driver confirms each parcel he takes (scan or tap) → « ramassé ».
 * When every parcel is collected the bordereau becomes « enlevé ».
 */
route('POST', '/driver/pickups/:id/collect', D, async ctx => tx(async () => {
  const { user, body } = ctx;
  const m = await one(`SELECT * FROM manifests WHERE id = $1 AND type = 'pickup' AND driver_id = $2 FOR UPDATE`, [int(ctx.params.id), user.id]);
  if (!m) fail(404, 'Enlèvement introuvable.');
  if (![1, 2].includes(m.stage)) fail(409, 'Cet enlèvement n’est plus en cours.');
  const code = body.code ? refFromCode(body.code) : null;
  const o = await one(`SELECT o.* FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1 AND ${code ? 'upper(o.ref) = $2' : 'o.id = $2'}`, [m.id, code || int(body.order_id)]);
  if (!o) fail(404, `${code || 'Ce colis'} ne fait pas partie de cet enlèvement.`);
  if (o.status === 'ramasse') return { already: true, message: `${o.ref} déjà enlevé` };
  if (o.driver_id !== user.id) fail(409, `${o.ref} n’est pas affecté à vous.`);
  let cur = o;
  if (cur.status === 'affecte') { await changeStatus(cur, 'accepte', { user }); cur = await one(`SELECT * FROM orders WHERE id = $1`, [o.id]); }
  if (cur.status !== 'accepte') fail(409, `${o.ref} : statut « ${cur.status} ».`);
  await changeStatus(cur, 'ramasse', { user, note: `Enlevé chez l’expéditeur (${m.ref})` });
  await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()), scanned_at = coalesce(scanned_at, now()) WHERE manifest_id = $1 AND order_id = $2`, [m.id, o.id]);
  const left = await one(`SELECT count(*)::int AS n FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1 AND o.status <> 'ramasse' AND i.received_at IS NULL`, [m.id]);
  if (!left.n && m.stage === 1) {
    await q(`UPDATE manifests SET stage = 2, collected_at = now() WHERE id = $1`, [m.id]);
    await audit(ctx, 'manifest.collected', 'manifest', m.id, { stage: 1 }, { stage: 2, by_driver: user.id });
  }
  return { message: `${o.ref} enlevé${left.n ? ` — reste ${left.n}` : ' — enlèvement complet'}`, left: left.n };
}));
