-- Payment gateway support.
--
-- Additive and safe to run on a live database with existing orders: every new
-- column has a default, and no existing column is altered or dropped. Run it
-- before deploying the code that reads these columns.
--
-- Backfill reasoning for existing rows: orders taken before this migration
-- were all Cash on Delivery, and COD money is collected on handover. Orders
-- already marked Delivered therefore had their cash collected and are
-- backfilled as paid; anything still in flight stays pending. Guessing the
-- other way round would tell the shop it had been paid for goods still sitting
-- in the stockroom.

BEGIN;

-- ---------- orders: separate money state from fulfilment state ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamp;

UPDATE orders
   SET payment_status = 'paid',
       paid_at        = COALESCE(paid_at, created_at)
 WHERE payment_status = 'pending'
   AND status = 'Delivered';

-- Orders are listed and filtered by payment state on the admin dashboard.
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders (payment_status);

-- ---------- payments: one row per attempt ----------
CREATE TABLE IF NOT EXISTS payments (
  id                 serial PRIMARY KEY,
  order_id           integer NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  gateway            text    NOT NULL DEFAULT 'razorpay',
  gateway_order_id   text,
  gateway_payment_id text,
  amount_paise       integer NOT NULL,
  currency           text    NOT NULL DEFAULT 'INR',
  status             text    NOT NULL DEFAULT 'created',
  method             text    NOT NULL DEFAULT '',
  error_code         text    NOT NULL DEFAULT '',
  error_description  text    NOT NULL DEFAULT '',
  refunded_paise     integer NOT NULL DEFAULT 0,
  stock_released_at  timestamp,
  last_event_id      text    NOT NULL DEFAULT '',
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now(),

  -- Money can never be negative, and a refund can never exceed what was
  -- charged. These are enforced in the database rather than only in
  -- application code because a reconciliation bug that writes a nonsensical
  -- refund total should fail loudly at the write, not quietly corrupt the
  -- figures the shop reports to its accountant.
  CONSTRAINT payments_amount_positive CHECK (amount_paise >= 0),
  CONSTRAINT payments_refund_within_amount CHECK (refunded_paise >= 0 AND refunded_paise <= amount_paise)
);

-- A gateway order represents one cart. Enforcing uniqueness is what lets the
-- create endpoint safely reuse an in-flight attempt instead of opening a
-- second gateway order for the same cart, which is how a shop double-charges.
CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_order_id_key
  ON payments (gateway_order_id);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON payments (order_id);
CREATE INDEX IF NOT EXISTS payments_gateway_payment_id_idx ON payments (gateway_payment_id);
-- Drives the reconciliation sweep, which selects in-flight attempts by age.
CREATE INDEX IF NOT EXISTS payments_status_created_at_idx ON payments (status, created_at);

-- ---------- payment_events: webhook idempotency ledger ----------
CREATE TABLE IF NOT EXISTS payment_events (
  id          serial PRIMARY KEY,
  gateway     text    NOT NULL DEFAULT 'razorpay',
  event_id    text    NOT NULL,
  event_type  text    NOT NULL DEFAULT '',
  payment_id  integer REFERENCES payments (id) ON DELETE SET NULL,
  received_at timestamp NOT NULL DEFAULT now()
);

-- The whole point of the table. Gateways deliver webhooks at least once, so
-- the unique index is what turns "have I already handled this event?" into a
-- single atomic INSERT ... ON CONFLICT DO NOTHING, with no window for two
-- concurrent deliveries to both decide they are the first.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_event_id_key
  ON payment_events (gateway, event_id);

COMMIT;
