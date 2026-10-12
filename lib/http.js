// Route registry + HTTP entry point (one Vercel function serves every /api/* route).
import { fail, HttpError, currentUser } from './auth.js';
import { clientIp } from './util.js';

const routes = [];
let partnerAuth = null; // set by routes/v1.js (keeps this module free of partner logic)

/**
 * route(method, path, access, fn)
 *   access: null → public · ['admin', …] → JWT user with one of these roles · 'partner' → API key
 *   fn(ctx) receives { req, body, query, params, user, partner, ip }
 */
export const route = (method, path, access, fn) => routes.push({
  method, access, fn, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'),
});
export const setPartnerAuth = fn => { partnerAuth = fn; };

const REPLY = Symbol('reply');
/** Custom status / headers: return reply(201, data, { 'X-Foo': 'bar' }) from a handler. */
export const reply = (status, data, headers = {}) => ({ [REPLY]: true, status, data, headers });

async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 5_000_000) fail(413, 'Requête trop volumineuse.'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://local');
    const raw = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
    url.searchParams.delete('__path');
    const path = '/' + raw.replace(/^\/+|\/+$/g, '');
    const method = req.method.toUpperCase();
    let match = null, allowed = false;
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      allowed = true;
      if (r.method === method) { match = { r, params: m.groups || {} }; break; }
    }
    if (!match) fail(allowed ? 405 : 404, 'Route inconnue.');
    const ip = clientIp(req);
    let user = null, partner = null;
    if (match.r.access === 'partner') {
      partner = await partnerAuth(req, ip);
    } else if (match.r.access) {
      user = await currentUser(req);
      if (!user) fail(401, 'Session expirée, reconnectez-vous.');
      if (!match.r.access.includes(user.role)) fail(403, 'Accès refusé.');
    }
    const query = Object.fromEntries(url.searchParams);
    let body = {};
    if (method !== 'GET') {
      try { body = await readJson(req); } catch (e) { if (e instanceof HttpError) throw e; fail(400, 'JSON invalide.'); }
    }
    const out = await match.r.fn({ req, body, query, params: match.params, user, partner, ip });
    if (out && out[REPLY]) return send(res, out.status, out.data, out.headers);
    send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    console.error(e);
    // Missing env vars are reported as-is (no secret involved); connection failures get a hint, never the URL.
    if (e.config) return send(res, 500, { error: e.message });
    const m = `${e.code || ''} ${e.message || ''}`;
    const why = /password authentication/i.test(m) ? 'mot de passe refusé'
      : /Tenant or user not found/i.test(m) ? 'utilisateur inconnu (il doit être postgres.<id-projet>)'
      : /ENOTFOUND|EAI_AGAIN/i.test(m) ? 'adresse du serveur introuvable'
      : /ETIMEDOUT|ECONNREFUSED|ENETUNREACH|timeout/i.test(m) ? 'serveur injoignable (utilisez le Transaction pooler, port 6543)'
      : /Invalid URL|invalid connection|getaddrinfo|URI/i.test(m) ? 'adresse DATABASE_URL mal formée'
      : /SSL|certificate/i.test(m) ? 'erreur SSL' : null;
    if (why) return send(res, 500, { error: `Connexion à la base impossible : ${why}. Vérifiez DATABASE_URL.` });
    send(res, 500, { error: 'Erreur serveur.' });
  }
}
