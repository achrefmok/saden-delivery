// Single API router (one Vercel function serves every /api/* route).
import { q, one } from './db.js';
import { fail, HttpError, currentUser, hashPassword, checkPassword, signToken, normPhone, normEmail, isEmail, USER_COLS } from './auth.js';

export const AGENCY_CITY = process.env.AGENCY_CITY || 'Gafsa';
// When set, the first-launch setup can only create the administrator with this e-mail.
const ADMIN_EMAIL = normEmail(process.env.ADMIN_EMAIL);
const FEE = Number(process.env.DELIVERY_FEE || 7);
const DRIVER_SHARE = Number(process.env.DRIVER_SHARE || 2);
// Day/week/month boundaries in the agency's local time, independent of the DB session timezone.
const TZ = (process.env.APP_TZ || 'Africa/Tunis').replace(/'/g, '');
const startOf = unit => `(date_trunc('${unit}', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')`;
const TODAY = startOf('day');

const ORDER_STATUSES = ['cree', 'attente', 'affecte', 'accepte', 'ramasse', 'transit', 'arrive', 'livraison', 'sur_place', 'livre', 'absent', 'refuse', 'reporte'];
const ACTIVE = ['affecte', 'accepte', 'livraison', 'sur_place'];
const EXCEPTIONS = ['absent', 'refuse', 'reporte'];
const DRIVER_NEXT = {
  affecte: ['accepte'],
  accepte: ['livraison', ...EXCEPTIONS],
  livraison: ['sur_place', ...EXCEPTIONS],
  sur_place: ['livre', ...EXCEPTIONS],
};
const CASH_TYPES = { 'Encaissement': 1, 'Paiement livreur': -1, 'Dépense': -1, 'Règlement': -1, 'Transfert': -1, 'Correction': 0 };
const ROLE_LABEL = { admin: 'agence', driver: 'livreur', shop: 'boutique' };

const ORDER_SELECT = `
  SELECT o.id, o.ref, o.client_name, o.client_phone, o.zone, o.address, o.lat, o.lng, o.dest_city,
         o.cod::float8 AS cod, o.status, o.driver_id, o.shop_id, o.manifest_id, o.created_at, o.updated_at,
         s.shop_name, d.name AS driver_name
  FROM orders o
  LEFT JOIN users s ON s.id = o.shop_id
  LEFT JOIN users d ON d.id = o.driver_id`;

/* ---------- helpers ---------- */
const str = (v, max = 200) => (v == null ? '' : String(v)).trim().slice(0, max);
const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const need = (v, msg) => { if (v === '' || v == null) fail(400, msg); return v; };
const actorOf = u => `${u.name} · ${ROLE_LABEL[u.role]}`;
const otp4 = () => String(Math.floor(1000 + Math.random() * 9000));

const addEvent = (orderId, status, actor, x = {}) => q(
  `INSERT INTO order_events (order_id, status, actor, lat, lng, proof_type, proof) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [orderId, status, actor, x.lat ?? null, x.lng ?? null, x.proof_type ?? null, x.proof ?? null]);

async function syncDriverStatus(driverId) {
  if (!driverId) return;
  const busy = await one(`SELECT count(*)::int AS n FROM orders WHERE driver_id = $1 AND status IN ('livraison','sur_place')`, [driverId]);
  if (busy.n > 0) await q(`UPDATE users SET status = 'livraison' WHERE id = $1 AND status IN ('dispo','livraison')`, [driverId]);
  else await q(`UPDATE users SET status = 'dispo' WHERE id = $1 AND status = 'livraison'`, [driverId]);
}

/* ---------- routing ---------- */
const routes = [];
const route = (method, path, roles, fn) => routes.push({
  method, roles, fn, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
});

/* auth */
route('GET', '/auth/status', null, async () => {
  const a = await one(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
  return { needsSetup: a.n === 0, agency: AGENCY_CITY, ...(a.n === 0 && ADMIN_EMAIL ? { setupEmail: ADMIN_EMAIL } : {}) };
});

route('POST', '/auth/setup', null, async ({ body }) => {
  const a = await one(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
  if (a.n > 0) fail(409, 'Un administrateur existe déjà.');
  if (ADMIN_EMAIL && normEmail(body.email) !== ADMIN_EMAIL) fail(403, 'Ce compte administrateur est réservé à une autre adresse e-mail.');
  const u = await createUser({ ...body, role: 'admin' });
  return { token: signToken(u), user: u };
});

route('POST', '/auth/login', null, async ({ body }) => {
  const id = String(body.login ?? body.phone ?? '').trim();
  const u = id.includes('@')
    ? await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE lower(email) = $1`, [normEmail(id)])
    : await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE phone = $1`, [normPhone(id)]);
  if (!id || !u || !(await checkPassword(String(body.password || ''), u.password_hash))) fail(401, 'Identifiant ou mot de passe incorrect.');
  if (!u.active) fail(403, 'Compte désactivé. Contactez l’agence.');
  delete u.password_hash;
  return { token: signToken(u), user: u };
});

route('GET', '/me', ['admin', 'driver', 'shop'], ({ user }) => ({ user }));

route('POST', '/me/location', ['driver'], async ({ user, body }) => {
  const lat = num(body.lat), lng = num(body.lng), bat = num(body.battery);
  if (lat == null || lng == null) fail(400, 'Position invalide.');
  await q(`UPDATE users SET lat = $2, lng = $3, battery = $4, last_seen = now() WHERE id = $1`, [user.id, lat, lng, bat == null ? null : Math.round(bat)]);
  return { ok: true };
});

route('POST', '/me/status', ['driver'], async ({ user, body }) => {
  if (!['dispo', 'pause', 'off'].includes(body.status)) fail(400, 'Statut invalide.');
  await q(`UPDATE users SET status = $2, last_seen = now() WHERE id = $1`, [user.id, body.status]);
  return { ok: true };
});

/* accounts (admin) */
async function createUser(b) {
  const role = b.role;
  if (!['admin', 'driver', 'shop'].includes(role)) fail(400, 'Rôle invalide.');
  const name = need(str(b.name, 80), 'Nom obligatoire.');
  const phone = normPhone(b.phone) || null;
  const email = normEmail(b.email) || null;
  if (phone && phone.length !== 8) fail(400, 'Téléphone invalide (8 chiffres).');
  if (email && !isEmail(email)) fail(400, 'Adresse e-mail invalide.');
  if (role === 'admin' ? !phone && !email : !phone) fail(400, role === 'admin' ? 'Téléphone ou e-mail obligatoire.' : 'Téléphone obligatoire (8 chiffres).');
  const password = String(b.password || '');
  if (password.length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
  if (role === 'shop') need(str(b.shop_name), 'Nom de la boutique obligatoire.');
  if (phone && await one(`SELECT id FROM users WHERE phone = $1`, [phone])) fail(409, 'Ce numéro est déjà utilisé.');
  if (email && await one(`SELECT id FROM users WHERE lower(email) = $1`, [email])) fail(409, 'Cette adresse e-mail est déjà utilisée.');
  return one(
    `INSERT INTO users (role, name, phone, email, password_hash, zone, vehicle, shop_name, address, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${USER_COLS}`,
    [role, name, phone, email, await hashPassword(password), str(b.zone, 80) || null, str(b.vehicle, 40) || null,
     str(b.shop_name, 80) || null, str(b.address) || null, role === 'driver' ? 'off' : 'dispo']);
}

route('GET', '/users', ['admin'], async () => ({
  users: await q(`SELECT ${USER_COLS} FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'driver' THEN 1 ELSE 2 END, name`),
}));

route('POST', '/users', ['admin'], async ({ body }) => ({ user: await createUser(body) }));

route('PATCH', '/users/:id', ['admin'], async ({ params, body, user }) => {
  const id = Number(params.id);
  const target = await one(`SELECT id, role FROM users WHERE id = $1`, [id]);
  if (!target) fail(404, 'Compte introuvable.');
  if (id === user.id && body.active === false) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
  const sets = [], vals = [id];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (typeof body.active === 'boolean') add('active', body.active);
  if (body.password != null) {
    if (String(body.password).length < 6) fail(400, 'Mot de passe : 6 caractères minimum.');
    add('password_hash', await hashPassword(String(body.password)));
  }
  for (const k of ['name', 'zone', 'vehicle', 'shop_name', 'address']) if (body[k] != null) add(k, str(body[k]) || null);
  if (!sets.length) fail(400, 'Rien à modifier.');
  return { user: await one(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${USER_COLS}`, vals) };
});

