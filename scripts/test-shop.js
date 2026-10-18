// Shipper space scenario (npm run test:shop): dashboard, create (2nd phone, exchange), detail, edit / cancel while
// waiting, Excel import, own parcel list, claims wizard, pickup requests (selection / cancel), payments with
// withholding tax, statistics, shop users, profile, permissions. LOCAL server on a freshly seeded DB only.
const B = (process.env.SADEN_URL || 'http://localhost:3000').replace(/\/$/, '') + '/api/';
if (!/\/\/(localhost|127\.0\.0\.1)[:/]/.test(B)) { console.error('Refusé : ce test modifie les données, serveur local uniquement.'); process.exit(2); }
let pass = 0, failN = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { failN++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };
async function login(id, pw = 'saden123') {
  const r = await fetch(B + 'auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: id, password: pw }) });
  const j = await r.json(); return j.token || null;
}
const mk = T => async (method, p, body) => {
  const r = await fetch(B + p, { method, headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, ...(await r.json().catch(() => ({}))) };
};
const A = mk(await login('20000000')), G = mk(await login('20000001')), SH = mk(await login('22000001')), SH2 = mk(await login('22000002'));
const me = (await SH('GET', 'shop/profile')).profile;
const geo = await G('GET', 'geo');
const city = geo.cities.find(c => geo.zones.some(z => z.city_id === c.id)), zone = geo.zones.find(z => z.city_id === city.id);
const order = (n, x = {}) => SH('POST', 'orders', { client_name: 'Client ' + n, client_phone: '+216 22 7' + String(n).padStart(2, '0') + ' 100', address: 'Rue ' + n, dest_city_id: city.id, zone_id: zone.id, cod: 40, ...x });

console.log('1. Tableau de bord');
let d = await SH('GET', 'shop/dashboard');
ok(['delivered_n', 'delivered_cod', 'returned_n', 'with_us_n', 'out_n', 'stock_n', 'ret_n', 'settled_n', 'waiting_n'].every(k => k in d), 'cartes : livrés, reçus par l’expéditeur, chez Saden, en livraison, entrepôt, retour, soldés, en attente');
const livres = (await SH('GET', 'parcels?status=livre&size=200')).total;
ok(d.delivered_n === livres, `livrés cohérents avec la liste (${livres})`);

console.log('2. Création (téléphone 2, échange, contrôle)');
let r = await order(1, { client_phone2: '+216 98 111 222', exchange: true, exchange_description: 'Reprendre l’ancien modèle' });
ok(r.order?.ref && r.order.exchange_ref === 'E' + r.order.ref, `colis ${r.order?.ref} + échange ${r.order?.exchange_ref}`);
const o1 = r.order;
ok((await order(2, { client_phone2: '123' })).s === 400, 'téléphone 2 invalide refusé');
let det = await SH('GET', `shop/orders/${o1.id}`);
ok(det.order.client_phone2 === '+216 98 111 222' && !('otp' in det.order) && det.events.length >= 2 && det.editable, 'fiche : téléphone 2, parcours, sans code OTP, modifiable');

console.log('3. Modifier / annuler tant que « en attente »');
r = await SH('PATCH', `shop/orders/${o1.id}`, { cod: 75, description: 'Robe bleue' });
ok(r.ok, 'modification');
det = await SH('GET', `shop/orders/${o1.id}`);
ok(det.order.cod === 75 && det.order.description === 'Robe bleue' && det.order.amount_to_remit > 0, 'montant et prix recalculés');
const o2 = (await order(3)).order, o3 = (await order(4)).order;
await G('POST', 'stock/receive', { code: o3.ref });
ok((await SH('PATCH', `shop/orders/${o3.id}`, { cod: 1 })).s === 409, 'colis pris en charge : plus modifiable');
r = await SH('POST', 'shop/orders/cancel', { ids: [o2.id, o3.id] });
ok(r.done.length === 1 && r.errors.length === 1, 'annulation groupée : en attente oui, pris en charge non', r);
ok((await SH('GET', `shop/orders/${o2.id}`)).order.status === 'annule', 'colis annulé (jamais supprimé)');

console.log('4. Import Excel');
r = await SH('POST', 'shop/orders/import', { rows: [
  { nom: 'Import A', telephone: '22123456', adresse: 'Rue A', ville: city.name, zone: zone.name, montant: 30, reference: 'CMD-1' },
  { nom: 'Import B', telephone: '22123457', adresse: 'Rue B', ville: 'Atlantis', montant: 10 },
  { nom: '', telephone: '22123458', adresse: 'Rue C', ville: city.name, montant: 10 },
  { nom: 'Import D', telephone: '22123459', adresse: 'Rue D', ville: city.name.toUpperCase(), montant: 20, echange: 'oui' }] });
ok(r.created?.length === 2 && r.errors.length === 2 && r.errors[0].line === 3 && /Atlantis/.test(r.errors[0].error), 'import : 2 créés, erreurs avec numéro de ligne', r);

console.log('5. Liste de la boutique');
let pl = await SH('GET', 'parcels?size=200');
ok(pl.rows.length && pl.rows.every(x => x.shop_name === me.shop_name), 'uniquement ses colis');
const other = (await SH2('GET', 'parcels?size=5')).rows[0];
ok(!(await SH('GET', 'parcels?refs=' + other.ref)).total, 'colis d’une autre boutique invisible');
ok(pl.rows.every(x => 'settled' in x && 'picked_at' in x && 'returned_at' in x), 'colonnes soldé / enlèvement / retour');
ok((await SH('GET', 'parcels?outstanding=1&size=200')).rows.every(x => x.status === 'livre' && !x.settled), 'filtre « outstanding » (livrés non soldés)');
ok((await SH('POST', 'parcels/bulk-status', { ids: [o1.id], status: 'annule' })).s === 403, 'pas de mise à jour en masse');
ok((await SH('GET', 'parcels/matrix')).s === 403, 'pas de matrice');

console.log('6. Réclamations');
ok((await SH('POST', 'shop/claims', { ref: o1.ref, category: 9, text: 'x' })).s === 400, 'type invalide refusé');
r = await SH('POST', 'shop/claims', { ref: o1.ref, category: 0, text: 'Toujours pas enlevé' });
ok(/^RC-/.test(r.ref || ''), 'réclamation par code : ' + r.ref);
ok((await SH('POST', 'shop/claims', { ref: o1.ref, category: 0, text: 'encore' })).s === 409, 'une seule réclamation en cours par colis');
await order(5, { client_phone: '+216 22 555 999' }); await order(6, { client_phone: '+216 22 555 999' });
r = await SH('POST', 'shop/claims', { phone: '22555999', category: 4, text: 'Adresse' });
ok(r.s === 409 && r.candidates?.length === 2, 'par téléphone : plusieurs colis → choix proposé');
r = await SH('POST', 'shop/claims', { order_id: r.candidates[0].id, category: 4, text: 'Adresse à corriger' });
ok(r.ref, 'réclamation sur le colis choisi');
ok((await SH('GET', 'shop/claims')).claims.length >= 2, 'historique des réclamations');
ok((await SH2('POST', 'shop/claims', { ref: o1.ref, category: 0, text: 'x' })).s === 404, 'autre boutique : colis introuvable');

console.log('7. Expéditions (demande d’enlèvement par sélection)');
const p1 = (await order(7)).order, p2 = (await order(8)).order;
await SH('DELETE', 'shop/pickups/0').catch(() => {});
for (const x of (await SH('GET', 'shop/pickups')).pickups.filter(x => x.stage === 0)) await SH('DELETE', `shop/pickups/${x.id}`);
r = await SH('POST', 'shop/pickups', { order_ids: [p1.id], refs: [p2.ref], comment: 'Sélection' });
ok(r.parcels === 2, 'demande avec 2 colis sélectionnés (case + scan)');
const env = r.manifest.id;
ok((await SH('GET', `shop/manifests/${env}`)).items.length === 2, 'colis de l’expédition');
r = await SH('DELETE', `shop/pickups/${env}`);
ok(r.ok, 'demande annulée tant que « à enlever »');
r = await SH('POST', 'shop/pickups', { order_ids: [p1.id] });
const drv = (await G('GET', 'manifests/drivers')).drivers.find(x => x.active);
await G('PATCH', `manifests/${r.manifest.id}`, { driver_id: drv.id });
await G('POST', `manifests/${r.manifest.id}/validate`);
ok((await SH('DELETE', `shop/pickups/${r.manifest.id}`)).s === 409, 'livreur annoncé : annulation refusée');
ok((await SH('GET', 'shop/manifests?type=pickup')).manifests.some(x => x.id === r.manifest.id && x.driver_name), 'historique des expéditions (livreur, téléphone)');

console.log('8. Paiements (net, retenue à la source)');
ok((await G('PATCH', `users/${me.id}`, { rs_rate: 3 })).s === 403, 'responsable : taux de retenue refusé');
ok((await A('PATCH', `users/${me.id}`, { rs_rate: 3 })).user, 'administrateur : retenue 3 % pour la boutique');
const sld = (await G('POST', 'manifests', { type: 'settlement', shop_id: me.id, period_from: '2020-01-01', period_to: '2030-12-31' })).manifest;
let sd = await G('GET', `manifests/${sld.id}`);
const t = sd.manifest.totals;
ok(t.rs_rate === 3 && Math.abs(t.honoraires - (t.collected - t.due)) < 0.001 && Math.abs(t.rs - Math.round(t.honoraires * 0.03 * 1000) / 1000) < 0.001 && Math.abs(t.balance - (t.due - t.rs - t.remitted_before)) < 0.001, `net = dû ${t.due} − retenue ${t.rs} − déjà versé ${t.remitted_before} = ${t.balance}`);
await G('POST', `manifests/${sld.id}/validate`, {});
const pays = (await SH('GET', 'shop/manifests?type=settlement')).manifests;
ok(pays.some(x => x.id === sld.id && x.totals.rs === t.rs), 'la boutique voit son paiement avec la retenue');
const pd = await SH('GET', `shop/manifests/${sld.id}`);
ok(pd.items.length === t.orders && pd.items.every(x => x.amount != null), 'colis du paiement');
ok((await SH('GET', 'parcels?settled=1&size=200')).total === t.orders, 'colis marqués « soldés »');
ok((await SH('GET', 'shop/dashboard')).settled_n === t.orders, 'carte « colis soldés »');
ok((await SH2('GET', `shop/manifests/${sld.id}`)).s === 404, 'autre boutique : paiement invisible');
await A('PATCH', `users/${me.id}`, { rs_rate: 0 });

console.log('9. Statistiques');
const st = await SH('GET', 'shop/stats?preset=12m');
ok(st.delay.h24 + st.delay.h48 + st.delay.h72 + st.delay.more === st.kpis.delivered, `délais de livraison (≤24 h ${st.delay.h24}, ≤48 h ${st.delay.h48}, ≤72 h ${st.delay.h72}, +72 h ${st.delay.more})`);
ok(Array.isArray(st.problems) && Array.isArray(st.claims) && st.governorates.length, 'problèmes, réclamations, gouvernorats');

console.log('10. Utilisateurs de la boutique et profil');
r = await SH('POST', 'shop/users', { name: 'Employé Test', phone: '29 000 111', password: 'secret1', shop_role: 'agent' });
ok(r.user?.id, 'employé créé');
const E = mk(await login('29000111', 'secret1'));
ok((await E('GET', 'shop/dashboard')).delivered_n === (await SH('GET', 'shop/dashboard')).delivered_n, 'l’employé voit les colis de la boutique');
r = await E('POST', 'orders', { client_name: 'Par employé', client_phone: '+216 22 600 600', address: 'Rue E', dest_city_id: city.id, zone_id: zone.id, cod: 12 });
ok((await SH('GET', `shop/orders/${r.order.id}`)).order.shop_name === me.shop_name, 'colis créé par l’employé au nom de la boutique');
ok((await E('POST', 'shop/users', { name: 'x', phone: '29000112', password: 'secret1' })).s === 403, 'un agent ne gère pas les utilisateurs');
const uid = (await SH('GET', 'shop/users')).users.find(u => u.phone === '29000111').id;
await SH('PATCH', `shop/users/${uid}`, { active: false });
ok(!(await login('29000111', 'secret1')), 'employé désactivé : connexion refusée');
ok((await SH('PATCH', 'shop/profile', { print_format: 'a4' })).print_format === 'a4' && (await SH('GET', 'shop/profile')).me.print_format === 'a4', 'format d’impression mémorisé');

console.log('11. Permissions');
ok((await G('GET', 'shop/dashboard')).s === 403, 'agence : pas d’accès aux routes boutique');
ok((await SH('GET', 'manifests')).s === 403, 'boutique : pas d’accès aux bordereaux de l’agence');

console.log(`\n${pass} OK, ${failN} échec(s)`);
process.exit(failN ? 1 : 0);
