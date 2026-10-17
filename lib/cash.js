// Cash day closing (clôture de caisse): theoretical balance of a day vs. the amount counted by the agency.
// Once a day is closed, no cash entry can be added for that agency on that day (cash module, settlements,
// reversals) until an administrator reopens it — reopenings stay in the history.
import { one } from './db.js';
import { fail } from './auth.js';
import { TZ } from './util.js';

export const DAY = `(now() AT TIME ZONE '${TZ}')::date`;

/** Opening balance, movements and theoretical balance of `day` (YYYY-MM-DD, default today) for an agency. */
export async function dayFigures(agencyId, day) {
  return one(
    `WITH d AS (SELECT coalesce($2::date, ${DAY}) AS day)
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
       coalesce(sum(c.amount) FILTER (WHERE (c.created_at AT TIME ZONE '${TZ}')::date < d.day), 0)::float8 AS opening,
       coalesce(sum(c.amount) FILTER (WHERE (c.created_at AT TIME ZONE '${TZ}')::date = d.day AND c.amount > 0), 0)::float8 AS income,
       coalesce(-sum(c.amount) FILTER (WHERE (c.created_at AT TIME ZONE '${TZ}')::date = d.day AND c.amount < 0), 0)::float8 AS outflow,
       coalesce(sum(c.amount) FILTER (WHERE (c.created_at AT TIME ZONE '${TZ}')::date <= d.day), 0)::float8 AS theoretical,
       count(c.id) FILTER (WHERE (c.created_at AT TIME ZONE '${TZ}')::date = d.day)::int AS movements
     FROM d LEFT JOIN cash_tx c ON c.agency_id = $1 GROUP BY d.day`, [agencyId, day || null]);
}

/** Active (not reopened) closing of an agency for a day. */
export const closingOf = (agencyId, day) => one(
  `SELECT * FROM cash_closings WHERE agency_id = $1 AND day = coalesce($2::date, ${DAY}) AND status <> 'rouverte' ORDER BY id DESC LIMIT 1`, [agencyId, day || null]);

/** Refuses a new cash entry when today's cash of the agency is closed. */
export async function assertCashOpen(agencyId) {
  const c = await closingOf(agencyId, null);
  if (c) fail(409, 'Caisse du jour clôturée : un administrateur doit la rouvrir pour enregistrer un mouvement.');
}
