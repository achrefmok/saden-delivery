// PostgreSQL access. Production (Vercel): DATABASE_URL (Supabase / Neon / any Postgres) → node-postgres pool.
// Local dev without DATABASE_URL (or with DB=local): embedded PGlite (real Postgres in WASM), stored in ./.data.
import { SCHEMA, SCHEMA_VERSION } from './schema.js';

const TZ = process.env.APP_TZ || 'Africa/Tunis';
let conn, ready;
const URL_ = () => (process.env.DB === 'local' ? '' : process.env.DATABASE_URL || process.env.POSTGRES_URL);
export const usingLocalDb = () => !URL_();

async function connect() {
  if (conn) return conn;
  if (URL_()) {
    const { default: pg } = await import('pg');
    // Hosted Postgres (Supabase, Neon) requires TLS; their CA is not in Node's store, so encrypt without
    // chain verification. sslmode is stripped from the URL because it would override the ssl option.
    const raw = URL_();
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(raw);
    const pool = new pg.Pool({
      connectionString: raw.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''),
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
    });
    conn = {
      query: (t, p) => pool.query(t, p),
      exec: t => pool.query(t),
      async transaction(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const out = await fn({ query: (t, p) => c.query(t, p), exec: t => c.query(t) });
          await c.query('COMMIT');
          return out;
        } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
        finally { c.release(); }
      },
      end: () => pool.end(),
    };
  } else {
    if (process.env.VERCEL) throw Object.assign(new Error('Configuration : variable DATABASE_URL manquante sur Vercel.'), { config: true });
    const devOnly = '@electric-sql/pglite'; // variable specifier: not bundled into the Vercel function
    const { PGlite } = await import(devOnly);
    const dir = process.env.PGLITE_DIR || './.data/pglite';
    (await import('node:fs')).mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    await lite.exec(`SET TIME ZONE '${TZ}'`);
    conn = {
      query: (t, p) => lite.query(t, p),
      exec: t => lite.exec(t),
      transaction: fn => lite.transaction(t => fn({ query: (s, p) => t.query(s, p), exec: s => t.exec(s) })),
      end: () => lite.close(),
    };
  }
  return conn;
}

// Schema + data migrations run once per SCHEMA_VERSION, inside a transaction holding an advisory lock,
// so concurrent cold starts on Vercel cannot race each other. Every statement is idempotent.
async function migrate(c) {
  try {
    const r = await c.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [SCHEMA_VERSION]);
    if (r.rows.length) return;
  } catch { /* first run: table does not exist yet */ }
  await c.transaction(async t => {
    await t.query(`SELECT pg_advisory_xact_lock(727274)`);
    await t.exec(SCHEMA);
    await t.query(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING`, [SCHEMA_VERSION]);
  });
}

export async function db() {
  const c = await connect();
  if (!ready) ready = migrate(c).catch(e => { ready = null; throw e; });
  await ready;
  return c;
}

export async function q(text, params = []) {
  const c = await db();
  return (await c.query(text, params)).rows;
}

export async function one(text, params = []) {
  return (await q(text, params))[0] || null;
}

/** Runs fn({ q, one }) in a single transaction. */
export async function tx(fn) {
  const c = await db();
  return c.transaction(t => fn({
    q: async (text, params = []) => (await t.query(text, params)).rows,
    one: async (text, params = []) => (await t.query(text, params)).rows[0] || null,
  }));
}

export async function close() {
  if (conn) await conn.end();
  conn = null; ready = null;
}
