CREATE TABLE IF NOT EXISTS items (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  category    text NOT NULL DEFAULT '',
  serial      text NOT NULL DEFAULT '',
  condition   text NOT NULL CHECK (condition IN ('new','excellent','good','fair','poor')),
  qty         integer NOT NULL CHECK (qty >= 0),
  cost_cents  integer NOT NULL CHECK (cost_cents >= 0),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  location    text NOT NULL DEFAULT '',
  status      text NOT NULL CHECK (status IN ('in_stock','listed','sold','archived')),
  notes       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_status ON items (status);
CREATE INDEX IF NOT EXISTS items_created ON items (created_at DESC);
