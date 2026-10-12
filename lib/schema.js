// Idempotent schema — executed once per cold start.
export const SCHEMA = `
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
`;
