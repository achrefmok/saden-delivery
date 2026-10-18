// Idempotent schema + data migrations. Executed once per SCHEMA_VERSION (see db.js migrate()).
// Bump SCHEMA_VERSION whenever this file changes.
export const SCHEMA_VERSION = '2026-10-18.fleet';

const BASE = `
CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('admin','driver','shop')),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  zone          TEXT,
  vehicle       TEXT,
  shop_name     TEXT,
  address       TEXT,
  status        TEXT NOT NULL DEFAULT 'off',
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  battery       INT,
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

CREATE SEQUENCE IF NOT EXISTS order_ref_seq START 24100;
CREATE SEQUENCE IF NOT EXISTS manifest_ref_seq START 100;

CREATE TABLE IF NOT EXISTS manifests (
  id          SERIAL PRIMARY KEY,
  ref         TEXT NOT NULL UNIQUE,
  from_city   TEXT NOT NULL,
  to_city     TEXT NOT NULL,
  carrier     TEXT,
  responsible TEXT,
  stage       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  ref          TEXT NOT NULL UNIQUE,
  shop_id      INT REFERENCES users(id),
  client_name  TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  zone         TEXT,
  address      TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  dest_city    TEXT,
  cod          NUMERIC(12,3) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'attente',
  driver_id    INT REFERENCES users(id),
  manifest_id  INT REFERENCES manifests(id),
  otp          TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_driver_idx ON orders(driver_id);
CREATE INDEX IF NOT EXISTS orders_shop_idx ON orders(shop_id);

CREATE TABLE IF NOT EXISTS order_events (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  actor      TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  proof_type TEXT,
  proof      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id);
CREATE INDEX IF NOT EXISTS order_events_status_idx ON order_events(status, created_at);

CREATE TABLE IF NOT EXISTS cash_tx (
  id         SERIAL PRIMARY KEY,
  label      TEXT NOT NULL,
  type       TEXT NOT NULL,
  amount     NUMERIC(12,3) NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  driver_id  INT REFERENCES users(id),
  stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id  INT REFERENCES users(id),
  category   INT NOT NULL,
  text       TEXT,
  status     INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supabase exposes the public schema through its REST API (anon key). Row Level Security with no
-- policies blocks that API entirely; the app connects as the table owner, which bypasses RLS.
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_tx      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims       ENABLE ROW LEVEL SECURITY;
`;

