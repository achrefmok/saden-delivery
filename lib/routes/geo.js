// §1, §5, §6 — governorates → cities → zones, agencies and the zones they serve.
// Everything is data: cities, zones and agencies are added from the admin screens, without code changes.
import { route } from '../http.js';
import { q, one, tx } from '../db.js';
import { fail } from '../auth.js';
import { str, num, int, bool, need } from '../domain.js';
import { ROLES } from '../scope.js';
import { audit } from '../audit.js';

const coord = (v, min, max) => { const n = num(v); if (n == null) return null; if (n < min || n > max) fail(400, 'Coordonnées invalides.'); return n; };

export async function loadGeo() {
  const [governorates, cities, zones, agencies] = await Promise.all([
    q(`SELECT id, name FROM governorates ORDER BY name`),
    q(`SELECT id, governorate_id, name, lat, lng, active FROM cities ORDER BY name`),
    q(`SELECT id, city_id, name, lat, lng, polygon, active FROM zones ORDER BY name`),
    q(`SELECT ag.id, ag.city_id, ag.name, ag.address, ag.phone, ag.lat, ag.lng, ag.manager_id, ag.auto_assign, ag.active,
              m.name AS manager_name,
              coalesce((SELECT array_agg(az.zone_id ORDER BY az.zone_id) FROM agency_zones az WHERE az.agency_id = ag.id), '{}') AS zone_ids
       FROM agencies ag LEFT JOIN users m ON m.id = ag.manager_id ORDER BY ag.name`),
  ]);
  return { governorates, cities, zones, agencies };
}

route('GET', '/geo', ROLES, () => loadGeo());

/** Registers an admin geo route whose result ({ governorate | city | zone | agency }) is written to the audit log. */
const audited = (method, path, roles, entity, fn) => route(method, path, roles, async ctx => {
  const out = await fn(ctx);
  const row = out[entity] || null;
  await audit(ctx, `${entity}.${method === 'POST' ? 'create' : 'update'}`, entity, row?.id ?? ctx.params.id, null, row ? { ...row } : ctx.body);
  return out;
});

/* governorates */
audited('POST', '/geo/governorates', ['admin'], 'governorate', async ({ body }) => {
  const name = need(str(body.name, 80), 'Nom obligatoire.');
  if (await one(`SELECT id FROM governorates WHERE lower(name) = lower($1)`, [name])) fail(409, 'Ce gouvernorat existe déjà.');
  return { governorate: await one(`INSERT INTO governorates (name) VALUES ($1) RETURNING id, name`, [name]) };
});
audited('PATCH', '/geo/governorates/:id', ['admin'], 'governorate', async ({ params, body }) => {
  const g = await one(`UPDATE governorates SET name = $2 WHERE id = $1 RETURNING id, name`, [int(params.id), need(str(body.name, 80), 'Nom obligatoire.')]);
  if (!g) fail(404, 'Gouvernorat introuvable.');
  return { governorate: g };
});

/* cities */
audited('POST', '/geo/cities', ['admin'], 'city', async ({ body }) => {
  const gid = int(body.governorate_id);
  if (!gid || !(await one(`SELECT id FROM governorates WHERE id = $1`, [gid]))) fail(400, 'Gouvernorat invalide.');
  const name = need(str(body.name, 80), 'Nom obligatoire.');
  if (await one(`SELECT id FROM cities WHERE governorate_id = $1 AND lower(name) = lower($2)`, [gid, name])) fail(409, 'Cette ville existe déjà.');
  return { city: await one(`INSERT INTO cities (governorate_id, name, lat, lng) VALUES ($1,$2,$3,$4) RETURNING *`,
    [gid, name, coord(body.lat, -90, 90), coord(body.lng, -180, 180)]) };
});
audited('PATCH', '/geo/cities/:id', ['admin'], 'city', async ({ params, body }) => {
  const c = await one(`SELECT * FROM cities WHERE id = $1`, [int(params.id)]);
  if (!c) fail(404, 'Ville introuvable.');
  const v = {
    name: body.name != null ? need(str(body.name, 80), 'Nom obligatoire.') : c.name,
    governorate_id: body.governorate_id != null ? int(body.governorate_id) : c.governorate_id,
    lat: body.lat !== undefined ? coord(body.lat, -90, 90) : c.lat,
    lng: body.lng !== undefined ? coord(body.lng, -180, 180) : c.lng,
    active: typeof body.active === 'boolean' ? body.active : c.active,
  };
  return { city: await one(`UPDATE cities SET name = $2, governorate_id = $3, lat = $4, lng = $5, active = $6 WHERE id = $1 RETURNING *`,
    [c.id, v.name, v.governorate_id, v.lat, v.lng, v.active]) };
});

