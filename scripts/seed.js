// Demo data (from the design). Runs only on an empty database:  npm run seed
// Accounts created — password for all: saden123
//   Admin     20000000      Livreurs 21000001…21000006      Boutiques 22000001…22000005
try { process.loadEnvFile('.env'); } catch {}
const { q, one, close } = await import('../lib/db.js');
const { hashPassword } = await import('../lib/auth.js');

if ((await one(`SELECT count(*)::int AS n FROM orders`)).n > 0) {
  console.log('La base contient déjà des commandes — seed ignoré.');
  await close(); process.exit(0);
}

const pw = await hashPassword('saden123');
const ZONES = { 'Centre-ville': [34.4250, 8.7842], 'Cité Ennour': [34.4335, 8.7935], 'Douali': [34.4372, 8.7705], 'El Ksar': [34.4120, 8.7640], 'Sidi Ahmed Zarroug': [34.4010, 8.8010], 'Cité Essourour': [34.4285, 8.8060] };
const jitter = ([a, b]) => [a + (Math.random() - 0.5) * 0.006, b + (Math.random() - 0.5) * 0.006];

async function user(role, name, phone, x = {}) {
  const ex = await one(`SELECT id FROM users WHERE phone = $1`, [phone]);
  if (ex) return ex.id;
  const r = await one(`INSERT INTO users (role, name, phone, password_hash, zone, vehicle, shop_name, address, status, lat, lng, battery, last_seen)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now()) RETURNING id`,
    [role, name, phone, pw, x.zone || null, x.vehicle || null, x.shop_name || null, x.address || null, x.status || 'dispo', x.lat ?? null, x.lng ?? null, x.battery ?? null]);
  return r.id;
}

await user('admin', 'Lotfi Amri', '20000000');
const DRV = [['Ahmed Ben Salah', 'Centre-ville', 'Moto', 'dispo', 82], ['Mohamed Trabelsi', 'Cité Ennour', 'Moto', 'livraison', 64], ['Ali Gharbi', 'El Ksar', 'Voiture', 'dispo', 91],
  ['Sami Mansouri', 'Sidi Ahmed Zarroug', 'Moto', 'pause', 38], ['Nour Jlassi', 'Douali', 'Scooter', 'livraison', 57], ['Youssef Hamdi', 'Cité Essourour', 'Voiture', 'off', null]];
const drivers = [];
for (const [i, [name, zone, vehicle, status, battery]] of DRV.entries()) {
  const [lat, lng] = jitter(ZONES[zone]);
  drivers.push({ id: await user('driver', name, '2100000' + (i + 1), { zone, vehicle, status, battery, lat, lng }), name });
}
const SHOPS = [['Électro Sud', 'Karim Ben Ali', 'Centre-ville'], ['Yasmine Mode', 'Yasmine Ayari', 'Centre-ville'], ['Pharmacie El Amen', 'Hela Mansour', 'El Ksar'],
  ['Pâtisserie Ennakhla', 'Fares Nasri', 'Douali'], ['Librairie Al Manar', 'Mounir Haddad', 'Cité Ennour']];
const shops = [];
for (const [i, [shop_name, name, zone]] of SHOPS.entries()) shops.push(await user('shop', name, '2200000' + (i + 1), { shop_name, zone, address: 'Gafsa Mall, ' + zone }));

const CLIENTS = ['Salma Khemiri', 'Rania Bouazizi', 'Hédi Mejri', 'Imen Saidi', 'Karim Ferchichi', 'Wassim Abidi', 'Amira Nasri', 'Fethi Gafsi', 'Olfa Brahmi', 'Leila Hamrouni', 'Bilel Chebbi', 'Hajer Toumi', 'Mariem Sassi', 'Oussama Ayari', 'Nadia Kefi'];
const zoneNames = Object.keys(ZONES);
const pick = a => a[Math.floor(Math.random() * a.length)];
const COMMENTS = ['Livreur ponctuel et très professionnel.', 'Très aimable, a appelé avant d’arriver.', 'Colis livré avec soin.', 'Rapide et souriant.', 'Arrivé en retard mais courtois.', ''];

async function order({ daysAgo, minutes, status, driver, shop, client, zone, cod, dest }) {
  const created = `now() - interval '${daysAgo} days' - interval '${minutes} minutes'`;
  const [lat, lng] = jitter(ZONES[zone]);
  const o = await one(`INSERT INTO orders (ref, shop_id, client_name, client_phone, zone, address, lat, lng, dest_city, cod, status, driver_id, otp, created_at, updated_at)
    VALUES ('SD-' || nextval('order_ref_seq'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, ${created}, ${created} + interval '45 minutes') RETURNING id`,
    [shop, client, '+216 9' + Math.floor(1000000 + Math.random() * 8999999), zone, 'Rue ' + Math.ceil(Math.random() * 40) + ', ' + zone, lat, lng, dest || null, cod, status, driver?.id || null, String(1000 + Math.floor(Math.random() * 9000))]);
  const chain = dest ? ['cree', 'attente', 'transit'] : ['cree', 'attente', 'affecte', 'accepte', 'livraison', 'sur_place', 'livre'];
  const stop = chain.indexOf(status);
  const steps = stop >= 0 ? chain.slice(0, stop + 1) : [...chain.slice(0, 6), status];
  for (const [j, st] of steps.entries())
    await q(`INSERT INTO order_events (order_id, status, actor, created_at) VALUES ($1,$2,$3, ${created} + interval '${j * 8} minutes')`,
      [o.id, st, st === 'attente' ? 'Système' : ['cree'].includes(st) ? 'Boutique' : ['affecte'].includes(st) ? 'Lotfi Amri · agence' : (driver?.name || 'Agence') + ' · livreur']);
  return o.id;
}

