-- Shared rate-limit counters.
--
-- Previously these lived in a Map in each server process, so limits were
-- per-instance and reset on every deploy: behind a load balancer an attacker
-- gets a fresh budget per instance, and a restart hands everyone a new one.
-- Moving them to the database makes one budget per key across all instances.
--
-- Additive and guarded, like every other migration here. Nothing reads this
-- table except the limiter, so losing its contents costs at most one window of
-- accounting.
CREATE TABLE IF NOT EXISTS rate_limits (
  key      text PRIMARY KEY,
  count    integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

-- The limiter prunes expired rows every few minutes. Without this index that
-- sweep is a full scan of a table that every login touches.
CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON rate_limits (reset_at);
