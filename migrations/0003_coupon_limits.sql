-- Run this once against your Postgres database (see DATABASE_URL in .env) to
-- add expiry and redemption limits to coupons. Safe to re-run (IF NOT EXISTS
-- guards) and does not change any existing coupon's behaviour: every column
-- is nullable and NULL means "no limit", so codes created before this
-- migration keep working exactly as they did.
--
-- Usage:  psql "$DATABASE_URL" -f migration_add_coupon_limits.sql
-- Or simply run `npm run db:push` which applies the full schema via Drizzle.
--
-- Why: until now a coupon had only `active` and `min_order`. A code that
-- leaked anywhere public — a screenshot, a deals forum, a shared WhatsApp
-- message — worked forever and an unlimited number of times, and the only
-- way to stop it was for the owner to notice and untick Active by hand.

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_redemptions integer;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_customer_limit integer;

-- Redemption counts are derived from orders.coupon_code rather than a counter
-- column, so they can never drift out of sync with the orders they describe.
-- This index keeps that count cheap as the orders table grows, since it now
-- runs on every checkout that applies a capped code.
CREATE INDEX IF NOT EXISTS orders_coupon_code_idx ON orders (coupon_code);
