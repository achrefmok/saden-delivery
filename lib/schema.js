// Idempotent schema + data migrations. Executed once per SCHEMA_VERSION (see db.js migrate()).
// Bump SCHEMA_VERSION whenever this file changes.
export const SCHEMA_VERSION = '2026-10-12.1';

export const SCHEMA = `
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
