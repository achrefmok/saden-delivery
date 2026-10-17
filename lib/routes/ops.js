// Operations follow-up: parcel problems (calls, appointment, treatment, history), tasks, flagged / suspect /
// outstanding parcels. Every list is restricted to the user's perimeter (scopeWhere on the parcel).
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { str, int, Sql, TZ } from '../domain.js';
import { changeStatus, FINAL, ACTIVE, DRIVER_EXCEPTIONS } from '../status.js';
import { STAFF, scopeWhere, scopeAgency, assertAgency } from '../scope.js';
import { audit } from '../audit.js';
import { refFromCode } from './scan.js';
import { PROBLEM_TYPES, CALL_OUTCOMES, openProblem } from '../problems.js';

const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
const isoTs = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toISOString() : null; };

async function parcel(user, { order_id, ref }) {
  const s = new Sql();
  const cond = order_id ? `o.id = ${s.p(int(order_id))}` : `upper(o.ref) = ${s.p(refFromCode(ref))}`;
  const o = await one(`SELECT o.* FROM orders o WHERE ${cond} AND ${scopeWhere(user, 'orders', s)}`, s.v);
  if (!o) fail(404, 'Colis introuvable dans votre périmètre.');
  return o;
}
async function loadProblem(user, id, lock = false) {
  const s = new Sql([int(id)]);
  const p = await one(`SELECT p.* FROM parcel_problems p JOIN orders o ON o.id = p.order_id WHERE p.id = $1 AND ${scopeWhere(user, 'orders', s)}${lock ? ' FOR UPDATE OF p' : ''}`, s.v);
  if (!p) fail(404, 'Problème introuvable.');
  return p;
}

/* ------------------------------------------------------------------ problems */

route('GET', '/problems', STAFF, async ({ user, query }) => {
  const s = new Sql(), w = [scopeWhere(user, 'orders', s, { agency: query.agency_id })];
  const st = query.status === 'treated' ? 'treated' : query.status === 'all' ? null : 'open';
  if (st) w.push(`p.status = ${s.p(st)}`);
  const types = String(query.type || '').split(',').filter(t => PROBLEM_TYPES[t]);
  if (types.length) w.push(`p.type = ANY(${s.p(types)}::text[])`);
  if (int(query.driver_id)) w.push(`p.driver_id = ${s.p(int(query.driver_id))}`);
  if (int(query.shop_id)) w.push(`o.shop_id = ${s.p(int(query.shop_id))}`);
  if (query.attempts !== undefined && query.attempts !== '') w.push(query.attempts === '4' ? `o.attempts > 3` : `o.attempts = ${s.p(int(query.attempts))}`);
  if (query.false_problem === '1') w.push('p.false_problem');
  if (query.false_problem === '0') w.push('NOT p.false_problem');
  if (query.hide_delivered === '1') w.push(`o.status <> 'livre'`);
  if (isoDate(query.from)) w.push(`(p.created_at AT TIME ZONE '${TZ}')::date >= ${s.p(query.from)}::date`);
  if (isoDate(query.to)) w.push(`(p.created_at AT TIME ZONE '${TZ}')::date <= ${s.p(query.to)}::date`);
  if (query.q) { const t = s.p('%' + str(query.q, 60) + '%'); w.push(`(o.ref ILIKE ${t} OR o.client_name ILIKE ${t} OR regexp_replace(o.client_phone, '\\D', '', 'g') LIKE ${t})`); }
  const rows = await q(
    `SELECT p.*, o.ref, o.client_name, o.client_phone, o.address, o.status AS order_status, o.attempts AS order_attempts, o.rdv_at AS order_rdv,
            o.cod::float8 AS cod, o.payment_mode, sh.shop_name, d.name AS driver_name, d.phone AS driver_phone, ag.name AS agency_name,
            tu.name AS treated_by_name, cu.name AS created_by_name
     FROM parcel_problems p JOIN orders o ON o.id = p.order_id LEFT JOIN users sh ON sh.id = o.shop_id LEFT JOIN users d ON d.id = p.driver_id
     LEFT JOIN agencies ag ON ag.id = p.agency_id LEFT JOIN users tu ON tu.id = p.treated_by LEFT JOIN users cu ON cu.id = p.created_by
     WHERE ${w.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC LIMIT 500`, s.v);
  const by = {};
  for (const r of rows) by[r.type] = (by[r.type] || 0) + 1;
  return { problems: rows, by_type: by, types: PROBLEM_TYPES, outcomes: CALL_OUTCOMES };
});

