// §10 — bordereaux (inter-agency manifests).
//   brouillon (0) → validé (1) → en transit (2) → arrivé (3) → clôturé (4)
// The origin agency composes it manually (selection or scan) while it is a draft, validates and ships it;
// the destination agency receives parcel by parcel (scan) and closes it — missing parcels are reported.
import { route } from '../http.js';
import { q, one } from '../db.js';
import { fail } from '../auth.js';
import { str, int, Sql, defaultAgency } from '../domain.js';
import { changeStatus } from '../status.js';
import { STAFF, scopeWhere } from '../scope.js';
import { audit } from '../audit.js';
import { scanActions, refFromCode } from './scan.js';

export const STAGES = ['brouillon', 'validé', 'en transit', 'arrivé', 'clôturé'];
const ELIGIBLE = ['attente', 'en_agence'];

const isOrigin = (user, m) => user.role === 'admin' || (user.role === 'manager' && user.agency_id === m.origin_agency_id);
const isDest = (user, m) => user.role === 'admin' || (user.role === 'manager' && user.agency_id === m.dest_agency_id);

async function loadManifest(user, id) {
  const s = new Sql([int(id)]);
  const m = await one(`SELECT m.* FROM manifests m WHERE m.id = $1 AND ${scopeWhere(user, 'manifests', s)}`, s.v);
  if (!m) fail(404, 'Bordereau introuvable.');
  return m;
}
const mustBe = (m, stages, msg) => { if (!stages.includes(m.stage)) fail(409, msg || `Action impossible : bordereau « ${STAGES[m.stage]} ».`); };

/** Adds an order to a draft manifest (checks perimeter, route and the single-active-manifest rule). */
async function addItem(ctx, m, order) {
  const { user } = ctx;
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence de départ compose le bordereau.');
  mustBe(m, [0], 'Le bordereau n’est plus en brouillon.');
  if (order.origin_agency_id !== m.origin_agency_id) fail(409, `${order.ref} ne part pas de cette agence.`);
  const destCity = await one(`SELECT city_id FROM agencies WHERE id = $1`, [m.dest_agency_id]);
  if (order.dest_agency_id !== m.dest_agency_id && order.dest_city_id !== destCity.city_id) fail(409, `${order.ref} n’est pas destiné à cette agence.`);
  if (!ELIGIBLE.includes(order.status)) fail(409, `${order.ref} : statut « ${order.status} » incompatible.`);
  const active = await one(`SELECT m.ref FROM manifest_items i JOIN manifests m ON m.id = i.manifest_id
                            WHERE i.order_id = $1 AND m.stage < 4 AND m.id <> $2`, [order.id, m.id]);
  if (active) fail(409, `${order.ref} est déjà sur le bordereau actif ${active.ref}.`);
  await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [m.id, order.id, user.id]);
  await q(`UPDATE orders SET manifest_id = $1, updated_at = now() WHERE id = $2`, [m.id, order.id]);
  await audit(ctx, 'manifest.add', 'manifest', m.id, null, { order: order.ref });
}

/** Destination agency receives one parcel; the first reception marks the manifest as arrived. */
async function receiveItem(ctx, m, order) {
  const { user } = ctx;
  if (!isDest(user, m)) fail(403, 'Seule l’agence de destination réceptionne.');
  mustBe(m, [2, 3], 'Le bordereau n’est pas en transit.');
  const item = await one(`SELECT received_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  if (!item) fail(409, `${order.ref} ne figure pas sur ce bordereau.`);
  if (item.received_at) return { message: 'Déjà réceptionné', status: order.status };
  if (m.stage === 2) { await q(`UPDATE manifests SET stage = 3, arrived_at = now() WHERE id = $1`, [m.id]); m.stage = 3; }
  await q(`UPDATE manifest_items SET received_at = now(), received_by = $3 WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id, user.id]);
  if (order.status === 'transit') await changeStatus(order, 'arrive', { user, agencyId: m.dest_agency_id });
  else await q(`UPDATE orders SET current_agency_id = $2 WHERE id = $1`, [order.id, m.dest_agency_id]);
  await audit(ctx, 'manifest.receive', 'manifest', m.id, null, { order: order.ref });
  return { message: 'Réceptionné (' + m.ref + ')', status: 'arrive' };
}

