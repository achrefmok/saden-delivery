// Demo data for SADEN (CDC V1): 2 governorates, 2 cities with zones, 2 agencies (+ managers), drivers, shops,
// a pricing grid, an API partner, 14 days of history, today's activity, bordereaux, cash, reviews and claims.
// Orders go through the real application logic (createOrder → pricing, changeStatus → state machine).
//
//   npm run seed              → local PGlite database (.data/) — default, never touches production
//   npm run seed -- --remote  → the DATABASE_URL of .env (explicit)
//
// Password of every demo account: saden123
try { process.loadEnvFile('.env'); } catch {}
if (!process.argv.includes('--remote')) process.env.DB = 'local';
const { q, one, close, usingLocalDb } = await import('../lib/db.js');
const { hashPassword } = await import('../lib/auth.js');
const { createOrder } = await import('../lib/routes/orders.js');
const { changeStatus } = await import('../lib/status.js');
const { newApiKey, newWebhookSecret } = await import('../lib/partners.js');
await import('../lib/api.js');   // registers the status hooks (audit, notifications, webhooks)
console.log(usingLocalDb() ? 'Base : PGlite locale (.data/)' : 'Base : PostgreSQL distant (--remote)');

if ((await one(`SELECT count(*)::int AS n FROM orders`)).n > 0) {
  console.log('La base contient déjà des commandes — seed ignoré (supprimez .data/ pour repartir de zéro).');
  await close(); process.exit(0);
}

const pw = await hashPassword('saden123');
const rnd = a => a[Math.floor(Math.random() * a.length)];
const jitter = ([a, b], d = 0.006) => [a + (Math.random() - 0.5) * d, b + (Math.random() - 0.5) * d];

