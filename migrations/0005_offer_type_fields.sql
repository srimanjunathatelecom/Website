-- Run this once against your Postgres database (see DATABASE_URL in .env)
-- to add type-specific fields to promo_offers (bank/UPI provider, EMI
-- tenure/interest/no-cost/processing fee, exchange value/eligibility).
-- Safe to re-run (IF NOT EXISTS guards) and does not touch any existing data
-- — every new column is nullable or has a default, so existing offer rows
-- keep working exactly as before.
--
-- Usage:  psql "$DATABASE_URL" -f migration_add_offer_type_fields.sql
-- Or simply run `npm run db:push` which applies the full schema via Drizzle.

ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT '';
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT '';
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS emi_tenures text NOT NULL DEFAULT '';
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS emi_interest_rate numeric(5,2);
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS no_cost_emi boolean NOT NULL DEFAULT false;
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS processing_fee numeric(10,2);
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS min_purchase_amount numeric(12,2);
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS max_exchange_value numeric(12,2);
ALTER TABLE promo_offers ADD COLUMN IF NOT EXISTS exchange_eligibility text NOT NULL DEFAULT '';