const orderByRef = async (user, ref) => {
  const s = new Sql([refFromCode(ref)]);
  const o = await one(`SELECT o.* FROM orders o WHERE upper(o.ref) = $1 AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!o) fail(404, 'Colis introuvable dans votre périmètre.');
  return o;
};

/* list + detail */
route('GET', '/manifests/:id', STAFF, async ({ user, params }) => {
  const m0 = await loadManifest(user, params.id);
  const [m, items, history] = await Promise.all([
    one(`SELECT m.*, oa.name AS origin_agency_name, da.name AS dest_agency_name, d.name AS driver_name
         FROM manifests m LEFT JOIN agencies oa ON oa.id = m.origin_agency_id LEFT JOIN agencies da ON da.id = m.dest_agency_id
         LEFT JOIN users d ON d.id = m.driver_id WHERE m.id = $1`, [m0.id]),
    q(`SELECT o.id, o.ref, o.client_name, o.client_phone, o.status, o.cod::float8 AS cod, o.pieces, o.weight::float8 AS weight,
              dc.name AS dest_city_name, coalesce(z.name, o.zone) AS zone_name, i.added_at, i.loaded_at, i.received_at
       FROM manifest_items i JOIN orders o ON o.id = i.order_id LEFT JOIN cities dc ON dc.id = o.dest_city_id LEFT JOIN zones z ON z.id = o.zone_id
       WHERE i.manifest_id = $1 ORDER BY o.ref`, [m0.id]),
    q(`SELECT a.action, a.before, a.after, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity = 'manifest' AND a.entity_id = $1 ORDER BY a.created_at, a.id`, [String(m0.id)]),
  ]);
  return { manifest: { ...m, can_compose: m.stage === 0 && isOrigin(user, m), can_ship: isOrigin(user, m), can_receive: isDest(user, m) }, items, history };
});

route('POST', '/manifests', STAFF, async ctx => {
  const { user, body } = ctx;
  const originId = user.role === 'manager' ? user.agency_id : int(body.origin_agency_id) || (await defaultAgency())?.id;
  const origin = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1`, [originId]);
  const dest = await one(`SELECT ag.id, c.name AS city FROM agencies ag JOIN cities c ON c.id = ag.city_id WHERE ag.id = $1 AND ag.active`, [int(body.dest_agency_id)]);
  if (!origin) fail(400, 'Agence de départ invalide.');
  if (!dest) fail(400, 'Agence de destination invalide.');
  if (dest.id === origin.id) fail(400, 'Destination identique à l’agence de départ.');
  const driverId = int(body.driver_id) || null;
  if (driverId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'driver' AND active`, [driverId]))) fail(400, 'Livreur / transporteur invalide.');
  const m = await one(
    `INSERT INTO manifests (ref, from_city, to_city, carrier, responsible, origin_agency_id, dest_agency_id, driver_id, created_by)
     VALUES ('BRD-' || upper(left($1, 3)) || '-' || upper(left($2, 3)) || '-' || lpad(nextval('manifest_ref_seq')::text, 4, '0'), $1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, ref`,
    [origin.city, dest.city, str(body.carrier, 80) || null, user.name, origin.id, dest.id, driverId, user.id]);
  await audit(ctx, 'manifest.create', 'manifest', m.id, null, { ref: m.ref, origin: origin.id, dest: dest.id, carrier: body.carrier || null });
  return { manifest: m };
});

route('PATCH', '/manifests/:id', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence de départ modifie le bordereau.');
  mustBe(m, [0, 1]);
  const driverId = ctx.body.driver_id !== undefined ? int(ctx.body.driver_id) || null : m.driver_id;
  if (driverId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'driver' AND active`, [driverId]))) fail(400, 'Livreur invalide.');
  const carrier = ctx.body.carrier !== undefined ? str(ctx.body.carrier, 80) || null : m.carrier;
  await q(`UPDATE manifests SET carrier = $2, driver_id = $3 WHERE id = $1`, [m.id, carrier, driverId]);
  await audit(ctx, 'manifest.update', 'manifest', m.id, { carrier: m.carrier, driver_id: m.driver_id }, { carrier, driver_id: driverId });
  return { ok: true };
});

/* composition */
route('POST', '/manifests/:id/items', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  const ids = (Array.isArray(ctx.body.order_ids) ? ctx.body.order_ids : []).map(int).filter(Boolean);
  const refs = Array.isArray(ctx.body.refs) ? ctx.body.refs : [];
  if (!ids.length && !refs.length) fail(400, 'Aucun colis sélectionné.');
  const added = [], errors = [];
  for (const id of ids) {
    try {
      const s = new Sql([id]);
      const o = await one(`SELECT o.* FROM orders o WHERE o.id = $1 AND ${scopeWhere(ctx.user, 'orders', s)}`, s.v);
      if (!o) fail(404, `Colis #${id} introuvable.`);
      await addItem(ctx, m, o); added.push(o.ref);
    } catch (e) { errors.push(e.message); }
  }
  for (const r of refs) {
    try { const o = await orderByRef(ctx.user, r); await addItem(ctx, m, o); added.push(o.ref); } catch (e) { errors.push(e.message); }
  }
  return { added, errors };
});

route('DELETE', '/manifests/:id/items/:orderId', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence de départ compose le bordereau.');
  mustBe(m, [0], 'Le bordereau n’est plus en brouillon.');
  const r = await one(`DELETE FROM manifest_items WHERE manifest_id = $1 AND order_id = $2 RETURNING order_id`, [m.id, int(ctx.params.orderId)]);
  if (!r) fail(404, 'Colis absent du bordereau.');
  const o = await one(`UPDATE orders SET manifest_id = NULL, updated_at = now() WHERE id = $1 AND manifest_id = $2 RETURNING ref`, [r.order_id, m.id]);
  await audit(ctx, 'manifest.remove', 'manifest', m.id, { order: o?.ref }, null);
  return { ok: true };
});