/* ---------- geography ---------- */
async function gov(name) { await q(`INSERT INTO governorates (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]); return one(`SELECT id FROM governorates WHERE name = $1`, [name]); }
async function city(g, name, lat, lng) {
  await q(`INSERT INTO cities (governorate_id, name, lat, lng) VALUES ($1,$2,$3,$4) ON CONFLICT (governorate_id, name) DO UPDATE SET lat = $3, lng = $4`, [g.id, name, lat, lng]);
  return one(`SELECT id, lat, lng FROM cities WHERE governorate_id = $1 AND name = $2`, [g.id, name]);
}
async function zone(c, name, lat, lng) {
  await q(`INSERT INTO zones (city_id, name, lat, lng) VALUES ($1,$2,$3,$4) ON CONFLICT (city_id, name) DO UPDATE SET lat = $3, lng = $4`, [c.id, name, lat, lng]);
  return one(`SELECT id, name, lat, lng FROM zones WHERE city_id = $1 AND name = $2`, [c.id, name]);
}
const gG = await gov('Gafsa'), gS = await gov('Sousse');
const cG = await city(gG, 'Gafsa', 34.4250, 8.7842), cS = await city(gS, 'Sousse', 35.8256, 10.6084);
const ZG = { 'Centre-ville': [34.4250, 8.7842], 'Cité Ennour': [34.4335, 8.7935], 'Douali': [34.4372, 8.7705], 'El Ksar': [34.4120, 8.7640], 'Sidi Ahmed Zarroug': [34.4010, 8.8010], 'Cité Essourour': [34.4285, 8.8060] };
const ZS = { 'Sahloul': [35.8366, 10.5930], 'Khezama': [35.8440, 10.6020], 'Erriadh': [35.8070, 10.5960], 'Médina': [35.8270, 10.6380] };
const zonesG = [], zonesS = [];
for (const [n, p] of Object.entries(ZG)) zonesG.push(await zone(cG, n, ...p));
for (const [n, p] of Object.entries(ZS)) zonesS.push(await zone(cS, n, ...p));

async function agency(name, c, pos, zs, address, phone) {
  const ex = await one(`SELECT id FROM agencies WHERE city_id = $1 ORDER BY id LIMIT 1`, [c.id]);
  const a = ex
    ? await one(`UPDATE agencies SET name = $2, lat = $3, lng = $4, address = $5, phone = $6, active = TRUE WHERE id = $1 RETURNING *`, [ex.id, name, pos[0], pos[1], address, phone])
    : await one(`INSERT INTO agencies (city_id, name, lat, lng, address, phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [c.id, name, pos[0], pos[1], address, phone]);
  for (const z of zs) await q(`INSERT INTO agency_zones (agency_id, zone_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a.id, z.id]);
  return a;
}
const agG = await agency('Agence Gafsa', cG, [34.4253, 8.7849], zonesG, 'Avenue Habib Bourguiba, Gafsa', '76 220 100');
const agS = await agency('Agence Sousse', cS, [35.8288, 10.6340], zonesS, 'Boulevard du 14 Janvier, Sousse', '73 220 200');

/* ---------- accounts ---------- */
async function user(role, name, phone, x = {}) {
  const ex = await one(`SELECT * FROM users WHERE phone = $1`, [phone]);
  if (ex) return ex;
  return one(`INSERT INTO users (role, name, phone, email, password_hash, agency_id, zone_id, vehicle, shop_name, address, status, lat, lng, battery, last_seen, gps_consent_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now(), $15) RETURNING *`,
    [role, name, phone, x.email || null, pw, x.agency_id || null, x.zone_id || null, x.vehicle || null, x.shop_name || null, x.address || null,
     x.status || 'dispo', x.lat ?? null, x.lng ?? null, x.battery ?? null, role === 'driver' ? new Date() : null]);
}
const admin = await user('admin', 'Lotfi Amri', '20000000');
const mG = await user('manager', 'Rym Karray', '20000001', { agency_id: agG.id });
const mS = await user('manager', 'Hatem Ben Amor', '20000002', { agency_id: agS.id });
await q(`UPDATE agencies SET manager_id = $1 WHERE id = $2`, [mG.id, agG.id]);
await q(`UPDATE agencies SET manager_id = $1 WHERE id = $2`, [mS.id, agS.id]);

const DRV = [
  ['Ahmed Ben Salah', 'Centre-ville', 'Moto', 'dispo', 82, agG, zonesG], ['Mohamed Trabelsi', 'Cité Ennour', 'Moto', 'livraison', 64, agG, zonesG],
  ['Ali Gharbi', 'El Ksar', 'Voiture', 'dispo', 91, agG, zonesG], ['Sami Mansouri', 'Sidi Ahmed Zarroug', 'Moto', 'pause', 38, agG, zonesG],
  ['Nour Jlassi', 'Douali', 'Scooter', 'livraison', 57, agG, zonesG], ['Youssef Hamdi', 'Cité Essourour', 'Voiture', 'off', null, agG, zonesG],
  ['Wael Chaabane', 'Sahloul', 'Moto', 'dispo', 77, agS, zonesS], ['Ines Gharsalli', 'Khezama', 'Scooter', 'dispo', 69, agS, zonesS],
];
const drivers = [];
for (const [i, [name, zn, vehicle, status, battery, ag, zs]] of DRV.entries()) {
  const z = zs.find(x => x.name === zn), [lat, lng] = jitter([z.lat, z.lng]);
  drivers.push(await user('driver', name, '2100000' + (i + 1), { agency_id: ag.id, zone_id: z.id, vehicle, status, battery, lat, lng }));
}
const SHOPS = [['Électro Sud', 'Karim Ben Ali', 'Centre-ville', agG, zonesG], ['Yasmine Mode', 'Yasmine Ayari', 'Centre-ville', agG, zonesG],
  ['Pharmacie El Amen', 'Hela Mansour', 'El Ksar', agG, zonesG], ['Pâtisserie Ennakhla', 'Fares Nasri', 'Douali', agG, zonesG],
  ['Librairie Al Manar', 'Mounir Haddad', 'Cité Ennour', agG, zonesG], ['Sahloul Tech', 'Amel Jridi', 'Sahloul', agS, zonesS]];
const shops = [];
for (const [i, [shop_name, name, zn, ag, zs]] of SHOPS.entries())
  shops.push(await user('shop', name, '2200000' + (i + 1), { agency_id: ag.id, zone_id: zs.find(x => x.name === zn).id, shop_name, address: (ag === agG ? 'Gafsa Mall, ' : 'Avenue Taieb Mhiri, ') + zn }));

/* ---------- pricing grid (default rules are created by the migration) ---------- */
const rule = (name, service, price, driver_share, x = {}) => q(
  `INSERT INTO pricing_rules (name, service, price, driver_share, saden_commission, agency_id, origin_city_id, dest_city_id, zone_id, shop_id, parcel_type, min_weight, max_weight, priority)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
  [name, service, price, driver_share, x.commission || 0, x.agency_id || null, x.origin_city_id || null, x.dest_city_id || null, x.zone_id || null,
   x.shop_id || null, x.parcel_type || null, x.min_weight ?? null, x.max_weight ?? null, x.priority || 0]);
await rule('Gafsa → Sousse', 'intercity', 9, 2.5, { origin_city_id: cG.id, dest_city_id: cS.id });
await rule('Sousse → Gafsa', 'intercity', 9, 2.5, { origin_city_id: cS.id, dest_city_id: cG.id });
await rule('Zones périphériques Gafsa', 'local', 8, 2.5, { zone_id: zonesG.find(z => z.name === 'Sidi Ahmed Zarroug').id });
await rule('Colis lourds (> 10 kg)', 'local', 12, 4, { min_weight: 10 });
await rule('Volumineux', 'local', 14, 5, { parcel_type: 'volumineux' });
await rule('Électro Sud — contrat', 'local', 6, 2, { shop_id: shops[0].id, commission: 1 });

/* ---------- API partner ---------- */
const key = newApiKey();
const partner = await one(`INSERT INTO api_partners (name, key_prefix, key_hash, agency_id, webhook_secret) VALUES ('Gafsa Mall', $1, $2, $3, $4) RETURNING *`,
  [key.key_prefix, key.key_hash, agG.id, newWebhookSecret()]);

/* ---------- orders through the real business logic ---------- */
const CLIENTS = ['Salma Khemiri', 'Rania Bouazizi', 'Hédi Mejri', 'Imen Saidi', 'Karim Ferchichi', 'Wassim Abidi', 'Amira Nasri', 'Fethi Gafsi', 'Olfa Brahmi',
  'Leila Hamrouni', 'Bilel Chebbi', 'Hajer Toumi', 'Mariem Sassi', 'Oussama Ayari', 'Nadia Kefi', 'Skander Ouni', 'Hela Zouari'];
const DESC = ['Casque audio', 'Robe d’été', 'Médicaments', 'Gâteau d’anniversaire', '3 livres scolaires', 'Chargeur + câble', 'Parfum', 'Chaussures'];
const COMMENTS = ['Livreur ponctuel et très professionnel.', 'Très aimable, a appelé avant d’arriver.', 'Colis livré avec soin.', 'Rapide et souriant.', 'Arrivé en retard mais courtois.', ''];
const drvOf = ag => drivers.filter(d => d.agency_id === ag.id);
const staffOf = ag => (ag.id === agG.id ? mG : mS);
const phoneNo = () => '+216 9' + Math.floor(1000000 + Math.random() * 8999999);

async function makeOrder({ shop, ag, zs, destCity = null, destZones = null, daysAgo, minutes, final, partnerOrder = false, items = null }) {
  const z = rnd(destZones || zs), [lat, lng] = jitter([z.lat, z.lng]);
  const body = { shop_id: shop?.id, origin_agency_id: ag.id, client_name: rnd(CLIENTS), client_phone: phoneNo(), address: 'Rue ' + Math.ceil(Math.random() * 40) + ', ' + z.name,
    dest_city_id: (destCity || (ag.id === agG.id ? cG : cS)).id, zone_id: z.id, lat, lng, cod: Math.round(Math.random() * 300 * 2) / 2,
    description: rnd(DESC), pieces: 1 + Math.floor(Math.random() * 2), weight: Math.random() < 0.15 ? 12 : Math.round(Math.random() * 40) / 10 + 0.3,
    external_ref: partnerOrder ? 'GM-' + Math.floor(100000 + Math.random() * 899999) : null };
  const asUser = shop || { ...admin, role: 'admin' };
  const o = await createOrder(body, asUser, partnerOrder ? { source: 'api:gafsa-mall', partner_id: partner.id, actor: 'API · Gafsa Mall' } : {});
  if (items) for (const it of items) await q(`INSERT INTO order_items (order_id, name, qty, price) VALUES ($1,$2,$3,$4)`, [o.id, it.name, it.qty, it.price]);
  const get = () => one(`SELECT * FROM orders WHERE id = $1`, [o.id]);
  const handling = destCity && destCity.id !== (ag.id === agG.id ? cG : cS).id ? null : ag;
  if (handling && final !== 'attente') {
    const d = rnd(drvOf(handling).filter(x => x.status !== 'off')), staff = staffOf(handling);
    let cur = await get();
    if (cur.status !== 'affecte') { await changeStatus(cur, 'affecte', { user: staff, driver: d }); cur = await get(); }
    const steps = { affecte: [], accepte: ['accepte'], livraison: ['accepte', 'livraison'], livre: ['accepte', 'livraison', 'sur_place', 'livre'],
      absent: ['accepte', 'livraison', 'sur_place', 'absent'], refuse: ['accepte', 'livraison', 'sur_place', 'refuse'], reporte: ['accepte', 'livraison', 'reporte'] }[final] || [];
    for (const st of steps) {
      cur = await get();
      const drvUser = { ...d, role: 'driver', id: cur.driver_id };
      await changeStatus(cur, st, { user: drvUser, note: ['absent', 'refuse', 'reporte'].includes(st) ? rnd(['Client injoignable', 'Client a refusé le colis', 'Client demande une livraison demain']) : null,
        lat, lng, ...(st === 'livre' ? { proof_type: 'otp' } : {}) });
    }
  }
  // backdate the timeline
  const created = `now() - make_interval(days => $2) - make_interval(mins => $3)`;
  await q(`UPDATE orders SET created_at = ${created}, updated_at = ${created} + interval '50 minutes' WHERE id = $1`, [o.id, daysAgo, minutes]);
  await q(`UPDATE order_events e SET created_at = o.created_at + make_interval(mins => ((r.n - 1) * 9)::int)
           FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM order_events WHERE order_id = $1) r, orders o
           WHERE e.id = r.id AND o.id = $1`, [o.id]);
  const done = await get();
  if (done.status === 'livre' && Math.random() < 0.6)
    await q(`INSERT INTO reviews (order_id, driver_id, stars, comment, created_at) VALUES ($1,$2,$3,$4, now() - make_interval(days => $5))`,
      [o.id, done.driver_id, Math.random() < 0.7 ? 5 : Math.random() < 0.7 ? 4 : 3, rnd(COMMENTS) || null, daysAgo]);
  return done;
}

const shopsG = shops.filter(s => s.agency_id === agG.id), shopS = shops.find(s => s.agency_id === agS.id);
process.stdout.write('Historique 14 jours');
for (let d = 13; d >= 1; d--) {
  for (let k = 0; k < 5 + Math.floor(Math.random() * 4); k++) {
    const r = Math.random(), final = r < 0.86 ? 'livre' : r < 0.93 ? 'absent' : r < 0.97 ? 'refuse' : 'reporte';
    await makeOrder({ shop: rnd(shopsG), ag: agG, zs: zonesG, daysAgo: d, minutes: 60 + k * 35, final });
  }
  for (let k = 0; k < 2; k++) await makeOrder({ shop: shopS, ag: agS, zs: zonesS, daysAgo: d, minutes: 90 + k * 50, final: Math.random() < 0.9 ? 'livre' : 'absent' });
  process.stdout.write('.');
}
console.log(' OK');

// today
for (const [final, n] of [['attente', 3], ['affecte', 3], ['accepte', 1], ['livraison', 2], ['livre', 4], ['absent', 1], ['refuse', 1]])
  for (let k = 0; k < n; k++) await makeOrder({ shop: rnd(shopsG), ag: agG, zs: zonesG, daysAgo: 0, minutes: 30 + Math.floor(Math.random() * 200), final });
for (const final of ['attente', 'affecte', 'livre']) await makeOrder({ shop: shopS, ag: agS, zs: zonesS, daysAgo: 0, minutes: 120, final });
// Gafsa Mall orders received through the API
for (let k = 0; k < 3; k++) await makeOrder({ ag: agG, zs: zonesG, daysAgo: 0, minutes: 20 + k * 15, final: k ? 'attente' : 'livraison', partnerOrder: true,
  items: [{ name: rnd(DESC), qty: 1, price: 45 }, { name: 'Emballage cadeau', qty: 1, price: 5 }] });

// inter-city Gafsa → Sousse: a validated bordereau (to ship) and one already in transit
const inter = [];
for (let k = 0; k < 5; k++) inter.push(await makeOrder({ shop: rnd(shopsG), ag: agG, zs: zonesG, destCity: cS, destZones: zonesS, daysAgo: 0, minutes: 240 + k, final: 'attente' }));
const mkBrd = async (items, stage) => {
  const m = await one(`INSERT INTO manifests (ref, from_city, to_city, carrier, responsible, origin_agency_id, dest_agency_id, stage, created_by, validated_at, shipped_at)
                       VALUES ('BRD-GAF-SOU-' || lpad(nextval('manifest_ref_seq')::text, 4, '0'), 'Gafsa', 'Sousse', 'Sud Express Transport', $1, $2, $3, $4, $5,
                               CASE WHEN $4 >= 1 THEN now() END, CASE WHEN $4 >= 2 THEN now() END) RETURNING *`, [mG.name, agG.id, agS.id, stage, mG.id]);
  for (const o of items) {
    await q(`INSERT INTO manifest_items (manifest_id, order_id, added_by, loaded_at) VALUES ($1,$2,$3, CASE WHEN $4 >= 2 THEN now() END)`, [m.id, o.id, mG.id, stage]);
    await q(`UPDATE orders SET manifest_id = $1 WHERE id = $2`, [m.id, o.id]);
    if (stage >= 2) await changeStatus(await one(`SELECT * FROM orders WHERE id = $1`, [o.id]), 'transit', { system: true, user: mG, actor: `${mG.name} · bordereau ${m.ref}` });
  }
  return m;
};
const b1 = await mkBrd(inter.slice(0, 3), 2), b2 = await mkBrd(inter.slice(3), 1);

/* ---------- claims, cash ---------- */
const delivered = await q(`SELECT id, driver_id FROM orders WHERE status IN ('livre','absent') AND driver_id IS NOT NULL ORDER BY random() LIMIT 4`);
const CL = [[0, 'Livraison prévue le matin, le livreur est arrivé à 14 h sans prévenir.', 0], [3, 'Le livreur n’avait pas de monnaie, j’ai dû payer 2 TND de plus.', 1],
  [2, 'Carton écrasé sur un coin, produit intact.', 2], [1, 'Ton désagréable au téléphone.', 3]];
for (const [i, [cat, text, st]] of CL.entries())
  await q(`INSERT INTO claims (order_id, driver_id, category, text, status, created_at) VALUES ($1,$2,$3,$4,$5, now() - make_interval(days => $6))`, [delivered[i].id, delivered[i].driver_id, cat, text, st, i]);
const tx = (agencyId, label, type, amount, extra = {}) => q(
  `INSERT INTO cash_tx (agency_id, label, type, amount, driver_id, shop_id, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7, date_trunc('day', now()) + interval '9 hours' + make_interval(mins => $8))`,
  [agencyId, label, type, amount, extra.driver_id || null, extra.shop_id || null, admin.id, extra.min || 0]);
await q(`INSERT INTO cash_tx (agency_id, label, type, amount, created_at) VALUES ($1, 'Solde d’ouverture', 'Correction', 9500, now() - interval '20 days'), ($2, 'Solde d’ouverture', 'Correction', 4000, now() - interval '20 days')`, [agG.id, agS.id]);
await tx(agG.id, 'Versement COD — Ahmed Ben Salah', 'Encaissement', 412.5, { driver_id: drivers[0].id, min: 10 });
await tx(agG.id, 'Paiement livreur — Ali Gharbi', 'Paiement livreur', -60, { driver_id: drivers[2].id, min: 40 });
await tx(agG.id, 'Carburant — moto n° 3', 'Dépense', -35, { min: 70 });
await tx(agG.id, 'Règlement boutique — Électro Sud', 'Règlement', -640, { shop_id: shops[0].id, min: 100 });
await tx(agS.id, 'Versement COD — Wael Chaabane', 'Encaissement', 180, { driver_id: drivers[6].id, min: 30 });

const count = await one(`SELECT count(*)::int AS n FROM orders`);
console.log(`
Seed OK — ${count.n} commandes, 2 agences, ${drivers.length} livreurs, ${shops.length} boutiques, bordereaux ${b1.ref} (en transit) et ${b2.ref} (validé).
Mot de passe de tous les comptes : saden123
  Super admin         20000000  (Lotfi Amri)
  Responsable Gafsa   20000001  (Rym Karray)       Responsable Sousse  20000002  (Hatem Ben Amor)
  Livreurs            21000001…21000006 (Gafsa)    21000007, 21000008 (Sousse)
  Boutiques           22000001…22000005 (Gafsa)    22000006 (Sousse)
Clé API du partenaire « Gafsa Mall » (affichée une seule fois) :
  ${key.key}`);
await close();
