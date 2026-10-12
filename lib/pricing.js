// §21 — price computation. The most specific active rule matching the order wins; a default rule per service
// (no criteria at all) is mandatory. The result is frozen on the order (delivery_fee, driver_share, saden_revenue…).
import { one, q } from './db.js';
import { fail } from './auth.js';
import { haversine } from './util.js';

export const PAYMENT_MODES = ['cod', 'prepaid', 'sender_pays'];
export const PARCEL_TYPES = ['standard', 'fragile', 'document', 'volumineux', 'alimentaire'];

// Specificity: a rule targeting a shop beats a zone rule, which beats a city rule, etc.
const SPECIFICITY = `(
  (r.shop_id IS NOT NULL)::int * 64 + (r.zone_id IS NOT NULL)::int * 32 + (r.dest_city_id IS NOT NULL)::int * 16 +
  (r.origin_city_id IS NOT NULL)::int * 8 + (r.agency_id IS NOT NULL)::int * 4 + (r.parcel_type IS NOT NULL)::int * 2 +
  (r.min_weight IS NOT NULL OR r.max_weight IS NOT NULL)::int + (r.min_km IS NOT NULL OR r.max_km IS NOT NULL)::int)`;

const r3 = n => Math.round(n * 1000) / 1000;

/** Distance (km) from the origin agency to the destination point (order GPS → zone centre → city centre). */
export async function routeKm({ origin_agency_id, dest_city_id, zone_id, lat, lng }) {
  const [ag, z, c] = await Promise.all([
    one(`SELECT ag.lat, ag.lng, ci.lat AS clat, ci.lng AS clng FROM agencies ag JOIN cities ci ON ci.id = ag.city_id WHERE ag.id = $1`, [origin_agency_id]),
    zone_id ? one(`SELECT lat, lng FROM zones WHERE id = $1`, [zone_id]) : null,
    one(`SELECT lat, lng FROM cities WHERE id = $1`, [dest_city_id]),
  ]);
  const from = ag && (ag.lat != null ? [ag.lat, ag.lng] : ag.clat != null ? [ag.clat, ag.clng] : null);
  const to = lat != null && lng != null ? [lat, lng] : z?.lat != null ? [z.lat, z.lng] : c?.lat != null ? [c.lat, c.lng] : null;
  const km = haversine(from, to);
  return km == null ? null : Math.round(km * 100) / 100;
}

/**
 * computePrice(order) → { rule, service, km, delivery_fee, driver_share, saden_revenue, commission, amount_to_remit }
 * order: { origin_agency_id, origin_city_id, dest_city_id, zone_id, shop_id, weight, parcel_type, cod, payment_mode, lat, lng }
 */
export async function computePrice(o) {
  const service = o.origin_city_id !== o.dest_city_id ? 'intercity' : 'local';
  const km = o.km !== undefined ? o.km : await routeKm(o);
  const rule = await one(
    `SELECT r.*, r.price::float8 AS price, r.driver_share::float8 AS driver_share, r.saden_commission::float8 AS saden_commission, ${SPECIFICITY} AS specificity
     FROM pricing_rules r
     WHERE r.active AND r.service = $1
       AND (r.agency_id IS NULL OR r.agency_id = $2) AND (r.origin_city_id IS NULL OR r.origin_city_id = $3)
       AND (r.dest_city_id IS NULL OR r.dest_city_id = $4) AND (r.zone_id IS NULL OR r.zone_id = $5)
       AND (r.shop_id IS NULL OR r.shop_id = $6) AND (r.parcel_type IS NULL OR r.parcel_type = $7)
       AND (r.min_weight IS NULL OR $8::numeric >= r.min_weight) AND (r.max_weight IS NULL OR $8::numeric <= r.max_weight)
       AND (r.min_km IS NULL OR $9::numeric >= r.min_km) AND (r.max_km IS NULL OR $9::numeric <= r.max_km)
     ORDER BY specificity DESC, r.priority DESC, r.id
     LIMIT 1`,
    [service, o.origin_agency_id ?? null, o.origin_city_id ?? null, o.dest_city_id ?? null, o.zone_id ?? null, o.shop_id ?? null,
     o.parcel_type || null, o.weight ?? null, km]);
  if (!rule) fail(409, `Aucune règle tarifaire ne s’applique (service ${service === 'local' ? 'local' : 'inter-villes'}) : créez une règle par défaut.`);
  const cod = o.payment_mode === 'prepaid' ? 0 : Number(o.cod) || 0;
  const commission = r3(cod * rule.saden_commission / 100);
  const fee = rule.price, driver = Math.min(rule.driver_share, rule.price);
  return {
    rule: { id: rule.id, name: rule.name, specificity: rule.specificity },
    service, km,
    delivery_fee: r3(fee),
    driver_share: r3(driver),
    commission,
    saden_revenue: r3(fee - driver + commission),
    // what the shop receives once the parcel is delivered: COD minus the delivery fee (unless the sender
    // paid it at pickup) minus Saden's COD commission. Negative = the shop owes Saden (prepaid parcels).
    amount_to_remit: r3(cod - (o.payment_mode === 'sender_pays' ? 0 : fee) - commission),
  };
}

export const listRules = () => q(
  `SELECT r.id, r.name, r.agency_id, r.origin_city_id, r.dest_city_id, r.zone_id, r.shop_id, r.service, r.parcel_type,
          r.min_weight::float8 AS min_weight, r.max_weight::float8 AS max_weight, r.min_km::float8 AS min_km, r.max_km::float8 AS max_km,
          r.price::float8 AS price, r.driver_share::float8 AS driver_share, r.saden_commission::float8 AS saden_commission,
          r.priority, r.active, r.created_at, ${SPECIFICITY} AS specificity,
          ag.name AS agency_name, oc.name AS origin_city_name, dc.name AS dest_city_name, z.name AS zone_name, s.shop_name
   FROM pricing_rules r
   LEFT JOIN agencies ag ON ag.id = r.agency_id LEFT JOIN cities oc ON oc.id = r.origin_city_id LEFT JOIN cities dc ON dc.id = r.dest_city_id
   LEFT JOIN zones z ON z.id = r.zone_id LEFT JOIN users s ON s.id = r.shop_id
   ORDER BY r.service, specificity DESC, r.priority DESC, r.id`);
