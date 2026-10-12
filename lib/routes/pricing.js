// §21 — pricing rules (admin CRUD) and price simulator / quote (staff and shops).
import { route } from '../http.js';
import { one } from '../db.js';
import { fail } from '../auth.js';
import { str, num, int, bool, defaultAgency } from '../domain.js';
import { STAFF } from '../scope.js';
import { computePrice, listRules, PARCEL_TYPES, PAYMENT_MODES } from '../pricing.js';

const CRITERIA = ['agency_id', 'origin_city_id', 'dest_city_id', 'zone_id', 'shop_id', 'parcel_type', 'min_weight', 'max_weight', 'min_km', 'max_km'];

async function parseRule(b, cur = {}) {
  const pick = k => (b[k] !== undefined ? b[k] : cur[k]);
  const r = {
    name: str(pick('name'), 120) || null,
    service: pick('service'),
    agency_id: int(pick('agency_id')) || null,
    origin_city_id: int(pick('origin_city_id')) || null,
    dest_city_id: int(pick('dest_city_id')) || null,
    zone_id: int(pick('zone_id')) || null,
    shop_id: int(pick('shop_id')) || null,
    parcel_type: str(pick('parcel_type'), 40) || null,
    min_weight: num(pick('min_weight')), max_weight: num(pick('max_weight')),
    min_km: num(pick('min_km')), max_km: num(pick('max_km')),
    price: num(pick('price')), driver_share: num(pick('driver_share')) ?? 0, saden_commission: num(pick('saden_commission')) ?? 0,
    priority: int(pick('priority')) ?? 0,
    active: pick('active') === undefined ? true : bool(pick('active')),
  };
  if (!['local', 'intercity'].includes(r.service)) fail(400, 'Service invalide (local ou inter-villes).');
  if (r.price == null || r.price < 0) fail(400, 'Prix invalide.');
  if (r.driver_share < 0 || r.driver_share > r.price) fail(400, 'La part livreur doit être comprise entre 0 et le prix.');
  if (r.saden_commission < 0 || r.saden_commission > 100) fail(400, 'Commission : pourcentage entre 0 et 100.');
  if (r.parcel_type && !PARCEL_TYPES.includes(r.parcel_type)) fail(400, 'Type de colis invalide.');
  for (const [a, z] of [['min_weight', 'max_weight'], ['min_km', 'max_km']])
    if (r[a] != null && r[z] != null && r[a] > r[z]) fail(400, 'Tranche invalide (minimum > maximum).');
  if (r.zone_id) {
    const z = await one(`SELECT city_id FROM zones WHERE id = $1`, [r.zone_id]);
    if (!z) fail(400, 'Zone invalide.');
    if (r.dest_city_id && r.dest_city_id !== z.city_id) fail(400, 'La zone doit appartenir à la ville de destination.');
    r.dest_city_id = z.city_id;
  }
  if (r.shop_id && !(await one(`SELECT id FROM users WHERE id = $1 AND role = 'shop'`, [r.shop_id]))) fail(400, 'Boutique invalide.');
  return r;
}

const isDefault = r => CRITERIA.every(k => r[k] == null);

async function guardDefault(r, id) {
  // a default rule (no criteria) must remain active for each service, otherwise orders could not be priced
  const others = await one(`SELECT count(*)::int AS n FROM pricing_rules WHERE active AND service = $1 AND id <> $2
      AND agency_id IS NULL AND origin_city_id IS NULL AND dest_city_id IS NULL AND zone_id IS NULL AND shop_id IS NULL
      AND parcel_type IS NULL AND min_weight IS NULL AND max_weight IS NULL AND min_km IS NULL AND max_km IS NULL`, [r.service, id]);
  if (others.n === 0) fail(409, 'Une règle par défaut active est obligatoire pour ce service.');
}

const COLS = ['name', 'service', ...CRITERIA, 'price', 'driver_share', 'saden_commission', 'priority', 'active'];

route('GET', '/pricing', STAFF, async () => ({ rules: await listRules(), parcel_types: PARCEL_TYPES, payment_modes: PAYMENT_MODES }));

route('POST', '/pricing', ['admin'], async ({ body }) => {
  const r = await parseRule(body);
  const rule = await one(`INSERT INTO pricing_rules (${COLS.join(', ')}) VALUES (${COLS.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`, COLS.map(k => r[k]));
  return { rule };
});

route('PATCH', '/pricing/:id', ['admin'], async ({ params, body }) => {
  const cur = await one(`SELECT *, price::float8 AS price, driver_share::float8 AS driver_share, saden_commission::float8 AS saden_commission,
                                min_weight::float8 AS min_weight, max_weight::float8 AS max_weight, min_km::float8 AS min_km, max_km::float8 AS max_km
                         FROM pricing_rules WHERE id = $1`, [int(params.id)]);
  if (!cur) fail(404, 'Règle introuvable.');
  const r = await parseRule(body, cur);
  if (isDefault(cur) && (!r.active || !isDefault(r) || r.service !== cur.service)) await guardDefault(cur, cur.id);
  await one(`UPDATE pricing_rules SET ${COLS.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING id`, [cur.id, ...COLS.map(k => r[k])]);
  return { ok: true };
});

/** Quote for an order being entered (order form) or the admin simulator. */
route('POST', '/pricing/simulate', ['admin', 'manager', 'shop'], async ({ body, user }) => {
  const originId = ['shop', 'manager'].includes(user.role) ? user.agency_id : int(body.origin_agency_id) || (await defaultAgency())?.id;
  const origin = await one(`SELECT id, city_id FROM agencies WHERE id = $1`, [originId]);
  if (!origin) fail(400, 'Agence de départ invalide.');
  const destCity = int(body.dest_city_id);
  if (!destCity) fail(400, 'Ville de destination obligatoire.');
  const paymentMode = PAYMENT_MODES.includes(body.payment_mode) ? body.payment_mode : 'cod';
  return computePrice({
    origin_agency_id: origin.id, origin_city_id: origin.city_id, dest_city_id: destCity, zone_id: int(body.zone_id) || null,
    shop_id: user.role === 'shop' ? user.id : int(body.shop_id) || null, weight: num(body.weight), parcel_type: str(body.parcel_type, 40) || null,
    cod: num(body.cod) ?? 0, payment_mode: paymentMode, lat: num(body.lat), lng: num(body.lng),
  });
});
