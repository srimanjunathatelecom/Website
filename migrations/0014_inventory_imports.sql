-- 0014_inventory_imports.sql
--
-- Foundation for the safe stock/product import pipeline and the richer
-- inventory audit trail:
--
--   1. stock_history grows the columns the audit spec requires: which
--      variant moved, what KIND of movement it was (sale, import, manual
--      correction, cancellation restore, rollback…), and which import batch
--      or order caused it. All additive with defaults, so every existing
--      row and every existing insert keeps working unchanged.
--   2. products / product_variants gain identity + commercial columns
--      (barcode, cost price, GST, HSN, SEO) and a stock_updated_at stamp
--      maintained by a trigger — the stamp is what lets an import warn
--      "this spreadsheet is older than the last stock change" without
--      trusting application code to remember to set it on every path.
--   3. import_batches / import_rows record every upload: who, when, which
--      file (sha-256 — duplicate-file detection), which mode, per-row
--      before/after snapshots (rollback), and per-row errors (error report).
--   4. import_mappings remembers a successful header→field mapping per
--      header signature, so the owner corrects a mapping once and future
--      uploads of the same sheet layout map themselves.
--
-- Nothing here drops or rewrites existing data.

-- ---------- 1. stock_history: richer audit trail ----------
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS variant_id integer;
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS variant_label text NOT NULL DEFAULT '';
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS movement_type text NOT NULL DEFAULT 'manual';
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS import_id integer;
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS order_id integer;
ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS stock_history_import_id_idx ON stock_history (import_id);
CREATE INDEX IF NOT EXISTS stock_history_order_id_idx ON stock_history (order_id);
CREATE INDEX IF NOT EXISTS stock_history_created_at_idx ON stock_history (created_at);
CREATE INDEX IF NOT EXISTS stock_history_variant_id_idx ON stock_history (variant_id);

-- ---------- 2. products / variants: identity, commercial, staleness ----------
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_updated_at timestamp;

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode text NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock_updated_at timestamp;

-- Lookup indexes for import matching (SKU/barcode are the primary match
-- keys — name matching is only ever a suggestion). Not UNIQUE at the
-- database level because legacy rows may already share a blank or
-- duplicated SKU; uniqueness among non-blank SKUs is enforced by
-- validateProductInput and the import matcher, which report the conflict
-- in plain language instead of a constraint violation.
CREATE INDEX IF NOT EXISTS products_sku_idx ON products (sku) WHERE sku <> '';
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode) WHERE barcode <> '';
CREATE INDEX IF NOT EXISTS product_variants_sku_idx ON product_variants (sku) WHERE sku <> '';
CREATE INDEX IF NOT EXISTS product_variants_barcode_idx ON product_variants (barcode) WHERE barcode <> '';

-- Stamp stock_updated_at whenever stock actually changes, no matter which
-- code path did it (orders, admin edit, import, bulk action, SQL console).
CREATE OR REPLACE FUNCTION touch_stock_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN
    NEW.stock_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_stock_touch ON products;
CREATE TRIGGER products_stock_touch
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_stock_updated_at();

DROP TRIGGER IF EXISTS product_variants_stock_touch ON product_variants;
CREATE TRIGGER product_variants_stock_touch
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION touch_stock_updated_at();

-- ---------- 3. import batches + rows ----------
CREATE TABLE IF NOT EXISTS import_batches (
  id            serial PRIMARY KEY,
  file_name     text NOT NULL DEFAULT '',
  file_hash     text NOT NULL DEFAULT '',
  file_size     integer NOT NULL DEFAULT 0,
  -- snapshot | receipt | adjust | reconcile | product | price
  mode          text NOT NULL DEFAULT 'snapshot',
  -- previewed | committed | cancelled | rolled_back | failed
  status        text NOT NULL DEFAULT 'previewed',
  admin_id      integer,
  admin_name    text NOT NULL DEFAULT '',
  -- Header→field mapping actually used for this file.
  mapping       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Counts shown in the preview and kept for the history list:
  -- { rows, creates, updates, newVariants, warnings, errors, stockBefore, stockAfter … }
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Admin confirmations recorded at commit time (allowDuplicateFile,
  -- allowStale, allowPriceDrops, reconcileMissing: 'ignore'|'zero'|'hide').
  options       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error         text NOT NULL DEFAULT '',
  created_at    timestamp NOT NULL DEFAULT now(),
  committed_at  timestamp,
  rolled_back_at timestamp
);

CREATE INDEX IF NOT EXISTS import_batches_file_hash_idx ON import_batches (file_hash);
CREATE INDEX IF NOT EXISTS import_batches_created_at_idx ON import_batches (created_at);

CREATE TABLE IF NOT EXISTS import_rows (
  id          serial PRIMARY KEY,
  import_id   integer NOT NULL,
  row_num     integer NOT NULL DEFAULT 0,
  -- create | update | new_variant | update_variant | conflict | error | skip
  action      text NOT NULL DEFAULT 'skip',
  product_id  integer,
  variant_id  integer,
  sku         text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  -- Parsed values from the sheet (only the columns the file actually had —
  -- partial-update safety depends on absent columns staying absent here).
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Database values BEFORE commit for every field this row will change;
  -- what rollback restores. Null until committed.
  before      jsonb,
  -- Values actually written at commit.
  after       jsonb,
  warnings    jsonb NOT NULL DEFAULT '[]'::jsonb,
  error       text NOT NULL DEFAULT '',
  applied     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS import_rows_import_id_idx ON import_rows (import_id);

-- ---------- 4. remembered header mappings ----------
CREATE TABLE IF NOT EXISTS import_mappings (
  signature   text PRIMARY KEY,
  mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamp NOT NULL DEFAULT now()
);