/* orders */
route('POST', '/orders', ['admin', 'shop'], async ({ user, body }) => {
  const client_name = need(str(body.client_name, 80), 'Nom du client obligatoire.');
  const client_phone = str(body.client_phone, 30);
  if (normPhone(client_phone).length !== 8) fail(400, 'Téléphone du client invalide.');
  const address = need(str(body.address), 'Adresse obligatoire.');
  const cod = num(body.cod) ?? 0;
  if (cod < 0) fail(400, 'Montant invalide.');
  const dest = str(body.dest_city, 60);
  let shopId = user.role === 'shop' ? user.id : (num(body.shop_id) || null);
  if (shopId && user.role === 'admin' && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop'`, [shopId]))) fail(400, 'Boutique invalide.');
  const o = await one(
    `INSERT INTO orders (ref, shop_id, client_name, client_phone, zone, address, lat, lng, dest_city, cod, otp)
     VALUES ('SD-' || nextval('order_ref_seq'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, ref`,
    [shopId, client_name, client_phone, str(body.zone, 80) || null, address, num(body.lat), num(body.lng),
     dest && dest !== AGENCY_CITY ? dest : null, cod, otp4()]);
  await addEvent(o.id, 'cree', actorOf(user));
  await addEvent(o.id, 'attente', 'Système');
  return { order: o };
});

route('GET', '/orders/:id', ['admin'], async ({ params }) => {
  const order = await one(`${ORDER_SELECT} WHERE o.id = $1`, [Number(params.id)]);
  if (!order) fail(404, 'Colis introuvable.');
  const { otp } = await one(`SELECT otp FROM orders WHERE id = $1`, [order.id]);
  const events = await q(`SELECT id, status, actor, lat, lng, proof_type, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id`, [order.id]);
  return { order: { ...order, otp }, events };
});

route('GET', '/events/:id/proof', ['admin'], async ({ params }) => {
  const e = await one(`SELECT proof_type, proof FROM order_events WHERE id = $1`, [Number(params.id)]);
  if (!e?.proof) fail(404, 'Aucune preuve.');
  return e;
});

route('POST', '/orders/:id/assign', ['admin'], async ({ user, params, body }) => {
  const o = await one(`SELECT id, status, driver_id FROM orders WHERE id = $1`, [Number(params.id)]);
  if (!o) fail(404, 'Colis introuvable.');
  if (!['attente', 'arrive', 'reporte', 'absent', 'affecte'].includes(o.status)) fail(409, 'Ce colis ne peut pas être affecté maintenant.');
  const d = await one(`SELECT id, name FROM users WHERE id = $1 AND role = 'driver' AND active`, [num(body.driver_id)]);
  if (!d) fail(400, 'Livreur invalide.');
  await q(`UPDATE orders SET driver_id = $2, status = 'affecte', updated_at = now() WHERE id = $1`, [o.id, d.id]);
  await addEvent(o.id, 'affecte', `${actorOf(user)} → ${d.name}`);
  return { ok: true };
});

route('POST', '/orders/:id/status', ['admin', 'driver'], async ({ user, params, body }) => {
  const o = await one(`SELECT id, status, driver_id, otp FROM orders WHERE id = $1`, [Number(params.id)]);
  if (!o) fail(404, 'Colis introuvable.');
  const next = String(body.status || '');
  if (!ORDER_STATUSES.includes(next)) fail(400, 'Statut invalide.');
  const x = { lat: num(body.lat), lng: num(body.lng) };
  if (user.role === 'driver') {
    if (o.driver_id !== user.id) fail(403, 'Ce colis ne vous est pas affecté.');
    if (!(DRIVER_NEXT[o.status] || []).includes(next)) fail(409, 'Action impossible à cette étape.');
    if (next === 'livre') {
      x.proof_type = body.proof_type;
      if (body.proof_type === 'otp') {
        if (String(body.otp || '') !== o.otp) fail(400, 'Code OTP incorrect.');
      } else if (['photo', 'sign'].includes(body.proof_type)) {
        const p = String(body.proof || '');
        if (!p.startsWith('data:image/') || p.length > 3_000_000) fail(400, 'Preuve invalide.');
        x.proof = p;
      } else fail(400, 'Preuve de livraison requise.');
    }
  }
  const replan = next === 'attente';
  await q(`UPDATE orders SET status = $2, updated_at = now()${replan ? ', driver_id = NULL' : ''} WHERE id = $1`, [o.id, next]);
  await addEvent(o.id, next, actorOf(user), x);
  await syncDriverStatus(o.driver_id);
  return { ok: true };
});

/* bordereaux */
route('POST', '/manifests', ['admin'], async ({ user, body }) => {
  const to = need(str(body.to_city, 60), 'Destination obligatoire.');
  if (to === AGENCY_CITY) fail(400, 'Destination identique à l’agence.');
  const m = await one(
    `INSERT INTO manifests (ref, from_city, to_city, carrier, responsible)
     VALUES ('BRD-' || upper(left($1, 3)) || '-' || upper(left($2, 3)) || '-' || lpad(nextval('manifest_ref_seq')::text, 4, '0'), $1, $2, $3, $4)
     RETURNING id, ref`,
    [AGENCY_CITY, to, str(body.carrier, 80) || null, user.name]);
  const r = await q(`UPDATE orders SET manifest_id = $1, updated_at = now()
                     WHERE manifest_id IS NULL AND dest_city = $2 AND status IN ('cree','attente') RETURNING id`, [m.id, to]);
  return { manifest: m, attached: r.length };
});

route('POST', '/manifests/:id/next', ['admin'], async ({ user, params }) => {
  const m = await one(`SELECT id, stage FROM manifests WHERE id = $1`, [Number(params.id)]);
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

/* cash */
route('POST', '/cash', ['admin'], async ({ user, body }) => {
  const type = str(body.type, 40);
  if (!(type in CASH_TYPES)) fail(400, 'Type invalide.');
  let amount = num(body.amount);
  if (amount == null || amount === 0) fail(400, 'Montant invalide.');
  if (CASH_TYPES[type]) amount = Math.abs(amount) * CASH_TYPES[type];
  await q(`INSERT INTO cash_tx (label, type, amount, created_by) VALUES ($1,$2,$3,$4)`,
    [need(str(body.label, 120), 'Libellé obligatoire.'), type, amount, user.id]);
  return { ok: true };
});

/* claims */
route('POST', '/claims/:id/advance', ['admin'], async ({ params }) => {
  const c = await one(`UPDATE claims SET status = (status + 1) % 4 WHERE id = $1 RETURNING status`, [Number(params.id)]);
  if (!c) fail(404, 'Réclamation introuvable.');
  return c;
});

/* admin overview */
route('GET', '/admin/overview', ['admin'], async () => {
  const [orders, drivers, shops, manifests, claims, ratings, cashTx, cashAgg, kpis] = await Promise.all([
    q(`${ORDER_SELECT} ORDER BY o.created_at DESC LIMIT 500`),
    q(`SELECT u.id, u.name, u.phone, u.active, u.zone, u.vehicle, u.status, u.lat, u.lng, u.battery, u.last_seen,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('affecte','accepte','livraison','sur_place'))::int AS active_count,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.updated_at >= ${TODAY})::int AS today,
         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating,
         (SELECT count(*) FROM reviews r WHERE r.driver_id = u.id)::int AS reviews,
         (SELECT count(*) FROM claims c WHERE c.driver_id = u.id)::int AS claims,
         (SELECT comment FROM reviews r WHERE r.driver_id = u.id AND coalesce(r.comment, '') <> '' ORDER BY r.created_at DESC LIMIT 1) AS last_comment
       FROM users u WHERE u.role = 'driver' ORDER BY u.name`),
    q(`SELECT id, name, shop_name, phone, zone, address, active FROM users WHERE role = 'shop' ORDER BY shop_name`),
    q(`SELECT m.*, (SELECT count(*) FROM orders o WHERE o.manifest_id = m.id)::int AS n FROM manifests m ORDER BY m.created_at DESC LIMIT 50`),
    q(`SELECT c.id, c.category, c.text, c.status, c.created_at, o.ref AS order_ref, o.client_name, d.name AS driver_name
       FROM claims c JOIN orders o ON o.id = c.order_id LEFT JOIN users d ON d.id = c.driver_id ORDER BY c.created_at DESC LIMIT 200`),
    one(`SELECT coalesce(round(avg(stars)::numeric, 1)::float8, 0) AS avg, count(*)::int AS n,
           count(*) FILTER (WHERE stars = 5)::int AS s5, count(*) FILTER (WHERE stars = 4)::int AS s4,
           count(*) FILTER (WHERE stars = 3)::int AS s3, count(*) FILTER (WHERE stars = 2)::int AS s2,
           count(*) FILTER (WHERE stars = 1)::int AS s1
         FROM reviews WHERE created_at > now() - interval '30 days'`),
    q(`SELECT id, label, type, amount::float8 AS amount, created_at FROM cash_tx WHERE created_at >= ${TODAY} ORDER BY created_at DESC`),
    one(`SELECT coalesce(sum(amount) FILTER (WHERE amount > 0 AND created_at >= ${TODAY}), 0)::float8 AS income,
           coalesce(-sum(amount) FILTER (WHERE type = 'Dépense' AND created_at >= ${TODAY}), 0)::float8 AS expenses,
           coalesce(sum(amount), 0)::float8 AS balance,
           coalesce(-sum(amount) FILTER (WHERE type = 'Règlement'), 0)::float8 AS settled,
           (SELECT coalesce(sum(cod), 0) FROM orders WHERE status = 'livre')::float8 AS cod_delivered
         FROM cash_tx`),
    one(`SELECT
           (SELECT count(*) FROM orders WHERE created_at >= ${TODAY})::int AS today,
           (SELECT count(*) FROM orders WHERE created_at >= ${TODAY} - interval '1 day' AND created_at < ${TODAY})::int AS yesterday,
           (SELECT count(*) FROM orders WHERE status = 'livre' AND updated_at >= ${TODAY})::int AS delivered,
           (SELECT coalesce(sum(cod), 0) FROM orders WHERE status = 'livre' AND updated_at >= ${TODAY})::float8 AS cod_today,
           (SELECT count(*) FROM orders WHERE status IN ('refuse','absent') AND updated_at >= ${TODAY})::int AS returns`),
  ]);
  return { orders, drivers, shops, manifests, claims, ratings, cash: { tx: cashTx, ...cashAgg }, kpis, agency: AGENCY_CITY, fee: FEE, driverShare: DRIVER_SHARE };
});

route('GET', '/stats', ['admin'], async ({ query }) => {
  const p = Number(query.period) || 0;
  const days = [14, 7, 84][p] ?? 14;
  const local = `now() AT TIME ZONE '${TZ}'`;
  const series = p === 2
    ? `SELECT 'S' || row_number() OVER (ORDER BY d) AS l, d AT TIME ZONE '${TZ}' AS start, (d + interval '1 week') AT TIME ZONE '${TZ}' AS stop
       FROM generate_series(date_trunc('week', ${local}) - interval '11 weeks', date_trunc('week', ${local}), interval '1 week') d`
    : `SELECT to_char(d, 'DD/MM') AS l, d AT TIME ZONE '${TZ}' AS start, (d + interval '1 day') AT TIME ZONE '${TZ}' AS stop
       FROM generate_series(date_trunc('day', ${local}) - interval '${days - 1} days', date_trunc('day', ${local}), interval '1 day') d`;
  const since = `now() - interval '${days} days'`;
  const [bars, k, zones, top] = await Promise.all([
    q(`SELECT s.l, (SELECT count(*) FROM order_events e WHERE e.status = 'livre' AND e.created_at >= s.start AND e.created_at < s.stop)::int AS v
       FROM (${series}) s ORDER BY s.start`),
    one(`SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE status IN ('livre','absent','refuse','reporte'))::int AS finals,
           count(*) FILTER (WHERE status = 'refuse')::int AS refused,
           (SELECT round(avg(extract(epoch FROM e.created_at - o.created_at) / 60))::int FROM order_events e JOIN orders o ON o.id = e.order_id
              WHERE e.status = 'livre' AND e.created_at > ${since}) AS avg_min
         FROM orders WHERE created_at > ${since}`),
    q(`SELECT zone AS name, round(100.0 * count(*) FILTER (WHERE status = 'livre') / count(*))::int AS v
       FROM orders WHERE created_at > ${since} AND zone IS NOT NULL AND status IN ('livre','absent','refuse','reporte')
       GROUP BY zone ORDER BY v DESC`),
    q(`SELECT u.id, u.name,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = 'livre' AND o.updated_at > ${since})::int AS delivered,
         (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('livre','absent','refuse','reporte') AND o.updated_at > ${since})::int AS finals,
         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating
       FROM users u WHERE u.role = 'driver' ORDER BY delivered DESC, u.name LIMIT 5`),
  ]);
  return { bars, kpis: { ...k, revenue: k.delivered * FEE }, zones, top };
});

/* driver */
route('GET', '/driver/overview', ['driver'], async ({ user }) => ({
  me: user,
  missions: await q(`${ORDER_SELECT}
    WHERE o.driver_id = $1 AND (o.status IN ('affecte','accepte','livraison','sur_place') OR o.updated_at >= ${TODAY})
    ORDER BY CASE WHEN o.status IN ('affecte','accepte','livraison','sur_place') THEN 0 ELSE 1 END, o.created_at`, [user.id]),
}));

/* shop */
route('GET', '/shop/overview', ['shop'], async ({ user }) => {
  const [orders, k] = await Promise.all([
    q(`${ORDER_SELECT} WHERE o.shop_id = $1 ORDER BY o.created_at DESC LIMIT 300`, [user.id]),
    one(`SELECT count(*)::int AS month,
           count(*) FILTER (WHERE status = 'livre')::int AS delivered,
           count(*) FILTER (WHERE status IN ('livre','absent','refuse','reporte'))::int AS finals,
           coalesce(sum(cod) FILTER (WHERE status = 'livre'), 0)::float8 AS cod
         FROM orders WHERE shop_id = $1 AND created_at >= ${startOf('month')}`, [user.id]),
  ]);
  return { me: user, orders, kpis: k, agency: AGENCY_CITY };
});

/* public tracking (client) */
async function trackedOrder(body) {
  const ref = str(body.ref, 20).toUpperCase().replace(/\s/g, '');
  const phone = normPhone(body.phone);
  if (!ref || phone.length !== 8) fail(400, 'Numéro de colis et téléphone requis.');
  const o = await one(`SELECT o.*, o.cod::float8 AS cod, s.shop_name FROM orders o LEFT JOIN users s ON s.id = o.shop_id WHERE upper(o.ref) = $1`, [ref]);
  if (!o || normPhone(o.client_phone) !== phone) fail(404, 'Aucun colis ne correspond à ce numéro et ce téléphone.');
  return o;
}

route('POST', '/track', null, async ({ body }) => {
  const o = await trackedOrder(body);
  const [events, driver, review, claim] = await Promise.all([
    q(`SELECT status, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at, id`, [o.id]),
    o.driver_id ? one(`SELECT u.name, u.lat, u.lng, u.last_seen,
                         (SELECT round(avg(stars)::numeric, 1)::float8 FROM reviews r WHERE r.driver_id = u.id) AS rating
                       FROM users u WHERE u.id = $1`, [o.driver_id]) : null,
    one(`SELECT stars FROM reviews WHERE order_id = $1`, [o.id]),
    one(`SELECT id FROM claims WHERE order_id = $1 LIMIT 1`, [o.id]),
  ]);
  const [first, last] = (driver?.name || '').split(' ');
  return {
    ref: o.ref, status: o.status, shop_name: o.shop_name, client_name: o.client_name, address: o.address, zone: o.zone,
    dest_city: o.dest_city, cod: o.cod, lat: o.lat, lng: o.lng, created_at: o.created_at,
    otp: ['livre', 'refuse'].includes(o.status) ? null : o.otp,
    events,
    driver: driver && { name: first + (last ? ' ' + last[0] + '.' : ''), rating: driver.rating, lat: driver.lat, lng: driver.lng, last_seen: driver.last_seen },
    reviewed: !!review, claimed: !!claim,
  };
});

route('POST', '/track/review', null, async ({ body }) => {
  const o = await trackedOrder(body);
  if (!['livre', ...EXCEPTIONS].includes(o.status)) fail(409, 'Vous pourrez donner votre avis une fois la livraison terminée.');
  const stars = num(body.stars);
  const cat = num(body.claim_category);
  if (stars != null) {
    if (o.status !== 'livre') fail(409, 'La note est réservée aux colis livrés.');
    if (!(stars >= 1 && stars <= 5)) fail(400, 'Note invalide.');
    if (await one(`SELECT id FROM reviews WHERE order_id = $1`, [o.id])) fail(409, 'Vous avez déjà noté cette livraison.');
    await q(`INSERT INTO reviews (order_id, driver_id, stars, comment) VALUES ($1,$2,$3,$4)`, [o.id, o.driver_id, Math.round(stars), str(body.comment, 500) || null]);
  }
  let claimRef = null;
  if (cat != null) {
    if (!(cat >= 0 && cat <= 6)) fail(400, 'Catégorie invalide.');
    const c = await one(`INSERT INTO claims (order_id, driver_id, category, text) VALUES ($1,$2,$3,$4) RETURNING id`,
      [o.id, o.driver_id, cat, str(body.comment, 500) || null]);
    claimRef = 'RC-' + String(c.id).padStart(4, '0');
  }
  if (stars == null && cat == null) fail(400, 'Choisissez une note ou un motif de réclamation.');
  return { ok: true, claim: claimRef };
});

/* ---------- HTTP entry ---------- */
async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 5_000_000) fail(413, 'Requête trop volumineuse.'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://local');
    const raw = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
    const path = '/' + raw.replace(/^\/+|\/+$/g, '');
    const method = req.method.toUpperCase();
    let match = null, allowed = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      allowed = true;
      if (r.method === method) { match = { r, params: m.groups || {} }; break; }
    }
    if (!match) fail(allowed ? 405 : 404, 'Route inconnue.');
    let user = null;
    if (match.r.roles) {
      user = await currentUser(req);
      if (!user) fail(401, 'Session expirée, reconnectez-vous.');
      if (!match.r.roles.includes(user.role)) fail(403, 'Accès refusé.');
    }
    const query = Object.fromEntries(url.searchParams);
    let body = {};
    if (method !== 'GET') {
      try { body = await readJson(req); } catch (e) { if (e instanceof HttpError) throw e; fail(400, 'JSON invalide.'); }
    }
    send(res, 200, await match.r.fn({ req, body, query, params: match.params, user }));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    // Missing env vars are reported as-is (no secret involved); connection failures get a hint, never the URL.
    if (e.config) return send(res, 500, { error: e.message });
    const m = `${e.code || ''} ${e.message || ''}`;
    const why = /password authentication/i.test(m) ? 'mot de passe refusé'
      : /Tenant or user not found/i.test(m) ? 'utilisateur inconnu (il doit être postgres.<id-projet>)'
      : /ENOTFOUND|EAI_AGAIN/i.test(m) ? 'adresse du serveur introuvable'
      : /ETIMEDOUT|ECONNREFUSED|ENETUNREACH|timeout/i.test(m) ? 'serveur injoignable (utilisez le Transaction pooler, port 6543)'
      : /Invalid URL|invalid connection|getaddrinfo|URI/i.test(m) ? 'adresse DATABASE_URL mal formée'
      : /SSL|certificate/i.test(m) ? 'erreur SSL' : null;
    if (why) return send(res, 500, { error: `Connexion à la base impossible : ${why}. Vérifiez DATABASE_URL.` });
    send(res, 500, { error: 'Erreur serveur.' });
  }
}
