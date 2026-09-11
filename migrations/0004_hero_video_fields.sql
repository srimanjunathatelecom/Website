-- Run this once against your Postgres database (see DATABASE_URL in .env)
-- to add the cinematic hero-video banner fields (content position, overlay
-- strength, and the mobile-video opt-in). Safe to re-run (IF NOT EXISTS
-- guards), purely additive, and does not touch any existing banner rows.
--
-- Usage:  psql "$DATABASE_URL" -f migration_add_hero_video_fields.sql
-- Or simply run `npm run db:push`, which applies the full schema
-- (including these columns) via Drizzle instead.

ALTER TABLE banners ADD COLUMN IF NOT EXISTS content_position text NOT NULL DEFAULT 'left';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS overlay_strength text NOT NULL DEFAULT 'medium';
ALTER TABLE banners ADD COLUMN IF NOT EXISTS mobile_video boolean NOT NULL DEFAULT false;