// §1, §5, §6, §7 — governorates / cities / zones / agencies, agency manager role, per-agency scope.
// Existing data (users, orders, bordereaux, cash) is attached to a default « Agence Gafsa ».
const GEO = `
CREATE TABLE IF NOT EXISTS governorates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cities (
  id             SERIAL PRIMARY KEY,
  governorate_id INT NOT NULL REFERENCES governorates(id),
  name           TEXT NOT NULL,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (governorate_id, name)
);
CREATE TABLE IF NOT EXISTS zones (
  id         SERIAL PRIMARY KEY,
  city_id    INT NOT NULL REFERENCES cities(id),
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  polygon    JSONB,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (city_id, name)
);
CREATE TABLE IF NOT EXISTS agencies (
  id          SERIAL PRIMARY KEY,
  city_id     INT NOT NULL REFERENCES cities(id),
  name        TEXT NOT NULL UNIQUE,
  address     TEXT,
  phone       TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  manager_id  INT REFERENCES users(id) ON DELETE SET NULL,
  auto_assign BOOLEAN NOT NULL DEFAULT FALSE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agency_zones (
  agency_id INT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  zone_id   INT NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (agency_id, zone_id)
);

-- roles: admin (super admin), manager (responsable d'agence), driver, shop — validated by the API
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_id INT REFERENCES agencies(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS zone_id INT REFERENCES zones(id);
CREATE INDEX IF NOT EXISTS users_agency_idx ON users(agency_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS origin_agency_id INT REFERENCES agencies(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dest_agency_id INT REFERENCES agencies(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS origin_city_id INT REFERENCES cities(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dest_city_id INT REFERENCES cities(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS zone_id INT REFERENCES zones(id);
CREATE INDEX IF NOT EXISTS orders_origin_agency_idx ON orders(origin_agency_id);
CREATE INDEX IF NOT EXISTS orders_dest_agency_idx ON orders(dest_agency_id);

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS origin_agency_id INT REFERENCES agencies(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS dest_agency_id INT REFERENCES agencies(id);
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS agency_id INT REFERENCES agencies(id);

ALTER TABLE governorates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_zones ENABLE ROW LEVEL SECURITY;

DO $mig$
DECLARE g INT; c INT; a INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM agencies) THEN
    INSERT INTO governorates (name) VALUES ('Gafsa') ON CONFLICT (name) DO NOTHING;
    SELECT id INTO g FROM governorates WHERE name = 'Gafsa';
    INSERT INTO cities (governorate_id, name, lat, lng) VALUES (g, 'Gafsa', 34.4250, 8.7842) ON CONFLICT (governorate_id, name) DO NOTHING;
    SELECT id INTO c FROM cities WHERE governorate_id = g AND name = 'Gafsa';
    INSERT INTO agencies (city_id, name, lat, lng) VALUES (c, 'Agence Gafsa', 34.4250, 8.7842);
  END IF;
  SELECT id, city_id INTO a, c FROM agencies ORDER BY id LIMIT 1;

  -- legacy free-text zones become zones of the default city, served by the default agency
  INSERT INTO zones (city_id, name)
    SELECT DISTINCT c, z FROM (
      SELECT zone AS z FROM users WHERE zone IS NOT NULL AND zone_id IS NULL
      UNION SELECT zone FROM orders WHERE zone IS NOT NULL AND zone_id IS NULL AND dest_city IS NULL) t
    WHERE z <> ''
    ON CONFLICT (city_id, name) DO NOTHING;
  INSERT INTO agency_zones (agency_id, zone_id) SELECT a, id FROM zones WHERE city_id = c ON CONFLICT DO NOTHING;
  UPDATE users u SET zone_id = z.id FROM zones z WHERE u.zone_id IS NULL AND u.zone IS NOT NULL AND z.city_id = c AND z.name = u.zone;
  UPDATE users SET agency_id = a WHERE agency_id IS NULL AND role IN ('driver', 'shop', 'manager');

  -- legacy free-text destination cities (inter-city parcels)
  INSERT INTO governorates (name)
    SELECT DISTINCT dest_city FROM orders WHERE dest_city IS NOT NULL AND dest_city_id IS NULL ON CONFLICT (name) DO NOTHING;
  INSERT INTO cities (governorate_id, name)
    SELECT DISTINCT gv.id, o.dest_city FROM orders o JOIN governorates gv ON gv.name = o.dest_city
    WHERE o.dest_city IS NOT NULL AND o.dest_city_id IS NULL ON CONFLICT (governorate_id, name) DO NOTHING;
  UPDATE orders o SET dest_city_id = ci.id FROM cities ci WHERE o.dest_city_id IS NULL AND o.dest_city IS NOT NULL AND ci.name = o.dest_city;

  UPDATE orders SET origin_agency_id = a WHERE origin_agency_id IS NULL;
  UPDATE orders SET origin_city_id = c WHERE origin_city_id IS NULL;
  UPDATE orders SET dest_city_id = c WHERE dest_city_id IS NULL;
  UPDATE orders o SET zone_id = z.id FROM zones z WHERE o.zone_id IS NULL AND o.zone IS NOT NULL AND z.city_id = o.dest_city_id AND z.name = o.zone;
  UPDATE orders o SET dest_agency_id = ag.id FROM agencies ag WHERE o.dest_agency_id IS NULL AND ag.city_id = o.dest_city_id;

  UPDATE manifests SET origin_agency_id = a WHERE origin_agency_id IS NULL;
  UPDATE manifests m SET dest_agency_id = ag.id FROM agencies ag JOIN cities ci ON ci.id = ag.city_id
    WHERE m.dest_agency_id IS NULL AND ci.name = m.to_city;
  UPDATE cash_tx SET agency_id = a WHERE agency_id IS NULL;
END
$mig$;
`;

