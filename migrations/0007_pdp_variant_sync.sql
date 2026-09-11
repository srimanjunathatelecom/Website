-- =====================================================================
-- PDP upgrade + Admin/DB/API synchronisation
-- =====================================================================
-- Additive only: every statement is IF NOT EXISTS / nullable-or-defaulted,
-- so existing rows keep working and no product data is rewritten.
-- Safe to run more than once.
--
-- Apply with:  psql "$DATABASE_URL" -f migration_add_pdp_variant_sync.sql
-- (or run the equivalent through your hosting provider's SQL console)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. products — "what's in the box" + extra merchandising badges
--    Previously the PDP rendered a fixed set of trust/box lines in JSX.
--    These columns move that content into Admin where it belongs.
-- ---------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS box_contents  text    NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS trending      boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS limited_stock boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hot_deal      boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 2. product_images — colour association + video support
--    variant_color '' (the default) keeps every existing image visible
--    for every colour, which is exactly today's behaviour.
-- ---------------------------------------------------------------------
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS variant_color text NOT NULL DEFAULT '';
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS media_type    text NOT NULL DEFAULT 'image';

CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images (product_id, sort_order);

-- ---------------------------------------------------------------------
-- 3. product_variants — admin-controlled swatches, availability, order
--    color_hex '' falls back to the built-in colour-name lookup, so
--    existing variants render identically until an admin sets a hex.
-- ---------------------------------------------------------------------
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex    text    NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS swatch_image text    NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS available    boolean NOT NULL DEFAULT true;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sort_order   integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id, sort_order);

-- ---------------------------------------------------------------------
-- 4. delivery_pincodes — real delivery pricing per pincode
--    Defaults of 0 mean "free delivery", i.e. the current messaging.
-- ---------------------------------------------------------------------
ALTER TABLE delivery_pincodes ADD COLUMN IF NOT EXISTS delivery_charge     numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE delivery_pincodes ADD COLUMN IF NOT EXISTS free_delivery_above numeric(12,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- 5. order_items — record which variant was actually purchased
--    variant_id is nullable so historical orders (placed before variant
--    tracking existed) stay valid instead of being back-filled with a guess.
-- ---------------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id    integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label text NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku           text NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------
-- 6. reviews — verified-purchase flag + helpful votes
--    verified_purchase is only ever set server-side by checking the
--    reviewer's own orders; it is never accepted from the client.
-- ---------------------------------------------------------------------
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verified_purchase boolean NOT NULL DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count     integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS review_votes (
  id          serial PRIMARY KEY,
  review_id   integer NOT NULL,
  customer_id integer NOT NULL,
  created_at  timestamp NOT NULL DEFAULT now()
);

-- One helpful vote per customer per review. The unique index (not app code)
-- is what actually prevents the count being inflated by repeat clicks.
CREATE UNIQUE INDEX IF NOT EXISTS review_votes_review_customer_idx
  ON review_votes (review_id, customer_id);

-- ---------------------------------------------------------------------
-- 7. Back-fill verified_purchase for reviews that already exist, using
--    real order history only. Nothing is invented: a review is marked
--    verified strictly when that customer has an order containing that
--    product.
-- ---------------------------------------------------------------------
UPDATE reviews r
SET verified_purchase = true
WHERE r.verified_purchase = false
  AND EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.customer_id = r.customer_id
      AND oi.product_id = r.product_id
  );
