-- Back-in-stock alerts: customers leave an email on an out-of-stock product
-- (optionally a specific variant) and get one email when it is restocked.
--
-- The unique index is partial (pending rows only): a customer who was already
-- notified once can subscribe again the next time the product sells out,
-- without the old consumed row blocking the insert.

CREATE TABLE IF NOT EXISTS stock_alerts (
  id serial PRIMARY KEY,
  product_id integer NOT NULL,
  variant_id integer,
  email text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  notified_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_pending_unique_idx
  ON stock_alerts (product_id, COALESCE(variant_id, 0), lower(email))
  WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS stock_alerts_product_pending_idx
  ON stock_alerts (product_id)
  WHERE notified_at IS NULL;