/** Agent reports a problem (from a call, a client message…). */
route('POST', '/problems', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const o = await parcel(user, body);
  if (!PROBLEM_TYPES[body.type]) fail(400, 'Type de problème invalide.');
  const rdv = isoTs(body.rdv_at);
  if (body.type === 'rdv' && !rdv) fail(400, 'Date et heure du rendez-vous obligatoires.');
  const p = await openProblem({ orderId: o.id, type: body.type, note: str(body.note, 500) || null, user, rdvAt: rdv });
  if (rdv) await q(`UPDATE orders SET rdv_at = $2 WHERE id = $1`, [o.id, rdv]);
  await audit(ctx, 'problem.create', 'order', o.id, null, { problem: p.id, type: body.type, note: body.note || null, rdv_at: rdv });
  return { id: p.id };
}));

route('GET', '/problems/:id/calls', STAFF, async ({ user, params }) => {
  const p = await loadProblem(user, params.id);
  return { calls: await q(`SELECT c.*, u.name AS user_name FROM problem_calls c LEFT JOIN users u ON u.id = c.user_id WHERE c.problem_id = $1 ORDER BY c.id`, [p.id]) };
});

/** Call to the client: counted and kept with its outcome. */
route('POST', '/problems/:id/call', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const p = await loadProblem(user, ctx.params.id, true);
  if (!CALL_OUTCOMES[body.outcome]) fail(400, 'Résultat d’appel invalide.');
  await q(`INSERT INTO problem_calls (problem_id, user_id, outcome, note) VALUES ($1,$2,$3,$4)`, [p.id, user.id, body.outcome, str(body.note, 300) || null]);
  const r = await one(`UPDATE parcel_problems SET calls = calls + 1, last_call_at = now() WHERE id = $1 RETURNING calls`, [p.id]);
  await audit(ctx, 'problem.call', 'order', p.order_id, null, { problem: p.id, outcome: body.outcome });
  return { calls: r.calls };
}));

/**
 * Treatment: explanation required; optional appointment (creates a task) and next step through the state machine:
 *   replan → back to « en attente » for a new delivery · return → « retour » · cancel → « annulé » · none.
 */
route('POST', '/problems/:id/treat', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const p = await loadProblem(user, ctx.params.id, true);
  if (p.status === 'treated') fail(409, 'Problème déjà traité.');
  const resolution = str(body.resolution, 500);
  if (!resolution) fail(400, 'Expliquez le traitement.');
  const rdv = isoTs(body.rdv_at);
  const action = ['replan', 'return', 'cancel', 'none'].includes(body.action) ? body.action : 'none';
  let o = await one(`SELECT * FROM orders WHERE id = $1`, [p.order_id]);
  const to = { replan: 'attente', return: 'retour', cancel: 'annule' }[action];
  if (to && o.status !== to) {
    if (!DRIVER_EXCEPTIONS.includes(o.status) && !(action === 'cancel' && !FINAL.includes(o.status)))
      fail(409, `Le colis est « ${o.status} » : action « ${action} » impossible depuis ce statut.`);
    await changeStatus(o, to, { user, note: resolution });
  }
  if (rdv) {
    await q(`UPDATE orders SET rdv_at = $2 WHERE id = $1`, [o.id, rdv]);
    await q(`INSERT INTO tasks (agency_id, order_id, problem_id, type, message, due_at, created_by) VALUES ($1,$2,$3,'rdv',$4,$5,$6)`,
      [p.agency_id, o.id, p.id, `Rendez-vous ${o.ref} — ${resolution}`.slice(0, 300), rdv, user.id]);
  }
  await q(`UPDATE parcel_problems SET status = 'treated', false_problem = $2, resolution = $3, treated_by = $4, treated_at = now(), rdv_at = coalesce($5, rdv_at) WHERE id = $1`,
    [p.id, !!body.false_problem, resolution, user.id, rdv]);
  await audit(ctx, 'problem.treat', 'order', o.id, { problem: p.id, type: p.type }, { resolution, false_problem: !!body.false_problem, action, rdv_at: rdv });
  return { ok: true, action };
}));

/* ------------------------------------------------------------------ tasks */

