// §14 — smart assignment: ranks the active drivers of the agency handling the parcel.
// Score = availability + distance (fresh GPS only) + same zone + current load + vehicle suited to weight/type.
import { q, one } from './db.js';
import { haversine } from './util.js';
import { ACTIVE, changeStatus } from './status.js';

const STALE_MIN = 15;

/** Agency responsible for the parcel now: destination agency once an inter-city parcel arrived there. */
export const handlingAgencyOf = o =>
  o.origin_city_id !== o.dest_city_id && (['transit', 'arrive'].includes(o.status) || (o.current_agency_id && o.current_agency_id === o.dest_agency_id))
    ? o.dest_agency_id : o.origin_agency_id;

function vehicleScore(vehicle, weight, type) {
  const v = String(vehicle || '').toLowerCase();
  const heavy = (weight ?? 0) > 20 || type === 'volumineux', medium = (weight ?? 0) > 5;
  if (heavy) return /voiture|camion/.test(v) ? 15 : /moto/.test(v) ? -10 : /scooter/.test(v) ? -15 : /v[ée]lo/.test(v) ? -30 : 0;
  if (medium) return /moto|voiture|camion/.test(v) ? 5 : /v[ée]lo/.test(v) ? -15 : 0;
  return /v[ée]lo|scooter|moto/.test(v) ? 5 : 0;
}

export async function rankCandidates(order) {
  const agencyId = handlingAgencyOf(order);
  const target = order.lat != null ? [order.lat, order.lng]
    : await one(`SELECT z.lat, z.lng FROM zones z WHERE z.id = $1 AND z.lat IS NOT NULL`, [order.zone_id]).then(z => z ? [z.lat, z.lng] : null)
      ?? await one(`SELECT lat, lng FROM cities WHERE id = $1 AND lat IS NOT NULL`, [order.dest_city_id]).then(c => c ? [c.lat, c.lng] : null);
  const drivers = await q(
    `SELECT u.id, u.name, u.status, u.vehicle, u.zone_id, z.name AS zone_name, u.lat, u.lng, u.last_seen,
            (u.last_seen IS NULL OR u.last_seen < now() - interval '${STALE_MIN} minutes') AS stale,
            (SELECT count(*) FROM orders o WHERE o.driver_id = u.id AND o.status = ANY($2::text[]))::int AS active_count
     FROM users u LEFT JOIN zones z ON z.id = u.zone_id
     WHERE u.role = 'driver' AND u.active AND u.agency_id = $1 AND u.status <> 'off'`, [agencyId, ACTIVE]);
  const weight = order.weight == null ? null : Number(order.weight);
  const ranked = drivers.map(d => {
    const km = !d.stale && d.lat != null && target ? haversine([d.lat, d.lng], target) : null;
    const b = {
      availability: d.status === 'dispo' ? 30 : d.status === 'livraison' ? 10 : -40,
      distance: km == null ? 0 : Math.max(0, Math.round(30 - 4 * km)),
      zone: order.zone_id && d.zone_id === order.zone_id ? 15 : 0,
      load: -8 * d.active_count,
      vehicle: vehicleScore(d.vehicle, weight, order.parcel_type),
    };
    return {
      id: d.id, name: d.name, status: d.status, vehicle: d.vehicle, zone_name: d.zone_name, active_count: d.active_count,
      km: km == null ? null : Math.round(km * 10) / 10, stale: d.stale, last_seen: d.last_seen,
      score: Object.values(b).reduce((a, x) => a + x, 0), breakdown: b,
    };
  }).sort((a, b) => b.score - a.score || (a.km ?? 99) - (b.km ?? 99));
  const best = ranked.find(c => c.status !== 'pause');
  return { agency_id: agencyId, candidates: ranked, recommended: best?.id || null };
}

/** Automatic mode: assigns the best candidate when the agency enabled auto_assign. Returns the driver or null. */
export async function autoAssign(orderId) {
  const o = await one(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!o || !['attente', 'en_agence', 'arrive'].includes(o.status)) return null;
  const ag = await one(`SELECT auto_assign FROM agencies WHERE id = $1`, [handlingAgencyOf(o)]);
  if (!ag?.auto_assign) return null;
  // inter-city parcels are delivered by the destination agency: wait for their arrival there
  if (o.origin_city_id !== o.dest_city_id && o.status !== 'arrive') return null;
  const { candidates } = await rankCandidates(o);
  const best = candidates.find(c => ['dispo', 'livraison'].includes(c.status) && c.score > 0);
  if (!best) return null;
  await changeStatus(o, 'affecte', { system: true, driver: { id: best.id, name: best.name }, actor: `Affectation automatique → ${best.name}` });
  return best;
}
