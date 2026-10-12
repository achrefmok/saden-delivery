// Single API router: route modules register themselves on import (one Vercel function serves /api/*).
import './routes/auth.js';
import './routes/accounts.js';
import './routes/orders.js';
import './routes/manifests.js';
import './routes/finance.js';
import './routes/claims.js';
import './routes/stats.js';
import './routes/driver.js';
import './routes/shop.js';
import './routes/track.js';

export { handle } from './http.js';