/* zones */
audited('POST', '/geo/zones', ['admin'], 'zone', async ({ body }) => {
  const cid = int(body.city_id);
  if (!cid || !(await one(`SELECT id FROM cities WHERE id = $1`, [cid]))) fail(400, 'Ville invalide.');
  const name = need(str(body.name, 80), 'Nom obligatoire.');
  if (await one(`SELECT id FROM zones WHERE city_id = $1 AND lower(name) = lower($2)`, [cid, name])) fail(409, 'Cette zone existe déjà.');
  const z = await one(`INSERT INTO zones (city_id, name, lat, lng, polygon) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [cid, name, coord(body.lat, -90, 90), coord(body.lng, -180, 180), body.polygon ? JSON.stringify(body.polygon) : null]);
  // a new zone is served by the city's agencies unless configured otherwise
  if (body.agency_id) await q(`INSERT INTO agency_zones (agency_id, zone_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [int(body.agency_id), z.id]);
  return { zone: z };
});
audited('PATCH', '/geo/zones/:id', ['admin'], 'zone', async ({ params, body }) => {
  const z = await one(`SELECT * FROM zones WHERE id = $1`, [int(params.id)]);
  if (!z) fail(404, 'Zone introuvable.');
  const v = {
    name: body.name != null ? need(str(body.name, 80), 'Nom obligatoire.') : z.name,
    lat: body.lat !== undefined ? coord(body.lat, -90, 90) : z.lat,
    lng: body.lng !== undefined ? coord(body.lng, -180, 180) : z.lng,
    active: typeof body.active === 'boolean' ? body.active : z.active,
    polygon: body.polygon !== undefined ? (body.polygon ? JSON.stringify(body.polygon) : null) : (z.polygon ? JSON.stringify(z.polygon) : null),
  };
  return { zone: await one(`UPDATE zones SET name = $2, lat = $3, lng = $4, active = $5, polygon = $6 WHERE id = $1 RETURNING *`,
    [z.id, v.name, v.lat, v.lng, v.active, v.polygon]) };
});

/* agencies */
async function saveAgencyZones(t, agencyId, cityId, zoneIds) {
  if (!Array.isArray(zoneIds)) return;
  const ids = [...new Set(zoneIds.map(int).filter(Boolean))];
  const ok = ids.length ? await t.q(`SELECT id FROM zones WHERE city_id = $1 AND id = ANY($2::int[])`, [cityId, ids]) : [];
  if (ok.length !== ids.length) fail(400, 'Zones invalides : elles doivent appartenir à la ville de l’agence.');
  await t.q(`DELETE FROM agency_zones WHERE agency_id = $1`, [agencyId]);
  for (const z of ids) await t.q(`INSERT INTO agency_zones (agency_id, zone_id) VALUES ($1,$2)`, [agencyId, z]);
}

async function checkManager(t, managerId) {
  if (managerId == null) return null;
  const m = await t.one(`SELECT id FROM users WHERE id = $1 AND role = 'manager'`, [managerId]);
  if (!m) fail(400, 'Le responsable doit être un compte « Responsable d’agence ».');
  return m.id;
}

audited('POST', '/agencies', ['admin'], 'agency', async ({ body }) => tx(async t => {
  const cityId = int(body.city_id);
  if (!cityId || !(await t.one(`SELECT id FROM cities WHERE id = $1`, [cityId]))) fail(400, 'Ville invalide.');
  const name = need(str(body.name, 80), 'Nom obligatoire.');
  if (await t.one(`SELECT id FROM agencies WHERE lower(name) = lower($1)`, [name])) fail(409, 'Une agence porte déjà ce nom.');
  const managerId = await checkManager(t, int(body.manager_id));
  const a = await t.one(
    `INSERT INTO agencies (city_id, name, address, phone, lat, lng, manager_id, auto_assign)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [cityId, name, str(body.address) || null, str(body.phone, 30) || null, coord(body.lat, -90, 90), coord(body.lng, -180, 180), managerId, bool(body.auto_assign)]);
  if (managerId) await t.q(`UPDATE users SET agency_id = $1 WHERE id = $2`, [a.id, managerId]);
  await saveAgencyZones(t, a.id, cityId, body.zone_ids || []);
  // parcels already heading to this city without a destination agency are now handled by it
  await t.q(`UPDATE orders SET dest_agency_id = $1 WHERE dest_agency_id IS NULL AND dest_city_id = $2`, [a.id, cityId]);
  return { agency: a };
}));

audited('PATCH', '/agencies/:id', ['admin', 'manager'], 'agency', async ({ params, body, user }) => tx(async t => {
  const a = await t.one(`SELECT * FROM agencies WHERE id = $1`, [int(params.id)]);
  if (!a) fail(404, 'Agence introuvable.');
  if (user.role === 'manager') {
    // a manager may only switch automatic assignment of his own agency
    if (user.agency_id !== a.id) fail(403, 'Hors de votre agence.');
    const keys = Object.keys(body);
    if (keys.some(k => k !== 'auto_assign')) fail(403, 'Seul l’administrateur peut modifier l’agence.');
    return { agency: await t.one(`UPDATE agencies SET auto_assign = $2 WHERE id = $1 RETURNING *`, [a.id, bool(body.auto_assign)]) };
  }
  const cityId = body.city_id != null ? int(body.city_id) : a.city_id;
  if (cityId !== a.city_id && !(await t.one(`SELECT id FROM cities WHERE id = $1`, [cityId]))) fail(400, 'Ville invalide.');
  const managerId = body.manager_id !== undefined ? await checkManager(t, int(body.manager_id)) : a.manager_id;
  const v = {
    name: body.name != null ? need(str(body.name, 80), 'Nom obligatoire.') : a.name,
    address: body.address !== undefined ? str(body.address) || null : a.address,
    phone: body.phone !== undefined ? str(body.phone, 30) || null : a.phone,
    lat: body.lat !== undefined ? coord(body.lat, -90, 90) : a.lat,
    lng: body.lng !== undefined ? coord(body.lng, -180, 180) : a.lng,
    auto_assign: body.auto_assign !== undefined ? bool(body.auto_assign) : a.auto_assign,
    active: typeof body.active === 'boolean' ? body.active : a.active,
  };
  if (v.name !== a.name && await t.one(`SELECT id FROM agencies WHERE lower(name) = lower($1) AND id <> $2`, [v.name, a.id])) fail(409, 'Une agence porte déjà ce nom.');
  const out = await t.one(
    `UPDATE agencies SET city_id = $2, name = $3, address = $4, phone = $5, lat = $6, lng = $7, manager_id = $8, auto_assign = $9, active = $10
     WHERE id = $1 RETURNING *`,
    [a.id, cityId, v.name, v.address, v.phone, v.lat, v.lng, managerId, v.auto_assign, v.active]);
  if (managerId && managerId !== a.manager_id) await t.q(`UPDATE users SET agency_id = $1 WHERE id = $2`, [a.id, managerId]);
  if (body.zone_ids !== undefined) await saveAgencyZones(t, a.id, cityId, body.zone_ids);
  else if (cityId !== a.city_id) await t.q(`DELETE FROM agency_zones WHERE agency_id = $1`, [a.id]);
  return { agency: out };
}));
