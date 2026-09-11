-- Visual repair selection flow: Brand -> Model -> Service.
--
-- Two changes, both additive.
--
-- 1. brands.repairable
--    The `brands` table is the storefront's "Shop by Brand" rail — the brands
--    this shop SELLS. The repair flow needs the brands this shop REPAIRS, and
--    those two lists are not the same: we repair Huawei and LG without stocking
--    them. Rather than a second brands table (which would mean maintaining the
--    same logo twice and would let the two drift), one flag marks a brand as
--    appearing in the repair flow. A brand can be in both, either, or neither.
--
--    Defaulting to false is deliberate: turning this on is an explicit owner
--    decision in Admin, so the repair grid never silently fills with whatever
--    happens to be in the product catalogue.
--
-- 2. device_models
--    New table. There was no device-model concept in the schema at all; the
--    booking form captured the device as free text ("e.g. iPhone 12"), so
--    "Galaxy S23", "galaxy s23" and "S23 samsung" were three different devices
--    as far as the shop's records were concerned.
--
--    brand_id is a plain integer referencing brands.id rather than a FK with
--    ON DELETE CASCADE. Deleting a brand that still has models should fail
--    loudly in Admin and make the owner decide, not silently delete a few
--    hundred model rows — the same convention the rest of this schema uses
--    (order_items.product_id, bookings.service_id).

ALTER TABLE brands ADD COLUMN IF NOT EXISTS repairable boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS device_models (
  id serial PRIMARY KEY,
  brand_id integer NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  image text NOT NULL DEFAULT '',
  image_alt text NOT NULL DEFAULT '',
  -- Release year is what makes a model list readable: newest first is the
  -- order a customer scans, and it is the only sort that stays correct as
  -- models are added out of order.
  release_year integer,
  popular boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Slugs are unique per brand, not globally: "Galaxy S23" and a hypothetical
-- other-brand "S23" can coexist, and /repair/<brand>/<model> stays unambiguous
-- because the brand is already in the path.
CREATE UNIQUE INDEX IF NOT EXISTS device_models_brand_slug_unique_idx
  ON device_models (brand_id, slug);

-- The model grid's only query: active models for one brand.
CREATE INDEX IF NOT EXISTS device_models_brand_active_idx
  ON device_models (brand_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS brands_repairable_idx
  ON brands (repairable)
  WHERE repairable;
