// §29 — permission tests: a shop, a driver, an agency manager or an API partner must not be able to read
// or modify someone else's data. Creates its own fixtures (2 agencies, managers, shops, drivers, orders,
// bordereau, partners) through the admin API, then checks every forbidden access.
//
//   npm run dev            (in another terminal; local database)
//   npm run test:permissions
//
// Env: SADEN_URL (default http://localhost:3000), ADMIN_LOGIN / ADMIN_PASSWORD (default: demo admin of the seed).
const BASE = (process.env.SADEN_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = [process.env.ADMIN_LOGIN || '20000000', process.env.ADMIN_PASSWORD || 'saden123'];
const sfx = String(Date.now()).slice(-5);
let pass = 0, failed = 0;

async function call(method, path, token, body, headers = {}) {
  const r = await fetch(BASE + '/api/' + path.replace(/^\//, ''), {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const login = async (id, pw) => {
  const r = await call('POST', 'auth/login', null, { login: id, password: pw });
  if (r.status !== 200) throw new Error(`login ${id}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.token;
};
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log('  ✓', label); } else { failed++; console.log('  ✗', label, detail); }
}
const denied = (r, label, codes = [403, 404]) => check(label, codes.includes(r.status), `→ HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 160)}`);

const admin = await login(...ADMIN);
const A = (m, p, b) => call(m, p, admin, b);
const geo = (await A('GET', 'geo')).json;
const city = geo.cities.find(c => c.active);
const mkAgency = async name => (await A('POST', 'agencies', { name, city_id: city.id })).json.agency;
const agA = await mkAgency(`Perm A ${sfx}`), agB = await mkAgency(`Perm B ${sfx}`);
const phone = n => '5' + sfx + String(n).padStart(2, '0');
const mkUser = async (role, n, agency, extra = {}) => {
  const r = await A('POST', 'users', { role, name: `${role} ${n} ${sfx}`, phone: phone(n), password: 'perm-pass1', agency_id: agency.id, ...extra });
  if (r.status !== 200) throw new Error('create user: ' + JSON.stringify(r.json));
  return { ...r.json.user, token: await login(phone(n), 'perm-pass1') };
};
const mA = await mkUser('manager', 1, agA), mB = await mkUser('manager', 2, agB);
const sA = await mkUser('shop', 3, agA, { shop_name: `Shop A ${sfx}` }), sB = await mkUser('shop', 4, agB, { shop_name: `Shop B ${sfx}` });
const dA = await mkUser('driver', 5, agA), dB = await mkUser('driver', 6, agB);
const order = async shop => (await call('POST', 'orders', shop.token, { client_name: 'Perm', client_phone: '98 000 ' + shop.id % 1000, address: 'Rue test', dest_city_id: city.id, cod: 10 })).json.order;
const oA = await order(sA), oB = await order(sB);
await call('POST', `orders/${oA.id}/assign`, mA.token, { driver_id: dA.id });
await call('POST', `orders/${oB.id}/assign`, mB.token, { driver_id: dB.id });
const other = geo.agencies.find(a => a.id !== agB.id && a.active);
const brdB = (await call('POST', 'manifests', mB.token, { dest_agency_id: other.id })).json.manifest;
const pA = (await A('POST', 'partners', { name: `Perm PA ${sfx}`, agency_id: agA.id })).json, pB = (await A('POST', 'partners', { name: `Perm PB ${sfx}`, agency_id: agB.id })).json;
const keyH = k => ({ Authorization: 'Bearer ' + k });
const poA = (await call('POST', 'v1/orders', null, { external_ref: 'PA-' + sfx, client_name: 'Partner', client_phone: '98 111 222', address: 'x', city_id: city.id, cod: 5 }, keyH(pA.api_key))).json.order;
console.log(`Fixtures: agencies #${agA.id}/#${agB.id}, orders ${oA.ref} (A) / ${oB.ref} (B), bordereau ${brdB.ref}, partner order ${poA.ref}\n`);

console.log('Shop A');
const so = (await call('GET', 'shop/overview', sA.token)).json;
check('sees its own order and not shop B\'s', so.orders.some(o => o.id === oA.id) && !so.orders.some(o => o.id === oB.id));
denied(await call('POST', `orders/${oB.id}/cancel`, sA.token, { note: 'x' }), 'cannot cancel shop B\'s order');
denied(await call('POST', `orders/${oB.id}/status`, sA.token, { status: 'annule', note: 'x' }), 'cannot change shop B\'s order status');
denied(await call('GET', `orders/${oA.id}`, sA.token), 'no staff order detail endpoint', [403]);
for (const p of ['admin/overview', 'users', 'cash/summary', 'search?q=SD', 'audit', 'partners', 'inventory', 'stats'])
  denied(await call('GET', p, sA.token), `GET /${p} refused`, [403]);
denied(await call('PATCH', `users/${sB.id}`, sA.token, { name: 'hack' }), 'cannot edit another account', [403]);

console.log('Driver A');
const dov = (await call('GET', 'driver/overview', dA.token)).json;
check('sees only his missions', dov.missions.every(m => m.driver_id === dA.id) && dov.missions.some(m => m.id === oA.id));
denied(await call('POST', `orders/${oB.id}/status`, dA.token, { status: 'accepte' }), 'cannot act on driver B\'s mission');
denied(await call('POST', 'scan', dA.token, { code: oB.ref, action: 'delivery' }), 'cannot open driver B\'s mission by scan');
denied(await call('POST', 'scan', dA.token, { code: oA.ref, action: 'reception' }), 'cannot use agency scan actions', [403]);
denied(await call('GET', `orders/${oB.id}`, dA.token), 'no staff order detail', [403]);
denied(await call('POST', 'me/location', null, { lat: 1, lng: 1 }), 'location needs a session', [401]);

console.log('Manager A');
denied(await call('GET', `orders/${oB.id}`, mA.token), 'cannot read an order of agency B');
denied(await call('POST', `orders/${oB.id}/assign`, mA.token, { driver_id: dA.id }), 'cannot assign an order of agency B');
denied(await call('POST', `orders/${oB.id}/cancel`, mA.token, { note: 'x' }), 'cannot cancel an order of agency B');
denied(await call('POST', `orders/${oA.id}/assign`, mA.token, { driver_id: dB.id }), 'cannot assign a driver of agency B', [400, 403]);
const ovA = (await call('GET', `admin/overview?agency_id=${agB.id}`, mA.token)).json;
check('?agency_id=B is ignored (only agency A data)', !ovA.orders.some(o => o.id === oB.id) && ovA.orders.some(o => o.id === oA.id));
const usersA = (await call('GET', `users?agency_id=${agB.id}`, mA.token)).json.users;
check('lists only the accounts of agency A', usersA.every(u => u.agency_id === agA.id));
denied(await call('PATCH', `users/${dB.id}`, mA.token, { active: false }), 'cannot deactivate a driver of agency B', [403]);
denied(await call('POST', 'users', mA.token, { role: 'admin', name: 'x', email: `x${sfx}@x.tn`, password: 'secret12' }), 'cannot create an admin', [403]);
denied(await call('PATCH', `agencies/${agB.id}`, mA.token, { auto_assign: true }), 'cannot change agency B', [403]);
check('cash summary forced to agency A', (await call('GET', `cash/summary?agency_id=${agB.id}`, mA.token)).json.agency_id === agA.id);
denied(await call('GET', `manifests/${brdB.id}`, mA.token), 'cannot read a bordereau of agency B');
check('search does not return agency B orders', !(await call('GET', `search?q=${oB.ref}`, mA.token)).json.orders.length);
check('inventory forced to agency A', (await call('GET', `inventory?agency_id=${agB.id}`, mA.token)).json.agency_id === agA.id);
denied(await call('POST', 'scan', mA.token, { code: oB.ref, action: 'reception' }), 'cannot scan a parcel of agency B');
for (const [m, p, b] of [['GET', 'audit'], ['GET', 'partners'], ['POST', 'pricing', { service: 'local', price: 1 }], ['POST', 'geo/cities', { governorate_id: 1, name: 'X' }], ['POST', 'agencies', { name: 'X', city_id: city.id }]])
  denied(await call(m, p, mA.token, b), `${m} /${p} refused`, [403]);

console.log('API partners');
denied(await call('GET', `v1/orders/${poA.ref}`, null, null, keyH(pB.api_key)), 'partner B cannot read partner A\'s order', [404]);
denied(await call('PATCH', `v1/orders/${poA.ref}`, null, { notes: 'x' }, keyH(pB.api_key)), 'partner B cannot modify it', [404]);
denied(await call('GET', `v1/orders/${oA.ref}`, null, null, keyH(pA.api_key)), 'partner cannot read non-API orders', [404]);
const own = await call('GET', `v1/orders/${poA.ref}`, null, null, keyH(pA.api_key));
check('partner A reads its order without OTP or proof', own.status === 200 && !/"otp"|proof/.test(JSON.stringify(own.json)));
denied(await call('GET', 'admin/overview', pA.api_key), 'an API key is not a user session', [401]);

console.log('Public tracking');
const t1 = await call('POST', 'track', null, { ref: oA.ref, phone: '11111111' });
check('wrong phone → 404', t1.status === 404);
let last = t1;
for (let i = 0; i < 12 && last.status !== 429; i++) last = await call('POST', 'track', null, { ref: oA.ref, phone: '1111111' + (i % 10) });
check('repeated wrong phones → 429 with Retry-After', last.status === 429, `→ ${last.status}`);

console.log(`\n${pass} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
