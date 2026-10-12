// Local dev server: static files from ./public + the same API handler Vercel runs.
// Without DATABASE_URL it uses the embedded PGlite database in ./.data.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

try { process.loadEnvFile('.env'); } catch {}
const { handle } = await import('../lib/api.js');

const PORT = Number(process.env.PORT || 3000);
const ROOT = join(process.cwd(), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/api' || pathname.startsWith('/api/')) return handle(req, res);
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(ROOT, 'index.html'); }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(PORT, () => {
  console.log(`SADEN → http://localhost:${PORT}  (${process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'PostgreSQL' : 'PGlite local ./.data'})`);
});
