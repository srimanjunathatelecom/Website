-- Run this once against your Postgres database (see DATABASE_URL in .env)
-- to add the premium banner design-system fields (style, text/product
-- animation, transition, badge). Safe to re-run (IF NOT EXISTS guards),
-- purely additive, and does not touch or delete any existing banner rows.
--
-- Usage:  psql "$DATABASE_URL" -f migration_add_banner_design_system.sql
-- Or simply run `npm run db:push` which applies the full schema
-- (including these columns) via Drizzle instead.

ALTER TABLE banners ADD COLUMN IF NOT EXISTS style text NOT NULL DEFAULT 'minimal';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS text_animation text NOT NULL DEFAULT 'fade-up';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS product_animation text NOT NULL DEFAULT 'none';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS transition text NOT NULL DEFAULT 'fade';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS badge text;