const taskScope = (user, s, agency) => {
  const ag = scopeAgency(user, agency);
  return ag ? `t.agency_id = ${s.p(ag)}` : user.role === 'admin' ? 'TRUE' : 'FALSE';
};

route('GET', '/tasks', STAFF, async ({ user, query }) => {
  const s = new Sql(), w = [taskScope(user, s, query.agency_id)];
  const st = query.status === 'done' ? 'done' : query.status === 'all' ? null : 'open';
  if (st) w.push(`t.status = ${s.p(st)}`);
  if (query.type) w.push(`t.type = ${s.p(str(query.type, 30))}`);
  if (query.due === 'today') w.push(`(t.due_at AT TIME ZONE '${TZ}')::date <= (now() AT TIME ZONE '${TZ}')::date`);
  return {
    tasks: await q(
      `SELECT t.*, o.ref, o.client_name, o.client_phone, o.status AS order_status, ag.name AS agency_name, cu.name AS created_by_name, du.name AS done_by_name
       FROM tasks t LEFT JOIN orders o ON o.id = t.order_id LEFT JOIN agencies ag ON ag.id = t.agency_id
       LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN users du ON du.id = t.done_by
       WHERE ${w.join(' AND ')} ORDER BY (t.status = 'open') DESC, t.due_at NULLS LAST, t.created_at DESC LIMIT 500`, s.v),
  };
});

/** Counter of the top bar badge: open tasks and those due (today or late). */
route('GET', '/tasks/count', STAFF, async ({ user, query }) => {
  const s = new Sql();
  return one(`SELECT count(*)::int AS open,
                count(*) FILTER (WHERE t.due_at IS NOT NULL AND (t.due_at AT TIME ZONE '${TZ}')::date <= (now() AT TIME ZONE '${TZ}')::date)::int AS due
              FROM tasks t WHERE t.status = 'open' AND ${taskScope(user, s, query.agency_id)}`, s.v);
});

route('POST', '/tasks', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const message = str(body.message, 500);
  if (!message) fail(400, 'Message obligatoire.');
  let o = null, agencyId = scopeAgency(user, body.agency_id);
  if (body.order_id || body.ref) { o = await parcel(user, body); agencyId = agencyId || o.current_agency_id || o.origin_agency_id; }
  if (!agencyId) fail(400, 'Choisissez une agence.');
  const type = ['rdv', 'rappel', 'probleme', 'verification', 'autre'].includes(body.type) ? body.type : 'autre';
  const due = isoTs(body.due_at);
  if (type === 'rdv' && !due) fail(400, 'Date du rendez-vous obligatoire.');
  const t = await one(`INSERT INTO tasks (agency_id, order_id, type, message, due_at, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [agencyId, o?.id || null, type, message, due, user.id]);
  if (o && type === 'rdv') await q(`UPDATE orders SET rdv_at = $2 WHERE id = $1`, [o.id, due]);
  await audit(ctx, 'task.create', 'task', t.id, null, { type, message, order: o?.ref || null, due_at: due });
  return { id: t.id };
}));

route('POST', '/tasks/:id/done', STAFF, async ctx => tx(async () => {
  const { user, body } = ctx;
  const t = await one(`SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [int(ctx.params.id)]);
  if (!t) fail(404, 'Tâche introuvable.');
  if (t.agency_id) assertAgency(user, t.agency_id);
  if (t.status === 'done') fail(409, 'Tâche déjà traitée.');
  await q(`UPDATE tasks SET status = 'done', done_by = $2, done_at = now(), done_note = $3 WHERE id = $1`, [t.id, user.id, str(body.note, 300) || null]);
  await audit(ctx, 'task.done', 'task', t.id, { status: 'open' }, { status: 'done', note: body.note || null });
  return { ok: true };
}));

/* ------------------------------------------------------------------ flagged / suspect / outstanding parcels */

route('POST', '/orders/:id/flag', STAFF, async ctx => tx(async () => {
  const o = await parcel(ctx.user, { order_id: ctx.params.id });
  const reason = str(ctx.body.reason, 300);
  if (!reason) fail(400, 'Motif du signalement obligatoire.');
  await q(`UPDATE orders SET flagged_at = now(), flagged_by = $2, flag_reason = $3 WHERE id = $1`, [o.id, ctx.user.id, reason]);
  await audit(ctx, 'order.flag', 'order', o.id, null, { reason });
  return { ok: true };
}));
route('POST', '/orders/:id/unflag', STAFF, async ctx => tx(async () => {
  const o = await parcel(ctx.user, { order_id: ctx.params.id });
  if (!o.flagged_at) fail(409, 'Ce colis n’est pas signalé.');
  await q(`UPDATE orders SET flagged_at = NULL, flagged_by = NULL, flag_reason = NULL WHERE id = $1`, [o.id]);
  await audit(ctx, 'order.unflag', 'order', o.id, { reason: o.flag_reason }, { note: str(ctx.body.note, 300) || null });
  return { ok: true };
}));

