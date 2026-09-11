-- Run this once against your Postgres database (see DATABASE_URL in .env)
-- to add the promo_offers table backing the PDP "bank offers" section.
-- Safe to re-run (IF NOT EXISTS guards) and does not touch any existing data.
--
-- Usage:  psql "$DATABASE_URL" -f migration_add_promo_offers.sql
-- Or simply run `npm run db:push` which applies the full schema
-- (including this table) via Drizzle instead.

CREATE TABLE IF NOT EXISTS promo_offers (
  id serial PRIMARY KEY,
  type text NOT NULL DEFAULT 'bank',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  max_discount numeric(10,2),
  min_order numeric(12,2) NOT NULL DEFAULT 0,
  category_id integer,
  product_id integer,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamp,
  expires_at timestamp,
  sort_order integer NOT NULL DEFAULT 0
);