// §21 — configurable pricing. Amounts are computed at order creation and frozen on the order.
// DELIVERY_FEE / DRIVER_SHARE / INTERCITY_FEE env vars are only used as starting values for the default rules.
const PRICING = `
CREATE TABLE IF NOT EXISTS pricing_rules (
  id               SERIAL PRIMARY KEY,
  name             TEXT,
  agency_id        INT REFERENCES agencies(id),
  origin_city_id   INT REFERENCES cities(id),
  dest_city_id     INT REFERENCES cities(id),
  zone_id          INT REFERENCES zones(id),
  shop_id          INT REFERENCES users(id),
  service          TEXT NOT NULL CHECK (service IN ('local', 'intercity')),
  parcel_type      TEXT,
  min_weight       NUMERIC(8,2),
  max_weight       NUMERIC(8,2),
  min_km           NUMERIC(8,2),
  max_km           NUMERIC(8,2),
  price            NUMERIC(12,3) NOT NULL CHECK (price >= 0),
  driver_share     NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (driver_share >= 0),
  saden_commission NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (saden_commission >= 0),
  priority         INT NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_mode    TEXT NOT NULL DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS weight          NUMERIC(8,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_type     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS distance_km     NUMERIC(8,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee    NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_share    NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS saden_revenue   NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_to_remit NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_rule_id INT REFERENCES pricing_rules(id);

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_rules WHERE service = 'local' AND agency_id IS NULL AND origin_city_id IS NULL AND dest_city_id IS NULL
                   AND zone_id IS NULL AND shop_id IS NULL AND parcel_type IS NULL AND min_weight IS NULL AND max_weight IS NULL AND min_km IS NULL AND max_km IS NULL) THEN
    INSERT INTO pricing_rules (name, service, price, driver_share) VALUES ('Tarif par défaut — local', 'local', __LOCAL_FEE__, __DRIVER_SHARE__);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pricing_rules WHERE service = 'intercity' AND agency_id IS NULL AND origin_city_id IS NULL AND dest_city_id IS NULL
                   AND zone_id IS NULL AND shop_id IS NULL AND parcel_type IS NULL AND min_weight IS NULL AND max_weight IS NULL AND min_km IS NULL AND max_km IS NULL) THEN
    INSERT INTO pricing_rules (name, service, price, driver_share) VALUES ('Tarif par défaut — inter-villes', 'intercity', __INTER_FEE__, __DRIVER_SHARE__);
  END IF;
  -- orders created before configurable pricing get the default amounts (stats and cash stay continuous)
  UPDATE orders o SET pricing_rule_id = r.id, delivery_fee = r.price, driver_share = r.driver_share,
                      saden_revenue = r.price - r.driver_share, amount_to_remit = o.cod - r.price
    FROM pricing_rules r
   WHERE o.pricing_rule_id IS NULL AND o.delivery_fee = 0 AND r.name = CASE WHEN o.origin_city_id IS DISTINCT FROM o.dest_city_id
         THEN 'Tarif par défaut — inter-villes' ELSE 'Tarif par défaut — local' END;
END
$mig$;
`;
const money = (v, d) => { const n = Number(v); return (Number.isFinite(n) && n >= 0 ? n : d).toFixed(3); };
const PRICING_SQL = PRICING
  .replaceAll('__LOCAL_FEE__', money(process.env.DELIVERY_FEE, 7))
  .replaceAll('__INTER_FEE__', money(process.env.INTERCITY_FEE, 10))
  .replaceAll('__DRIVER_SHARE__', money(process.env.DRIVER_SHARE, 2));

// §8, §22 — complete parcel record.
const PARCEL = `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sender_name    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sender_phone   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sender_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_ref   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pieces         INT NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS orders_external_ref_idx ON orders (external_ref);
CREATE INDEX IF NOT EXISTS orders_client_phone_idx ON orders (client_phone);

-- existing orders: sender = their shop, source = shop when the first event was written by the shop
UPDATE orders o SET sender_name = s.shop_name, sender_phone = s.phone, sender_address = s.address
  FROM users s WHERE s.id = o.shop_id AND o.sender_name IS NULL;
UPDATE orders o SET source = 'shop' WHERE o.source = 'manual' AND EXISTS (
  SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.status = 'cree' AND e.actor ILIKE '%boutique%');
`;

// §11, §30 — status machine history: who changed what, from which status, and why.
const STATUS = `
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS old_status TEXT;
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS user_id    INT REFERENCES users(id);
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS note       TEXT;
-- previous status of historical events, reconstructed from the order's own timeline
UPDATE order_events e SET old_status = p.status
  FROM (SELECT id, lag(status) OVER (PARTITION BY order_id ORDER BY created_at, id) AS status FROM order_events) p
 WHERE p.id = e.id AND e.old_status IS NULL AND p.status IS NOT NULL;
`;