const LIST_COLS = `o.id, o.ref, o.client_name, o.client_phone, o.status, o.attempts, o.cod::float8 AS cod, o.updated_at, o.created_at, o.in_stock,
  o.flagged_at, o.flag_reason, o.rdv_at, sh.shop_name, d.name AS driver_name, d.phone AS driver_phone, ag.name AS agency_name, fu.name AS flagged_by_name,
  (SELECT count(*) FROM parcel_problems p WHERE p.order_id = o.id)::int AS problems,
  (SELECT count(*) FROM parcel_problems p WHERE p.order_id = o.id AND p.status = 'open')::int AS open_problems,
  (SELECT max(e.created_at) FROM order_events e WHERE e.order_id = o.id) AS last_event_at`;
const LIST_FROM = `FROM orders o LEFT JOIN users sh ON sh.id = o.shop_id LEFT JOIN users d ON d.id = o.driver_id
  LEFT JOIN agencies ag ON ag.id = coalesce(o.current_agency_id, o.origin_agency_id) LEFT JOIN users fu ON fu.id = o.flagged_by`;

route('GET', '/parcels/flagged', STAFF, async ({ user, query }) => {
  const s = new Sql();
  return { parcels: await q(`SELECT ${LIST_COLS} ${LIST_FROM} WHERE o.flagged_at IS NOT NULL AND ${scopeWhere(user, 'orders', s, { agency: query.agency_id })} ORDER BY o.flagged_at DESC LIMIT 500`, s.v) };
});

/** Risky parcels: ≥ 3 attempts, or ≥ 3 problems, or a problem marked « client non sérieux »; still active. */
route('GET', '/parcels/suspects', STAFF, async ({ user, query }) => {
  const s = new Sql([FINAL]);
  return { parcels: await q(
    `SELECT ${LIST_COLS} ${LIST_FROM}
     WHERE NOT (o.status = ANY($1::text[])) AND ${scopeWhere(user, 'orders', s, { agency: query.agency_id })}
       AND (o.attempts >= 3 OR (SELECT count(*) FROM parcel_problems p WHERE p.order_id = o.id) >= 3
            OR EXISTS (SELECT 1 FROM parcel_problems p WHERE p.order_id = o.id AND p.type = 'non_serieux'))
     ORDER BY o.attempts DESC, o.updated_at LIMIT 500`, s.v) };
});

/**
 * Outstanding parcels: still active and without any event for `days` days, or held by a driver (out of the
 * agency) for more than `driver_days` days.
 */
route('GET', '/parcels/outstanding', STAFF, async ({ user, query }) => {
  const days = Math.min(Math.max(int(query.days) || 3, 1), 90), ddays = Math.min(Math.max(int(query.driver_days) || 2, 1), 90);
  const s = new Sql([FINAL, [...ACTIVE, ...DRIVER_EXCEPTIONS, 'retour'], days, ddays]);
  const rows = await q(
    `SELECT * FROM (SELECT ${LIST_COLS} ${LIST_FROM}
       WHERE NOT (o.status = ANY($1::text[])) AND o.status <> 'cree' AND ${scopeWhere(user, 'orders', s, { agency: query.agency_id })}) x
     WHERE x.last_event_at < now() - make_interval(days => $3::int)
        OR (x.driver_name IS NOT NULL AND NOT x.in_stock AND x.status = ANY($2::text[]) AND x.last_event_at < now() - make_interval(days => $4::int))
     ORDER BY x.last_event_at LIMIT 500`, s.v);
  return { days, driver_days: ddays, parcels: rows.map(r => ({ ...r, idle_days: Math.floor((Date.now() - new Date(r.last_event_at)) / 864e5), reason: r.driver_name && !r.in_stock && [...ACTIVE, ...DRIVER_EXCEPTIONS, 'retour'].includes(r.status) ? 'driver' : 'idle' })) };
});
