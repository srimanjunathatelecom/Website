-- Catalogue Health: automated audit / auto-fix / review-queue system.
--
-- Three tables, all additive — nothing existing is altered:
--
--   catalogue_jobs      one row per background run (scan / fix / enrich /
--                       daily check / bulk image mapping). Progress counters
--                       live here so the admin can leave the page and come
--                       back; a job survives a browser refresh because the
--                       browser only ever polls it.
--
--   catalogue_issues    one row per detected problem on a product/variant
--                       (missing image, placeholder, broken image, missing
--                       data, duplicate candidate, ...). `proposal` holds the
--                       machine-suggested fix (image URL + source + confidence,
--                       or field values); `before`/`after` record exactly what
--                       an auto-fix changed, which is what makes review and
--                       audit possible. A fingerprint keeps re-scans from
--                       piling up duplicate open rows for the same problem.
--
--   catalogue_settings  singleton (id=1), same pattern as store_settings:
--                       the owner's automation preferences — daily check
--                       on/off, auto-fix on/off, confidence thresholds, and
--                       the minimum fields a product needs before automation
--                       will ever publish it.
--
-- Everything is guarded with IF NOT EXISTS so re-running is safe (see
-- scripts/migrate.mjs).

CREATE TABLE IF NOT EXISTS catalogue_jobs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'scan',
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT NOT NULL DEFAULT '',
  admin_id INTEGER,
  admin_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  heartbeat_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS catalogue_jobs_status_idx ON catalogue_jobs (status);
CREATE INDEX IF NOT EXISTS catalogue_jobs_created_at_idx ON catalogue_jobs (created_at);

CREATE TABLE IF NOT EXISTS catalogue_issues (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  image_id INTEGER,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  confidence INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  proposal JSONB NOT NULL DEFAULT '{}'::jsonb,
  before JSONB,
  after JSONB,
  job_id INTEGER,
  fingerprint TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP,
  resolved_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS catalogue_issues_product_id_idx ON catalogue_issues (product_id);
CREATE INDEX IF NOT EXISTS catalogue_issues_status_idx ON catalogue_issues (status);
CREATE INDEX IF NOT EXISTS catalogue_issues_type_idx ON catalogue_issues (type);
-- One OPEN/NEEDS-REVIEW row per problem: a re-scan updates the existing row
-- instead of inserting a twin. Resolved rows keep their history.
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_issues_open_fingerprint_idx
  ON catalogue_issues (fingerprint)
  WHERE status IN ('open', 'needs_review');

CREATE TABLE IF NOT EXISTS catalogue_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  daily_check_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_fix_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_approve_threshold INTEGER NOT NULL DEFAULT 90,
  review_threshold INTEGER NOT NULL DEFAULT 60,
  required_publish_fields JSONB NOT NULL DEFAULT '["name","categoryId","mop","image"]'::jsonb,
  official_domains JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_daily_run_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO catalogue_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
