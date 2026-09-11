-- Customer password reset tokens.
--
-- A locked-out customer previously had no recovery path at all — the login
-- form linked "Forgot password?" to the contact page. This table backs the
-- real flow: /api/auth/forgot issues a single-use token (only its SHA-256
-- hash is stored, so a database read never yields a usable link) and
-- /api/auth/reset consumes it.
--
-- Rows are short-lived by design: tokens expire after 30 minutes and are
-- marked used on redemption rather than deleted, which keeps a small audit
-- trail of reset activity. Expired rows are pruned opportunistically by the
-- forgot route.
--
-- Additive and guarded, like every other migration here.
CREATE TABLE IF NOT EXISTS password_resets (
  id          serial PRIMARY KEY,
  customer_id integer NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamp NOT NULL,
  used_at     timestamp,
  created_at  timestamp NOT NULL DEFAULT now()
);

-- The reset route looks tokens up by hash; without this the lookup is a
-- sequential scan on a table an attacker can grow by hammering /forgot.
CREATE UNIQUE INDEX IF NOT EXISTS password_resets_token_hash_idx ON password_resets (token_hash);

-- Issuing a new token invalidates the customer's outstanding ones, which is
-- an update keyed on customer_id.
CREATE INDEX IF NOT EXISTS password_resets_customer_id_idx ON password_resets (customer_id);