// §9, §29 — physical location of parcels (scans) and the audit log written by every sensitive action.
const SCAN = `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_agency_id INT REFERENCES agencies(id);
CREATE INDEX IF NOT EXISTS orders_current_agency_idx ON orders(current_agency_id);
UPDATE orders SET current_agency_id = origin_agency_id
 WHERE current_agency_id IS NULL AND status IN ('en_agence', 'retour_agence');
UPDATE orders SET current_agency_id = dest_agency_id
 WHERE current_agency_id IS NULL AND status = 'arrive';

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  before     JSONB,
  after      JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
`;

// §10 — bordereaux: manual composition, one active bordereau per parcel, parcel-by-parcel reception.
// stage: 0 brouillon · 1 validé · 2 en transit · 3 arrivé · 4 clôturé
const MANIFESTS = `
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS driver_id    INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS created_by   INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS shipped_at   TIMESTAMPTZ;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS arrived_at   TIMESTAMPTZ;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS closed_at    TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS manifest_items (
  manifest_id INT NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  order_id    INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  added_by    INT REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  loaded_at   TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_by INT REFERENCES users(id),
  PRIMARY KEY (manifest_id, order_id)
);
CREATE INDEX IF NOT EXISTS manifest_items_order_idx ON manifest_items(order_id);
ALTER TABLE manifest_items ENABLE ROW LEVEL SECURITY;
-- existing bordereaux: their parcels become items (received when the bordereau already arrived)
INSERT INTO manifest_items (manifest_id, order_id, added_at, received_at)
  SELECT o.manifest_id, o.id, m.created_at, CASE WHEN m.stage >= 3 THEN m.created_at END
  FROM orders o JOIN manifests m ON m.id = o.manifest_id
  ON CONFLICT DO NOTHING;
`;

// §19, §20 — partner API (Gafsa Mall…): hashed keys, idempotent orders, products, signed webhooks.
const PARTNERS = `
CREATE TABLE IF NOT EXISTS api_partners (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  key_prefix     TEXT NOT NULL UNIQUE,
  key_hash       TEXT NOT NULL,
  shop_id        INT REFERENCES users(id),
  agency_id      INT NOT NULL REFERENCES agencies(id),
  webhook_url    TEXT,
  webhook_secret TEXT,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS partner_id  INT REFERENCES api_partners(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS goods_value NUMERIC(12,3);
CREATE UNIQUE INDEX IF NOT EXISTS orders_partner_external_ref_key ON orders (partner_id, external_ref)
  WHERE partner_id IS NOT NULL AND external_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS order_items (
  id       SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  qty      INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  price    NUMERIC(12,3)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  partner_id INT NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  order_id   INT REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, key)
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  partner_id      INT NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  order_id        INT REFERENCES orders(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  last_status     INT,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries (status, next_attempt_at);
ALTER TABLE api_partners       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
`;

// §22, §23 — cash per agency: drivers' COD remittances, shop settlements, inter-agency transfers (two linked entries).
const CASH = `
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS driver_id             INT REFERENCES users(id);
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS shop_id               INT REFERENCES users(id);
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS order_id              INT REFERENCES orders(id);
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS counterpart_agency_id INT REFERENCES agencies(id);
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS link_id               INT;
CREATE INDEX IF NOT EXISTS cash_tx_agency_idx ON cash_tx (agency_id, created_at);
CREATE INDEX IF NOT EXISTS cash_tx_driver_idx ON cash_tx (driver_id);
CREATE INDEX IF NOT EXISTS cash_tx_shop_idx ON cash_tx (shop_id);
`;

