// Operations follow-up scenario (npm run test:ops): attempts, problems queue, calls, treatment, appointments,
// tasks, flagged / suspect / outstanding parcels, permissions. LOCAL server on a freshly seeded DB only.
const B = (process.env.SADEN_URL || 'http://localhost:3000').replace(/\/$/, '') + '/api/';
if (!/\/\/(localhost|127\.0\.0\.1)[:/]/.test(B)) { console.error('Refusé : ce test modifie les données, serveur local uniquement.'); process.exit(2); }
let pass = 0, failN = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓', msg); } else { failN++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };
async function login(id) {
  const r = await fetch(B + 'auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: id, password: 'saden123' }) });
  const j = await r.json(); if (!j.token) throw new Error('login ' + id); return j.token;
}
const mk = T => async (method, p, body) => {
  const r = await fetch(B + p, { method, headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, ...(await r.json().catch(() => ({}))) };
};
const A = mk(await login('20000000')), G = mk(await login('20000001')), S = mk(await login('20000002')), SH = mk(await login('22000001'));
const ord = async id => (await A('GET', 'orders/' + id)).order;

console.log('1. Tentatives et problème automatique');
// own parcel: created by the agency, assigned to an agency driver who accepts it
const ov0 = (await A('GET', 'admin/overview')).orders;
const loc = ov0.find(o => o.origin_agency_name === 'Agence Gafsa' && o.origin_city_id === o.dest_city_id && o.zone_id);
const cr = await G('POST', 'orders', { client_name: 'Test tentatives', client_phone: '+216 22 333 111', address: 'Rue des tests', dest_city_id: loc.dest_city_id, zone_id: loc.zone_id, cod: 20 });
const drivers0 = (await G('GET', 'manifests/drivers')).drivers.filter(d => d.active);
const dA = drivers0[0];
await G('POST', `orders/${cr.order.id}/assign`, { driver_id: dA.id });
const DR = mk(await login(dA.phone.replace(/\D/g, '').slice(-8)));
await DR('POST', `orders/${cr.order.id}/status`, { status: 'accepte' });
const target = { id: cr.order.id };
const before = await ord(target.id);
let r = await DR('POST', `orders/${target.id}/status`, { status: 'absent', note: 'Personne au domicile' });
ok(r.s === 200, 'le livreur signale « client absent »', r);
let after = await ord(target.id);
ok(after.attempts === before.attempts + 1, `tentative +1 (${before.attempts} → ${after.attempts})`);
let pb = (await G('GET', 'problems')).problems.find(p => p.order_id === target.id && p.status === 'open' && p.type === 'absent');
ok(pb && pb.note === 'Personne au domicile' && pb.driver_name, 'problème ouvert dans la file de l’agence (type, note, livreur)', pb);

console.log('2. Appels et traitement');
r = await G('POST', `problems/${pb.id}/call`, { outcome: 'xx' });
ok(r.s === 400, 'résultat d’appel invalide refusé');
await G('POST', `problems/${pb.id}/call`, { outcome: 'ne_repond_pas' });
r = await G('POST', `problems/${pb.id}/call`, { outcome: 'joint', note: 'Disponible demain matin' });
ok(r.calls === 2, 'appels comptés (2)');
ok((await G('GET', `problems/${pb.id}/calls`)).calls.length === 2, 'historique des appels');
r = await G('POST', `problems/${pb.id}/treat`, { action: 'replan' });
ok(r.s === 400, 'traitement sans explication refusé');
const rdv = new Date(Date.now() + 864e5); rdv.setHours(10, 0, 0, 0);
r = await G('POST', `problems/${pb.id}/treat`, { resolution: 'Client rappelé, RDV demain 10h', action: 'replan', rdv_at: rdv.toISOString() });
ok(r.ok && r.action === 'replan', 'traité : nouvelle livraison planifiée', r);
after = await ord(target.id);
ok(after.status === 'attente' && after.rdv_at, 'colis remis « en attente » avec rendez-vous', { s: after.status, rdv: after.rdv_at });
r = await G('POST', `problems/${pb.id}/treat`, { resolution: 'x' });
ok(r.s === 409, 'double traitement refusé');
let hist = await G('GET', 'problems?status=treated');
ok(hist.problems.some(p => p.id === pb.id && p.treated_by_name && p.calls === 2), 'historique : traité par, appels');

console.log('3. Tâches (rendez-vous) et compteur');
let tasks = (await G('GET', 'tasks')).tasks;
const rdvTask = tasks.find(t => t.order_id === target.id && t.type === 'rdv');
ok(rdvTask && rdvTask.due_at, 'tâche de rendez-vous créée automatiquement');
let cnt = await G('GET', 'tasks/count');
ok(cnt.open >= 1, 'compteur de tâches : ' + cnt.open + ' ouverte(s)');
r = await G('POST', 'tasks', { message: '' });
ok(r.s === 400, 'tâche sans message refusée');
r = await G('POST', 'tasks', { ref: after.ref, type: 'rappel', message: 'Rappeler le client à 16h' });
ok(r.id, 'tâche manuelle liée au colis');
r = await G('POST', `tasks/${r.id}/done`, { note: 'Fait' });
ok(r.ok, 'tâche traitée');
ok((await S('GET', 'tasks')).tasks.every(t => t.agency_name === 'Agence Sousse'), 'autre agence : ses seules tâches');
ok((await S('POST', `tasks/${rdvTask.id}/done`, {})).s === 403, 'autre agence : traitement refusé');

console.log('4. Problème signalé par un agent, faux problème');
const L = (await A('GET', 'admin/overview')).orders;
const o2 = L.find(o => o.origin_agency_name === 'Agence Gafsa' && o.status === 'attente');
const o2Att = (await ord(o2.id)).attempts;
r = await G('POST', 'problems', { order_id: o2.id, type: 'rdv' });
ok(r.s === 400, 'rendez-vous sans date refusé');
r = await G('POST', 'problems', { order_id: o2.id, type: 'montant_incorrect', note: 'Le client conteste le montant' });
ok(r.id, 'problème créé par l’agent');
r = await G('POST', `problems/${r.id}/treat`, { resolution: 'Montant vérifié avec la boutique', false_problem: true });
ok(r.ok, 'classé « faux problème »');
ok((await G('GET', 'problems?status=treated&false_problem=1')).problems.some(p => p.order_id === o2.id), 'filtre faux problème');
ok((await ord(o2.id)).attempts === o2Att, 'un problème d’agent n’ajoute pas de tentative');

console.log('5. Signalés, suspects, en souffrance');
r = await G('POST', `orders/${o2.id}/flag`, {});
ok(r.s === 400, 'signalement sans motif refusé');
await G('POST', `orders/${o2.id}/flag`, { reason: 'Adresse douteuse' });
ok((await G('GET', 'parcels/flagged')).parcels.some(p => p.id === o2.id && p.flag_reason === 'Adresse douteuse' && p.flagged_by_name), 'colis signalé (motif, auteur)');
await G('POST', `orders/${o2.id}/unflag`, {});
ok(!(await G('GET', 'parcels/flagged')).parcels.some(p => p.id === o2.id), 'signalement levé');
// a parcel reaching 3 attempts becomes suspect
const o3 = (await G('POST', 'orders', { client_name: 'Test suspect', client_phone: '+216 22 333 222', address: 'Rue des tests 2', dest_city_id: loc.dest_city_id, zone_id: loc.zone_id, cod: 15 })).order;
const d1 = (await G('GET', 'manifests/drivers')).drivers.find(d => d.active);
for (let i = 0; i < 3; i++) {
  await G('POST', `orders/${o3.id}/assign`, { driver_id: d1.id });
  const T = mk(await login(d1.phone.replace(/\D/g, '').slice(-8)));
  await T('POST', `orders/${o3.id}/status`, { status: 'accepte' });
  await T('POST', `orders/${o3.id}/status`, { status: 'numero_incorrect', note: 'Numéro erroné ' + (i + 1) });
  if (i < 2) await G('POST', `orders/${o3.id}/status`, { status: 'attente', note: 'Nouvelle tentative' });
}
const s3 = await ord(o3.id);
ok(s3.attempts === 3, '3 tentatives comptées', s3.attempts);
ok((await G('GET', 'parcels/suspects')).parcels.some(p => p.id === o3.id), 'colis suspect (≥ 3 tentatives)');
ok((await G('GET', 'problems?attempts=3')).problems.some(p => p.order_id === o3.id), 'filtre par tentative');
ok((await G('GET', 'problems')).problems.filter(p => p.order_id === o3.id).length === 1, 'un seul problème ouvert par colis (les précédents sont remplacés)');
const out = await G('GET', 'parcels/outstanding?days=1&driver_days=1');
ok(Array.isArray(out.parcels) && out.parcels.every(p => p.idle_days >= 1), `en souffrance : ${out.parcels.length} colis sans mouvement ≥ 1 jour`);

console.log('6. Permissions');
ok((await SH('GET', 'problems')).s === 403, 'boutique : pas d’accès aux problèmes');
ok((await S('GET', `problems/${pb.id}/calls`)).s === 404, 'autre agence : problème invisible');
ok((await S('POST', `orders/${o2.id}/flag`, { reason: 'x' })).s === 404, 'autre agence : signalement impossible');
ok(!(await S('GET', 'problems?status=all')).problems.some(p => p.id === pb.id), 'autre agence : file filtrée');

console.log('7. Demande d’enlèvement (boutique) → à enlever → enlevé → reçu');
const shopOrder = async name => (await SH('POST', 'orders', { client_name: name, client_phone: '+216 22 444 55' + name.length % 10, address: 'Rue boutique', dest_city_id: loc.dest_city_id, zone_id: loc.zone_id, cod: 30 })).order;
const so1 = await shopOrder('Enl un'), so2 = await shopOrder('Enl deux');
let pr = await SH('POST', 'shop/pickups', { comment: 'Colis prêts au comptoir' });
ok(pr.manifest && /^ENV-/.test(pr.manifest.ref) && pr.parcels >= 2, `demande ${pr.manifest?.ref} : ${pr.parcels} colis`, pr);
ok((await SH('POST', 'shop/pickups', {})).s === 409, 'une seule demande en attente à la fois');
ok((await SH('GET', 'shop/pickups')).pickups.some(x => x.id === pr.manifest.id), 'la boutique suit sa demande');
const env = pr.manifest.id;
ok((await G('POST', `manifests/${env}/validate`)).s === 409, 'validation sans livreur refusée');
await G('PATCH', `manifests/${env}`, { driver_id: dA.id, vehicle_plate: '123 TU 4567' });
r = await G('POST', `manifests/${env}/validate`);
ok(r.stage === 1, 'à enlever (livreur annoncé)');
let x1 = await ord(so1.id);
ok(x1.status === 'affecte' && x1.driver_id === dA.id && !x1.in_stock, 'colis affectés au livreur pour l’enlèvement');
r = await G('POST', `manifests/${env}/collected`);
ok(r.stage === 2, 'enlevé');
r = await G('POST', `manifests/${env}/scan`, { code: so1.ref });
ok(/reçu/.test(r.message || ''), 'scan à l’arrivée : entrée en stock', r);
r = await G('POST', `manifests/${env}/scan`, { code: so1.ref });
ok(r.already, 'double scan ignoré');
x1 = await ord(so1.id);
ok(x1.in_stock && x1.status === 'en_agence' && !x1.driver_id, 'en stock, livreur détaché');
const items = (await G('GET', `manifests/${env}`)).items;
r = await G('POST', `manifests/${env}/close`);
ok(r.stage === 4 && (items.length > 1 ? r.result === 'partiel' : r.result === 'complet'), 'clôture : ' + r.result, r);
const x2 = await ord(so2.id);
ok(x2.status === 'attente' && !x2.driver_id, 'non enlevé → de nouveau « en attente » chez la boutique');
ok((await G('GET', `manifests/${env}`)).manifest.vehicle_plate === '123 TU 4567', 'immatriculation conservée');

console.log('8. Retour à l’expéditeur (restitution)');
await G('POST', 'stock/receive', { code: so2.ref });
await G('POST', `orders/${so2.id}/status`, { status: 'retour', note: 'Retour demandé par la boutique' });
await G('POST', `orders/${so2.id}/status`, { status: 'retour_agence' });
const shopId = (await ord(so2.id)).shop_id;
const rst = (await G('POST', 'manifests', { type: 'restitution', shop_id: shopId })).manifest;
ok(rst && /^RST-/.test(rst.ref), 'bordereau ' + rst?.ref);
r = await G('POST', `manifests/${rst.id}/items`, { refs: [so2.ref, x1.ref] });
ok(r.added.length === 1 && r.errors.length === 1, 'seuls les retours sont restituables', r);
await G('POST', `manifests/${rst.id}/validate`);
r = await G('POST', `manifests/${rst.id}/delivered`, {});
ok(r.s === 400, 'décharge ou signataire obligatoire');
r = await G('POST', `manifests/${rst.id}/delivered`, { signer_name: 'Gérant boutique', signed_doc: 'data:image/png;base64,iVBORw0KGgo=' });
ok(r.stage === 4, 'reçu par l’expéditeur');
const x3 = await ord(so2.id);
ok(x3.status === 'restitue' && !x3.in_stock, 'colis restitué, sorti du stock');
ok((await G('GET', `manifests/${rst.id}/document`)).signed_doc?.startsWith('data:image/png'), 'décharge signée consultable');
ok(!(await G('GET', `manifests/${rst.id}`)).manifest.signed_doc, 'la fiche ne transporte pas le document');
ok((await A('POST', `manifests/${rst.id}/cancel`, { reason: 'x' })).s === 409, 'annulation impossible après remise signée');

console.log('9. Transfert typé, rapport de fin de journée, générer échange');
const sAg = (await A('GET', 'admin/overview')).orders.find(o => o.dest_agency_name === 'Agence Sousse').dest_agency_id;
const tr = (await G('POST', 'manifests', { type: 'transfer', dest_agency_id: sAg, transfer_kind: 'retour', vehicle_plate: '200 TU 1' })).manifest;
const trd = (await G('GET', `manifests/${tr.id}`)).manifest;
ok(trd.transfer_kind === 'retour' && trd.vehicle_plate === '200 TU 1', 'inter-agence : type « retour » et immatriculation');
await G('DELETE', `manifests/${tr.id}`);
const eod = await G('GET', 'reports/end-of-day');
ok(Array.isArray(eod.drivers) && eod.totals && 'cod_collected' in eod.totals, `rapport fin de journée : ${eod.drivers.length} livreur(s) actifs`);
const dRow = eod.drivers.find(d => d.id === dA.id);
ok(dRow && dRow.failed >= 1, 'les échecs du jour du livreur sont comptés', dRow);
r = await G('POST', `orders/${x1.id}/exchange`, { description: 'Taille 42 à reprendre' });
ok(r.pickup?.ref === 'E' + x1.ref, 'échange généré : ' + r.pickup?.ref, r);
r = await G('POST', `orders/${x1.id}/exchange`, {});
ok(r.pickup?.ref === 'E' + x1.ref + '-2', 'deuxième échange : ' + r.pickup?.ref);
ok((await S('POST', `orders/${x1.id}/exchange`, {})).s === 404, 'autre agence : refusé');

console.log(`\n${pass} OK, ${failN} échec(s)`);
process.exit(failN ? 1 : 0);
