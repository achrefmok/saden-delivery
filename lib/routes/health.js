// Diagnostic for preview / test deployments: which database would this deployment use?
// Reads the environment variable only — never opens a connection, so it never triggers a migration.
// Returns the host and the Supabase project id (never the user password); disabled in production.
import { route } from '../http.js';
import { fail } from '../auth.js';

route('GET', '/health/db-target', null, async () => {
  if (process.env.VERCEL_ENV === 'production') fail(404, 'Route inconnue.');
  const raw = process.env.DB === 'local' ? '' : process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  let target = null;
  try {
    const u = new URL(raw);
    const ref = u.username.match(/^postgres\.([a-z0-9]+)$/)?.[1] || u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] || null;
    target = { host: u.hostname, port: u.port || null, project_ref: ref };
  } catch { /* not configured or malformed */ }
  return { env: process.env.VERCEL_ENV || 'local', configured: !!raw, source: process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.POSTGRES_URL ? 'POSTGRES_URL' : null, target };
});
