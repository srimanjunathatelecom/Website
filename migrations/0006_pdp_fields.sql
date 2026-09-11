-- Run this once against your Postgres database (see DATABASE_URL in .env)
-- to add the Flipkart-style product detail page fields. Safe to re-run
-- (IF NOT EXISTS guards) and does not touch any existing data.
--
-- Usage:  psql "$DATABASE_URL" -f migration_add_pdp_fields.sql
-- Or simply run `npm run db:push` which applies the full schema
-- (including these columns) via Drizzle instead.

ALTER TABLE products ADD COLUMN IF NOT EXISTS highlights text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_badge text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS protect_promise_fee text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_name text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_rating numeric(2,1);
ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_years integer;