// §12 — explicit GPS consent of drivers.
const GPS = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_consent_at TIMESTAMPTZ;
`;

// §27 — claims: explicit status changes (no wrap-around), internal note, processing history.
const CLAIMS = `
ALTER TABLE claims ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS claim_events (
  id         SERIAL PRIMARY KEY,
  claim_id   INT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id),
  old_status INT,
  new_status INT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claim_events_claim_idx ON claim_events(claim_id);
ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY;
`;

// §29 — attempt limits shared by every serverless instance (login, public tracking, API keys).
const SECURITY = `
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
`;

// §25 — in-app notifications (Phase 1); push / SMS / WhatsApp / e-mail channels plug into notify() later.
const NOTIFICATIONS = `
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  order_id   INT REFERENCES orders(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
`;

// Stock per agency + professional bordereaux (mission « Logo, entrée en stock, bordereaux »).
//   orders.in_stock + current_agency_id = physical presence; every entry / exit writes stock_movements.
//   manifests.type: transfer (inter-agences, existing rows) · dispatch (expédition) · return · exchange · call · inventory · settlement
const STOCK = `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'delivery';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS related_order_id INT REFERENCES orders(id);
CREATE INDEX IF NOT EXISTS orders_stock_idx ON orders (current_agency_id) WHERE in_stock;

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS type          TEXT NOT NULL DEFAULT 'transfer';
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS shop_id       INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS period_from   DATE;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS period_to     DATE;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS comment       TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS result        TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS reserves      TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS totals        JSONB;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cash_tx_id    INT REFERENCES cash_tx(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS handed_at     TIMESTAMPTZ;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS closed_by     INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS validated_by  INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cancelled_by  INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
CREATE INDEX IF NOT EXISTS manifests_type_idx ON manifests (type, stage);

ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS role         TEXT NOT NULL DEFAULT 'item';
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS reason       TEXT;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS comment      TEXT;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS phone        TEXT;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS call_result  TEXT;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS called_at    TIMESTAMPTZ;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS called_by    INT REFERENCES users(id);
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS expected     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS scanned_at   TIMESTAMPTZ;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS anomaly      TEXT;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS result       TEXT;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS amount       NUMERIC(12,3);
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE manifest_items ADD COLUMN IF NOT EXISTS confirmed_by INT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id          BIGSERIAL PRIMARY KEY,
  order_id    INT NOT NULL REFERENCES orders(id),
  agency_id   INT NOT NULL REFERENCES agencies(id),
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  reason      TEXT NOT NULL,
  manifest_id INT REFERENCES manifests(id) ON DELETE SET NULL,
  user_id     INT REFERENCES users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_order_idx ON stock_movements (order_id, created_at);
CREATE INDEX IF NOT EXISTS stock_movements_agency_idx ON stock_movements (agency_id, created_at);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS stock_anomalies (
  id          SERIAL PRIMARY KEY,
  agency_id   INT NOT NULL REFERENCES agencies(id),
  order_id    INT REFERENCES orders(id),
  code        TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('manquant','supplementaire','endommage','inconnu','autre')),
  source      TEXT NOT NULL,
  manifest_id INT REFERENCES manifests(id) ON DELETE SET NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution  TEXT,
  corrected   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by INT REFERENCES users(id),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stock_anomalies_agency_idx ON stock_anomalies (agency_id, status);
ALTER TABLE stock_anomalies ENABLE ROW LEVEL SECURITY;

ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS manifest_id INT REFERENCES manifests(id);

-- existing parcels physically inside an agency are in stock (no movement row: initial state)
UPDATE orders SET in_stock = TRUE
  WHERE NOT in_stock AND current_agency_id IS NOT NULL AND status IN ('en_agence','arrive','retour_agence','endommage');
`;

// Operations follow-up (JAX parity): delivery attempts, parcel problems queue, tasks, flagged parcels.
const OPS = `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attempts    INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flagged_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flagged_by  INT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rdv_at      TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS parcel_problems (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id),
  agency_id     INT REFERENCES agencies(id),
  type          TEXT NOT NULL,
  note          TEXT,
  attempt       INT NOT NULL DEFAULT 0,
  driver_id     INT REFERENCES users(id),
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  rdv_at        TIMESTAMPTZ,
  calls         INT NOT NULL DEFAULT 0,
  last_call_at  TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','treated')),
  false_problem BOOLEAN NOT NULL DEFAULT FALSE,
  resolution    TEXT,
  treated_by    INT REFERENCES users(id),
  treated_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS parcel_problems_agency_idx ON parcel_problems (agency_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS parcel_problems_order_idx ON parcel_problems (order_id);
ALTER TABLE parcel_problems ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS problem_calls (
  id         SERIAL PRIMARY KEY,
  problem_id INT NOT NULL REFERENCES parcel_problems(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id),
  outcome    TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE problem_calls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  agency_id   INT REFERENCES agencies(id),
  order_id    INT REFERENCES orders(id),
  problem_id  INT REFERENCES parcel_problems(id),
  type        TEXT NOT NULL DEFAULT 'autre',
  message     TEXT NOT NULL,
  due_at      TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_by     INT REFERENCES users(id),
  done_at     TIMESTAMPTZ,
  done_note   TEXT
);
CREATE INDEX IF NOT EXISTS tasks_agency_idx ON tasks (agency_id, status, due_at);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- existing history: one attempt per delivery failure already recorded
UPDATE orders o SET attempts = x.n FROM (
  SELECT order_id, count(*)::int AS n FROM order_events
  WHERE status IN ('absent','refuse','reporte','numero_incorrect','adresse_incorrecte') GROUP BY order_id) x
WHERE x.order_id = o.id AND o.attempts = 0;
-- parcels currently in incident get an open problem (once)
INSERT INTO parcel_problems (order_id, agency_id, type, note, attempt, driver_id, created_at)
SELECT o.id, coalesce(d.agency_id, o.current_agency_id, o.dest_agency_id, o.origin_agency_id),
       CASE o.status WHEN 'absent' THEN 'absent' WHEN 'refuse' THEN 'refus' WHEN 'reporte' THEN 'rdv' WHEN 'numero_incorrect' THEN 'numero_errone'
                     WHEN 'adresse_incorrecte' THEN 'adresse_erronee' ELSE 'endommage' END,
       (SELECT e.note FROM order_events e WHERE e.order_id = o.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1), o.attempts, o.driver_id, o.updated_at
FROM orders o LEFT JOIN users d ON d.id = o.driver_id
WHERE o.status IN ('absent','refuse','reporte','numero_incorrect','adresse_incorrecte','endommage')
  AND NOT EXISTS (SELECT 1 FROM parcel_problems p WHERE p.order_id = o.id);
`;

// More bordereaux (JAX parity): pickup requests (enlèvement), restitution to the sender with a signed discharge,
// transfer kind, vehicle plate.
const OPS_B = `
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS vehicle_plate   TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS transfer_kind   TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS pickup_date     DATE;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS pickup_address  TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS requested_by    INT REFERENCES users(id);
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS collected_at    TIMESTAMPTZ;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS signed_doc      TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS signer_name     TEXT;
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS signed_at       TIMESTAMPTZ;
`;

// Cash day closing + receipts attached to cash entries.
const OPS_C = `
ALTER TABLE cash_tx ADD COLUMN IF NOT EXISTS attachment TEXT;
CREATE TABLE IF NOT EXISTS cash_closings (
  id          SERIAL PRIMARY KEY,
  agency_id   INT NOT NULL REFERENCES agencies(id),
  day         DATE NOT NULL,
  opening     NUMERIC(12,3) NOT NULL,
  income      NUMERIC(12,3) NOT NULL,
  outflow     NUMERIC(12,3) NOT NULL,
  theoretical NUMERIC(12,3) NOT NULL,
  counted     NUMERIC(12,3) NOT NULL,
  gap         NUMERIC(12,3) NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('conforme','manque','surplus','rouverte')),
  note        TEXT,
  closed_by   INT REFERENCES users(id),
  closed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reopened_by INT REFERENCES users(id),
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_closings_day_key ON cash_closings (agency_id, day) WHERE status <> 'rouverte';
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
`;

// Shipper space (JAX parity): several users per shop, print format, withholding tax rate, second phone.
const SHOP = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_id    INT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_role    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS print_format TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rs_rate      NUMERIC(5,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS users_parent_idx ON users (parent_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_phone2 TEXT;
`;

// Driver work log: every call to a client from the driver app (outcome kept, visible to the agency and the shop).
const FLEET = `
CREATE TABLE IF NOT EXISTS order_calls (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id),
  user_id    INT REFERENCES users(id),
  phone      TEXT,
  outcome    TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_calls_order_idx ON order_calls (order_id);
ALTER TABLE order_calls ENABLE ROW LEVEL SECURITY;
`;

export const SCHEMA = [BASE, GEO, PRICING_SQL, PARCEL, STATUS, SCAN, MANIFESTS, PARTNERS, CASH, GPS, CLAIMS, SECURITY, NOTIFICATIONS, STOCK, OPS, OPS_B, OPS_C, SHOP, FLEET].join('\n');
