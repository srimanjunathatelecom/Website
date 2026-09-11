-- Repair services upgrade: image-led service catalogue.
-- Adds presentation + merchandising fields to the existing services table.
-- All columns have defaults so existing rows keep working untouched.

ALTER TABLE services ADD COLUMN IF NOT EXISTS image text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_alt text NOT NULL DEFAULT '';
-- Where the image came from (JSON: {"name","url","license"}) so the admin can
-- always answer "is this image ours to use?" — never shown to customers.
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_source text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS badge text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS cta_label text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_url text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN IF NOT EXISTS meta_description text NOT NULL DEFAULT '';