/* lifecycle */
route('POST', '/manifests/:id/validate', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence de départ valide le bordereau.');
  mustBe(m, [0]);
  const n = await one(`SELECT count(*)::int AS n FROM manifest_items WHERE manifest_id = $1`, [m.id]);
  if (!n.n) fail(409, 'Ajoutez au moins un colis avant de valider.');
  await q(`UPDATE manifests SET stage = 1, validated_at = now() WHERE id = $1`, [m.id]);
  await audit(ctx, 'manifest.validate', 'manifest', m.id, { stage: 0 }, { stage: 1, parcels: n.n });
  return { stage: 1 };
});

route('POST', '/manifests/:id/ship', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  if (!isOrigin(ctx.user, m)) fail(403, 'Seule l’agence de départ expédie le bordereau.');
  mustBe(m, [1], 'Validez le bordereau avant de l’expédier.');
  await q(`UPDATE manifests SET stage = 2, shipped_at = now() WHERE id = $1`, [m.id]);
  const rows = await q(`SELECT o.id, o.status, o.driver_id, o.shop_id FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1`, [m.id]);
  for (const r of rows) if (r.status !== 'transit') await changeStatus(r, 'transit', { system: true, user: ctx.user, actor: `${ctx.user.name} · bordereau ${m.ref}` }).catch(() => {});
  await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()) WHERE manifest_id = $1`, [m.id]);
  await audit(ctx, 'manifest.ship', 'manifest', m.id, { stage: 1 }, { stage: 2, parcels: rows.length });
  return { stage: 2 };
});

route('POST', '/manifests/:id/arrive', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  if (!isDest(ctx.user, m)) fail(403, 'Seule l’agence de destination déclare l’arrivée.');
  mustBe(m, [2]);
  await q(`UPDATE manifests SET stage = 3, arrived_at = now() WHERE id = $1`, [m.id]);
  await audit(ctx, 'manifest.arrive', 'manifest', m.id, { stage: 2 }, { stage: 3 });
  return { stage: 3 };
});

route('POST', '/manifests/:id/receive', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  const o = ctx.body.ref ? await orderByRef(ctx.user, ctx.body.ref)
    : await one(`SELECT o.* FROM orders o JOIN manifest_items i ON i.order_id = o.id WHERE i.manifest_id = $1 AND o.id = $2`, [m.id, int(ctx.body.order_id)]);
  if (!o) fail(404, 'Colis absent du bordereau.');
  return receiveItem(ctx, m, o);
});

route('POST', '/manifests/:id/close', STAFF, async ctx => {
  const m = await loadManifest(ctx.user, ctx.params.id);
  if (!isDest(ctx.user, m)) fail(403, 'Seule l’agence de destination clôture le bordereau.');
  mustBe(m, [3], 'Le bordereau doit être arrivé pour être clôturé.');
  const missing = await q(`SELECT o.ref FROM manifest_items i JOIN orders o ON o.id = i.order_id WHERE i.manifest_id = $1 AND i.received_at IS NULL`, [m.id]);
  await q(`UPDATE manifests SET stage = 4, closed_at = now() WHERE id = $1`, [m.id]);
  await audit(ctx, 'manifest.close', 'manifest', m.id, { stage: 3 }, { stage: 4, missing: missing.map(r => r.ref) });
  return { stage: 4, missing: missing.map(r => r.ref) };
});

/* scan actions (§9): add to a draft, load for shipping, receive at destination */
scanActions.manifest_add = async ({ order, user, body }) => {
  const m = await loadManifest(user, body.manifest_id);
  await addItem({ user }, m, order);
  return { message: 'Ajouté à ' + m.ref, status: order.status };
};
scanActions.ship = async ({ order, user, body }) => {
  const m = await loadManifest(user, body.manifest_id || order.manifest_id);
  if (!isOrigin(user, m)) fail(403, 'Seule l’agence de départ expédie.');
  mustBe(m, [1, 2], 'Validez le bordereau avant le chargement.');
  const item = await one(`SELECT loaded_at FROM manifest_items WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  if (!item) fail(409, `${order.ref} ne figure pas sur ${m.ref}.`);
  await q(`UPDATE manifest_items SET loaded_at = coalesce(loaded_at, now()) WHERE manifest_id = $1 AND order_id = $2`, [m.id, order.id]);
  const left = await one(`SELECT count(*)::int AS n FROM manifest_items WHERE manifest_id = $1 AND loaded_at IS NULL`, [m.id]);
  return { message: `Chargé (${m.ref}) — reste ${left.n}`, status: order.status };
};
scanActions.arrival = async ({ order, user, body }) => {
  const m = await loadManifest(user, body.manifest_id || order.manifest_id);
  return receiveItem({ user }, m, order);
};
