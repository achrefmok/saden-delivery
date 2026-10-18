// Agency fleet + driver app scenario (npm run test:fleet): performance table, parcels to assign, bulk assignment,
// driver missions, pickup collected by scan, delivery with OTP, cash held, history, call log, failed delivery to bring
// back, unassignment, message, permissions. LOCAL server on a freshly seeded DB only.
const B = (process.env.SADEN_URL || 'http://localhost:3000').replace(/\/$/, '') + '/api/';
if (!/\/\/(localhost|127\.0\.0\.1)[:/]/.test(B)) { console.error('Refusé : ce test modifie les données, serveur local uniquement.'); process.exit(2); }
let pass = 0, failN = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { failN++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };
async function login(id) {
  const r = await fetch(B + 'auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: id, password: 'saden123' }) });
  return (await r.json()).token;
}
const mk = T => async (method, p, body) => {
  const r = await fetch(B + p, { method, headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, ...(await r.json().catch(() => ({}))) };
};
const G = mk(await login('20000001')), S = mk(await login('20000002')), SH = mk(await login('22000001'));

console.log('1. Tableau des livreurs (responsable)');
let fl = await G('GET', 'fleet/drivers?days=30');
ok(fl.drivers.length >= 3 && fl.drivers.every(d => 'success_rate' in d && 'to_remit' in d && 'avg_route_min' in d && 'first_pass_rate' in d), `${fl.drivers.length} livreurs avec performance, caisse, taux`);
ok(fl.totals && 'on_duty' in fl.totals && 'to_remit' in fl.totals, 'totaux de l’agence');
const sv = await S('GET', 'fleet/drivers');
ok(!sv.drivers.some(d => fl.drivers.some(x => x.id === d.id)), 'Sousse ne voit que ses livreurs');
const d = fl.drivers.find(x => x.active && x.phone);
const DR = mk(await login(d.phone.replace(/\D/g, '').slice(-8)));
await DR('POST', 'me/status', { status: 'dispo', gps_consent: true });

console.log('2. Colis à affecter + affectation groupée');
const geo = await G('GET', 'geo');
const city = geo.cities.find(c => c.id === geo.agencies.find(a => a.name === 'Agence Gafsa').city_id), zone = geo.zones.find(z => z.city_id === city.id);
const mkOrder = async n => (await G('POST', 'orders', { client_name: 'Flotte ' + n, client_phone: '+216 22 81' + n + ' 000', address: 'Rue flotte ' + n, dest_city_id: city.id, zone_id: zone.id, cod: 50 + n })).order;
const a1 = await mkOrder(1), a2 = await mkOrder(2), a3 = await mkOrder(3);
await G('POST', 'stock/receive', { code: a1.ref }); await G('POST', 'stock/receive', { code: a2.ref }); await G('POST', 'stock/receive', { code: a3.ref });
let un = await G('GET', 'fleet/unassigned');
ok([a1, a2, a3].every(o => un.parcels.some(p => p.id === o.id)), 'colis sans livreur listés');
let r = await G('POST', 'fleet/assign', { order_ids: [a1.id, a2.id, a3.id], driver_id: d.id });
ok(r.done.length === 3 && !r.errors.length, 'affectation groupée de 3 colis', r);
r = await G('POST', 'fleet/assign', { order_ids: [a1.id], driver_id: d.id });
ok(r.errors.length === 1 && /déjà affecté/.test(r.errors[0]), 'double affectation refusée');
ok((await G('POST', 'fleet/assign', { order_ids: [a1.id], driver_id: sv.drivers[0].id })).s === 404, 'livreur d’une autre agence refusé');
ok(!(await G('GET', 'fleet/unassigned')).parcels.some(p => p.id === a1.id), 'sortis de la liste « à affecter »');

console.log('3. Application livreur : missions, appels, livraison, caisse');
let ov = await DR('GET', 'driver/overview');
ok([a1, a2, a3].every(o => ov.missions.some(m => m.id === o.id)), 'missions reçues');
ok(ov.cash && 'to_remit' in ov.cash && ov.today && ov.call_outcomes, 'caisse, compteurs du jour, résultats d’appel');
r = await DR('POST', 'driver/calls', { order_id: a1.id, outcome: 'joint', note: 'Client disponible' });
ok(r.id, 'appel client enregistré');
ok((await DR('POST', 'driver/calls', { order_id: a1.id, outcome: 'xx' })).s === 400, 'résultat d’appel invalide refusé');
const before = ov.cash.to_remit;
for (const st of ['accepte', 'livraison', 'sur_place']) await DR('POST', `orders/${a1.id}/status`, { status: st });
const otp = (await G('GET', `orders/${a1.id}`)).order.otp;
r = await DR('POST', `orders/${a1.id}/status`, { status: 'livre', proof_type: 'otp', otp });
ok(r.s === 200, 'livraison confirmée par code OTP', r);
ov = await DR('GET', 'driver/overview');
ok(Math.abs(ov.cash.to_remit - before - 51) < 0.001 && ov.today.delivered >= 1, `caisse en main +51 (${ov.cash.to_remit})`);
const hist = await DR('GET', 'driver/history');
ok(hist.rows.some(x => x.order_id === a1.id && x.status === 'livre') && hist.totals.delivered >= 1, 'historique du livreur');
ok((await DR('GET', 'driver/cash')).collected.some(x => x.ref === a1.ref), 'détail des encaissements');
ok((await G('GET', `orders/${a1.id}`)).calls.some(c => c.outcome === 'joint'), 'l’agence voit l’appel du livreur');

console.log('4. Échec → à rapporter, désaffectation');
for (const st of ['accepte', 'livraison']) await DR('POST', `orders/${a2.id}/status`, { status: st });
await DR('POST', `orders/${a2.id}/status`, { status: 'absent', note: 'Personne' });
ov = await DR('GET', 'driver/overview');
ok(ov.back.some(o => o.id === a2.id), 'colis à rapporter à l’agence');
r = await G('POST', 'fleet/unassign', { order_ids: [a3.id, a2.id] });
ok(r.done.length === 1 && r.errors.length === 1, 'désaffectation : non commencé oui, en cours non', r);
const a3b = (await G('GET', `orders/${a3.id}`)).order;
ok(a3b.status === 'en_agence' && !a3b.driver_id && a3b.in_stock, 'colis remis en stock sans livreur');

console.log('5. Enlèvement chez la boutique confirmé par scan du livreur');
const so = (await SH('POST', 'orders', { client_name: 'Flotte enl', client_phone: '+216 22 819 000', address: 'Rue E', dest_city_id: city.id, zone_id: zone.id, cod: 30 })).order;
const pr = await SH('POST', 'shop/pickups', { order_ids: [so.id] });
await G('PATCH', `manifests/${pr.manifest.id}`, { driver_id: d.id });
await G('POST', `manifests/${pr.manifest.id}/validate`);
ov = await DR('GET', 'driver/overview');
const pk = ov.pickups.find(x => x.id === pr.manifest.id);
ok(pk && pk.shop_name && pk.items.length === 1 && !pk.items[0].collected, 'enlèvement annoncé au livreur (boutique, adresse, colis)');
r = await DR('POST', `driver/pickups/${pk.id}/collect`, { code: 'SD-0' });
ok(r.s === 404, 'code étranger à l’enlèvement refusé');
r = await DR('POST', `driver/pickups/${pk.id}/collect`, { code: so.ref });
ok(/enlèvement complet/.test(r.message || ''), 'scan au comptoir : ' + r.message);
ok((await G('GET', `orders/${so.id}`)).order.status === 'ramasse' && (await G('GET', `manifests/${pk.id}`)).manifest.stage === 2, 'colis « ramassé », bordereau « enlevé »');
ok((await DR('POST', `driver/pickups/${pk.id}/collect`, { code: so.ref })).already, 'double scan ignoré');
r = await G('POST', `manifests/${pk.id}/scan`, { code: so.ref });
ok(/reçu/.test(r.message || ''), 'réception à l’agence');

console.log('6. Fiche livreur, message');
const det = await G('GET', `fleet/drivers/${d.id}`);
ok(det.perf.delivered >= 1 && det.history.length && Array.isArray(det.daily) && det.missions.some(m => m.id === a2.id), 'fiche : performance, missions, historique, activité quotidienne');
ok((await S('GET', `fleet/drivers/${d.id}`)).s === 404, 'autre agence : fiche invisible');
r = await G('POST', `fleet/drivers/${d.id}/message`, { text: 'Passez à l’agence à 16 h' });
ok(r.ok && (await DR('GET', 'notifications')).items.some(n => n.body === 'Passez à l’agence à 16 h'), 'message reçu par le livreur');

console.log('7. Permissions');
ok((await DR('GET', 'fleet/drivers')).s === 403, 'livreur : pas d’accès à la flotte');
ok((await SH('GET', 'fleet/drivers')).s === 403, 'boutique : pas d’accès');
const other = (await G('GET', 'parcels?status=livre&size=50')).rows.find(x => x.driver_name && x.driver_name !== d.name);
ok((await DR('POST', 'driver/calls', { order_id: other.id, outcome: 'joint' })).s === 404, 'livreur : appel sur un colis d’un autre refusé');
ok((await G('GET', 'driver/overview')).s === 403, 'responsable : pas d’accès à l’application livreur');

console.log(`\n${pass} OK, ${failN} échec(s)`);
process.exit(failN ? 1 : 0);
