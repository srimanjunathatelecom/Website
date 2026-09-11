-- Product questions & answers (PDP "Questions about this product" section)
--
-- Shopper-submitted questions answered by the store. Every question starts as
-- 'pending' and is only visible on the storefront once an admin publishes it,
-- so nothing unmoderated reaches a product page.
--
-- Safe to run more than once: every statement is guarded.

CREATE TABLE IF NOT EXISTS product_questions (
  id            serial PRIMARY KEY,
  product_id    integer NOT NULL,
  customer_id   integer NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  body          text NOT NULL DEFAULT '',
  answer        text NOT NULL DEFAULT '',
  answered_by   text NOT NULL DEFAULT '',
  answered_at   timestamp,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamp NOT NULL DEFAULT now()
);

-- The product page reads published questions for one product, newest first;
-- the admin queue reads by status. Both are covered here.
CREATE INDEX IF NOT EXISTS product_questions_product_status_idx
  ON product_questions (product_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS product_questions_status_idx
  ON product_questions (status, created_at DESC);
