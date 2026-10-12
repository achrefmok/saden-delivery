// Idempotent schema + data migrations. Executed once per SCHEMA_VERSION (see db.js migrate()).
// Bump SCHEMA_VERSION whenever this file changes.
export const SCHEMA_VERSION = '2026-10-13.geo';

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

export const SCHEMA = [BASE, GEO].join('\n');
