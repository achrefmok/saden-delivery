// PostgreSQL access. Production (Vercel): DATABASE_URL → node-postgres pool.
// Local dev without DATABASE_URL: embedded PGlite (real Postgres in WASM), stored in ./.data.
import { SCHEMA } from './schema.js';

const TZ = process.env.APP_TZ || 'Africa/Tunis';
let conn, ready;
const URL_ = () => process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function connect() {
  if (conn) return conn;
  if (URL_()) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: URL_(),
      max: 3,
    });
    conn = { query: (t, p) => pool.query(t, p), exec: t => pool.query(t), end: () => pool.end() };
  } else {
    if (process.env.VERCEL) throw new Error('DATABASE_URL manquant (Vercel → Storage → Postgres).');
    const devOnly = '@electric-sql/pglite'; // variable specifier: not bundled into the Vercel function
    const { PGlite } = await import(devOnly);
    const dir = process.env.PGLITE_DIR || './.data/pglite';
    (await import('node:fs')).mkdirSync(dir, { recursive: true });
    const lite = new PGlite(dir);
    await lite.exec(`SET TIME ZONE '${TZ}'`);
    conn = { query: (t, p) => lite.query(t, p), exec: t => lite.exec(t), end: () => lite.close() };
  }
  return conn;
}

export async function db() {
  const c = await connect();
  if (!ready) ready = c.exec(SCHEMA).catch(e => { ready = null; throw e; });
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

export async function close() {
  if (conn) await conn.end();
  conn = null; ready = null;
}