// 14 days of history
for (let d = 13; d >= 1; d--) {
  const n = 6 + Math.floor(Math.random() * 7);
  for (let k = 0; k < n; k++) {
    const r = Math.random(), status = r < 0.86 ? 'livre' : r < 0.93 ? 'absent' : r < 0.97 ? 'refuse' : 'reporte';
    const drv = pick(drivers);
    const id = await order({ daysAgo: d, minutes: 60 + k * 35, status, driver: drv, shop: pick(shops), client: pick(CLIENTS), zone: pick(zoneNames), cod: Math.round(Math.random() * 300 * 2) / 2 });
    if (status === 'livre' && Math.random() < 0.6)
      await q(`INSERT INTO reviews (order_id, driver_id, stars, comment, created_at) VALUES ($1,$2,$3,$4, now() - interval '${d} days')`,
        [id, drv.id, Math.random() < 0.7 ? 5 : Math.random() < 0.7 ? 4 : 3, pick(COMMENTS) || null]);
  }
}

// today (as in the design)
const D = Object.fromEntries(drivers.map(d => [d.name, d]));
const today = [
  ['Salma Khemiri', 'Cité Ennour', 189, 'livraison', 'Mohamed Trabelsi', 0], ['Rania Bouazizi', 'Centre-ville', 64.5, 'attente', null, 1],
  ['Hédi Mejri', 'El Ksar', 23.8, 'affecte', 'Ali Gharbi', 2], ['Imen Saidi', 'Douali', 42, 'livre', 'Nour Jlassi', 3],
  ['Karim Ferchichi', 'Sidi Ahmed Zarroug', 17.5, 'absent', 'Sami Mansouri', 4], ['Amira Nasri', 'Centre-ville', 88, 'livre', 'Ahmed Ben Salah', 1],
  ['Fethi Gafsi', 'Cité Essourour', 55, 'refuse', 'Youssef Hamdi', 0], ['Olfa Brahmi', 'Cité Ennour', 120, 'attente', null, 2],
  ['Leila Hamrouni', 'Centre-ville', 64.5, 'affecte', 'Ahmed Ben Salah', 1], ['Bilel Chebbi', 'Cité Ennour', 215, 'affecte', 'Ahmed Ben Salah', 0],
  ['Hajer Toumi', 'El Ksar', 0, 'affecte', 'Ahmed Ben Salah', 2],
];
for (const [i, [client, zone, cod, status, drv, shop]] of today.entries())
  await order({ daysAgo: 0, minutes: 200 - i * 12, status, driver: drv && D[drv], shop: shops[shop], client, zone, cod });
for (const [client, dest] of [['Wassim Abidi', 'Sousse'], ['Mariem Sassi', 'Sousse'], ['Nadia Kefi', 'Tunis'], ['Oussama Ayari', 'Tunis']])
  await order({ daysAgo: 0, minutes: 240, status: 'attente', shop: shops[0], client, zone: 'Centre-ville', cod: 75, dest });

// claims, cash
const claimOn = async (cat, text, st, daysAgo) => {
  const o = await one(`SELECT id, driver_id FROM orders WHERE status IN ('livre','absent') AND driver_id IS NOT NULL ORDER BY random() LIMIT 1`);
  await q(`INSERT INTO claims (order_id, driver_id, category, text, status, created_at) VALUES ($1,$2,$3,$4,$5, now() - interval '${daysAgo} days')`, [o.id, o.driver_id, cat, text, st]);
};
await claimOn(0, 'Livraison prévue le matin, le livreur est arrivé à 14 h sans prévenir.', 0, 0);
await claimOn(3, 'Le livreur n’avait pas de monnaie, j’ai dû payer 2 TND de plus.', 1, 1);
await claimOn(2, 'Carton écrasé sur un coin, produit intact.', 2, 2);
await claimOn(1, 'Ton désagréable au téléphone.', 3, 4);
for (const [label, type, amount, min] of [['Versement COD — Ahmed Ben Salah', 'Encaissement', 412.5, 240], ['Paiement livreur — Ali Gharbi', 'Paiement livreur', -60, 210],
  ['Carburant — moto n° 3', 'Dépense', -35, 180], ['Règlement boutique — Électro Sud', 'Règlement', -1240, 150], ['Versement COD — Nour Jlassi', 'Encaissement', 286, 60]])
  await q(`INSERT INTO cash_tx (label, type, amount, created_at) VALUES ($1,$2,$3, date_trunc('day', now()) + interval '8 hours' + interval '${240 - min} minutes')`, [label, type, amount]);
await q(`INSERT INTO cash_tx (label, type, amount, created_at) VALUES ('Solde d’ouverture', 'Correction', 9500, now() - interval '20 days')`);

console.log('Seed OK — mot de passe de tous les comptes : saden123 (admin : 20000000, livreur : 21000001, boutique : 22000001)');
await close();
