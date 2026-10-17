// §22, §23 — cash per agency: movements, drivers' COD remittances, shop settlements, Saden revenue.
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { CASH_TYPES, str, num, int, defaultAgency, TODAY, startOf } from '../domain.js';
import { STAFF, scopeAgency } from '../scope.js';
import { audit } from '../audit.js';
import { dayFigures, closingOf, assertCashOpen, DAY } from '../cash.js';

/** Agency of a cash operation: manager → his agency; admin → chosen agency (or the first one). */
async function cashAgency(user, requested) {
  const id = scopeAgency(user, requested) || (await defaultAgency())?.id;
  if (!id) fail(400, 'Agence obligatoire.');
  return id;
}

route('POST', '/cash', STAFF, async ctx => {
  const { user, body } = ctx;
  const type = str(body.type, 40);
  if (!(type in CASH_TYPES)) fail(400, 'Type invalide.');
  let amount = num(body.amount);
  if (amount == null || amount === 0) fail(400, 'Montant invalide.');
  if (CASH_TYPES[type]) amount = Math.abs(amount) * CASH_TYPES[type];
  const label = str(body.label, 120);
  if (!label) fail(400, 'Libellé obligatoire.');
  const agencyId = await cashAgency(user, body.agency_id);
  await assertCashOpen(agencyId);
  const attachment = typeof body.attachment === 'string' && /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,/.test(body.attachment) ? body.attachment : null;
  if (body.attachment && !attachment) fail(400, 'Justificatif invalide (image ou PDF).');
  if (attachment && attachment.length > 4_000_000) fail(413, 'Justificatif trop volumineux (3 Mo max).');

  const driverId = int(body.driver_id) || null, shopId = int(body.shop_id) || null, orderId = int(body.order_id) || null;
  if (type === 'Paiement livreur' && !driverId) fail(400, 'Choisissez le livreur.');
  if (type === 'Règlement' && !shopId) fail(400, 'Choisissez la boutique réglée.');
  if (driverId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'driver' AND agency_id = $2`, [driverId, agencyId]))) fail(400, 'Livreur hors de cette agence.');
  if (shopId && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop' AND agency_id = $2`, [shopId, agencyId]))) fail(400, 'Boutique hors de cette agence.');
  if (orderId && !(await one(`SELECT id FROM orders WHERE id = $1 AND (origin_agency_id = $2 OR dest_agency_id = $2)`, [orderId, agencyId]))) fail(400, 'Commande hors de cette agence.');

  if (type === 'Transfert') {
    // money sent to another agency: debit here, credit there, both entries linked
    const to = int(body.counterpart_agency_id);
    if (!to || to === agencyId || !(await one(`SELECT id FROM agencies WHERE id = $1`, [to]))) fail(400, 'Agence destinataire invalide.');
    const ids = await tx(async t => {
      const a = await t.one(`INSERT INTO cash_tx (label, type, amount, created_by, agency_id, counterpart_agency_id) VALUES ($1,'Transfert',$2,$3,$4,$5) RETURNING id`,
        [label, -Math.abs(amount), user.id, agencyId, to]);
      const b = await t.one(`INSERT INTO cash_tx (label, type, amount, created_by, agency_id, counterpart_agency_id, link_id) VALUES ($1,'Transfert',$2,$3,$4,$5,$6) RETURNING id`,
        [label, Math.abs(amount), user.id, to, agencyId, a.id]);
      await t.q(`UPDATE cash_tx SET link_id = $2 WHERE id = $1`, [a.id, b.id]);
      return [a.id, b.id];
    });
    await audit(ctx, 'cash.transfer', 'cash', ids[0], null, { amount: Math.abs(amount), from: agencyId, to, linked: ids[1] });
    return { ok: true, ids };
  }
  const r = await one(`INSERT INTO cash_tx (label, type, amount, created_by, agency_id, driver_id, shop_id, order_id, attachment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [label, type, amount, user.id, agencyId, driverId, shopId, orderId, attachment]);
  await audit(ctx, type === 'Correction' ? 'cash.correction' : 'cash.create', 'cash', r.id, null, { type, amount, label, agency_id: agencyId, driver_id: driverId, shop_id: shopId, order_id: orderId });
  return { ok: true, id: r.id };
});

/** Cash summary of one agency: movements of the day, drivers to collect from, shops to pay, Saden revenue. */
route('GET', '/cash/summary', STAFF, async ({ user, query }) => {
  const agencyId = await cashAgency(user, query.agency_id);
  const [tx_, totals, drivers, shops, revenue] = await Promise.all([
    q(`SELECT c.id, c.label, c.type, c.amount::float8 AS amount, c.created_at, (c.attachment IS NOT NULL) AS has_attachment, d.name AS driver_name, s.shop_name, ca.name AS counterpart_name, o.ref AS order_ref
       FROM cash_tx c LEFT JOIN users d ON d.id = c.driver_id LEFT JOIN users s ON s.id = c.shop_id
       LEFT JOIN agencies ca ON ca.id = c.counterpart_agency_id LEFT JOIN orders o ON o.id = c.order_id
       WHERE c.agency_id = $1 AND c.created_at >= ${TODAY} ORDER BY c.created_at DESC`, [agencyId]),
    one(`SELECT coalesce(sum(amount) FILTER (WHERE amount > 0 AND created_at >= ${TODAY}), 0)::float8 AS income,
                coalesce(-sum(amount) FILTER (WHERE type = 'Dépense' AND created_at >= ${TODAY}), 0)::float8 AS expenses,
                coalesce(sum(amount), 0)::float8 AS balance
         FROM cash_tx WHERE agency_id = $1`, [agencyId]),
    // COD collected by each driver vs. what he already handed over to the agency
    q(`SELECT u.id, u.name,
         coalesce((SELECT sum(o.cod) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.payment_mode <> 'prepaid'), 0)::float8 AS collected,
         coalesce((SELECT sum(c.amount) FROM cash_tx c WHERE c.driver_id = u.id AND c.type = 'Encaissement'), 0)::float8 AS remitted,
         coalesce((SELECT sum(o.driver_share) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre'), 0)::float8 AS earned,
         coalesce((SELECT -sum(c.amount) FROM cash_tx c WHERE c.driver_id = u.id AND c.type = 'Paiement livreur'), 0)::float8 AS paid
       FROM users u WHERE u.role = 'driver' AND u.agency_id = $1 ORDER BY u.name`, [agencyId]),
    // what each shop must receive (delivered parcels) vs. what was already settled
    q(`SELECT u.id, u.shop_name,
         coalesce((SELECT sum(o.amount_to_remit) FROM orders o WHERE o.shop_id = u.id AND o.status = 'livre'), 0)::float8 AS due,
         coalesce((SELECT count(*) FROM orders o WHERE o.shop_id = u.id AND o.status = 'livre'), 0)::int AS delivered,
         coalesce((SELECT -sum(c.amount) FROM cash_tx c WHERE c.shop_id = u.id AND c.type = 'Règlement'), 0)::float8 AS settled
       FROM users u WHERE u.role = 'shop' AND u.agency_id = $1 ORDER BY u.shop_name`, [agencyId]),
    one(`SELECT coalesce(sum(saden_revenue) FILTER (WHERE updated_at >= ${TODAY}), 0)::float8 AS today,
                coalesce(sum(saden_revenue) FILTER (WHERE updated_at >= ${startOf('month')}), 0)::float8 AS month,
                coalesce(sum(delivery_fee) FILTER (WHERE updated_at >= ${startOf('month')}), 0)::float8 AS fees_month
         FROM orders WHERE status = 'livre' AND origin_agency_id = $1`, [agencyId]),
  ]);
  return {
    agency_id: agencyId, tx: tx_, ...totals, revenue,
    drivers: drivers.map(d => ({ ...d, to_remit: Math.round((d.collected - d.remitted) * 1000) / 1000, to_pay: Math.round((d.earned - d.paid) * 1000) / 1000 })),
    shops: shops.map(s => ({ ...s, balance: Math.round((s.due - s.settled) * 1000) / 1000 })),
    to_pay_shops: Math.round(shops.reduce((a, s) => a + Math.max(0, s.due - s.settled), 0) * 1000) / 1000,
  };
});

/** Receipt attached to a cash entry. */
route('GET', '/cash/:id/attachment', STAFF, async ({ user, params }) => {
  const c = await one(`SELECT agency_id, attachment FROM cash_tx WHERE id = $1`, [int(params.id)]);
  if (!c?.attachment) fail(404, 'Aucun justificatif.');
  if (user.role === 'manager' && c.agency_id !== user.agency_id) fail(404, 'Aucun justificatif.');
  return { attachment: c.attachment };
});

/* ------------------------------------------------------------------ day closing */

route('GET', '/cash/closing', STAFF, async ({ user, query }) => {
  const agencyId = await cashAgency(user, query.agency_id);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(query.date || '') ? query.date : null;
  const [fig, closing] = await Promise.all([dayFigures(agencyId, day), closingOf(agencyId, day)]);
  return { agency_id: agencyId, ...fig, closing };
});

route('GET', '/cash/closings', STAFF, async ({ user, query }) => {
  const agencyId = await cashAgency(user, query.agency_id);
  return { closings: await q(
    `SELECT k.id, to_char(k.day, 'YYYY-MM-DD') AS day, k.opening::float8 AS opening, k.income::float8 AS income, k.outflow::float8 AS outflow,
            k.theoretical::float8 AS theoretical, k.counted::float8 AS counted, k.gap::float8 AS gap, k.status, k.note, k.closed_at, k.reopened_at, k.reopen_reason,
            cu.name AS closed_by_name, ru.name AS reopened_by_name
     FROM cash_closings k LEFT JOIN users cu ON cu.id = k.closed_by LEFT JOIN users ru ON ru.id = k.reopened_by
     WHERE k.agency_id = $1 ORDER BY k.day DESC, k.id DESC LIMIT 120`, [agencyId]) };
});

/** Closes a day: counted cash vs. theoretical balance; any gap needs an explanation. */
route('POST', '/cash/closing', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const agencyId = await cashAgency(user, body.agency_id);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : null;
  await q(`SELECT pg_advisory_xact_lock(727275, $1)`, [agencyId]);
  if (await closingOf(agencyId, day)) fail(409, 'Cette journée est déjà clôturée.');
  const fig = await dayFigures(agencyId, day);
  if (fig.day > (await one(`SELECT to_char(${DAY}, 'YYYY-MM-DD') AS d`)).d) fail(400, 'Impossible de clôturer une journée future.');
  const counted = num(body.counted);
  if (counted == null || counted < 0) fail(400, 'Montant compté invalide.');
  const gap = Math.round((counted - fig.theoretical) * 1000) / 1000;
  const note = str(body.note, 500);
  if (gap !== 0 && !note) fail(400, 'Écart constaté : expliquez-le.');
  const status = gap === 0 ? 'conforme' : gap < 0 ? 'manque' : 'surplus';
  const r = await one(`INSERT INTO cash_closings (agency_id, day, opening, income, outflow, theoretical, counted, gap, status, note, closed_by)
                       VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [agencyId, fig.day, fig.opening, fig.income, fig.outflow, fig.theoretical, counted, gap, status, note || null, user.id]);
  await audit(ctx, 'cash.closing', 'cash', r.id, null, { agency_id: agencyId, day: fig.day, theoretical: fig.theoretical, counted, gap, status, note: note || null });
  return { id: r.id, day: fig.day, theoretical: fig.theoretical, counted, gap, status };
}));

/** Administrator reopens a closed day (kept in history as « rouverte »). */
route('POST', '/cash/closings/:id/reopen', ['admin'], async ctx => tx(async () => {
  const k = await one(`SELECT * FROM cash_closings WHERE id = $1 FOR UPDATE`, [int(ctx.params.id)]);
  if (!k) fail(404, 'Clôture introuvable.');
  if (k.status === 'rouverte') fail(409, 'Déjà rouverte.');
  const reason = str(ctx.body.reason, 500);
  if (!reason) fail(400, 'Motif de réouverture obligatoire.');
  await q(`UPDATE cash_closings SET status = 'rouverte', reopened_by = $2, reopened_at = now(), reopen_reason = $3 WHERE id = $1`, [k.id, ctx.user.id, reason]);
  await audit(ctx, 'cash.reopen', 'cash', k.id, { status: k.status }, { status: 'rouverte', reason });
  return { ok: true };
}));
