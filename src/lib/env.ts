/**
 * Environment configuration, validated once.
 *
 * SITE_URL was previously read in six places, each with its own
 * `|| "https://smsstores.example.com"` fallback. That fallback is a silent
 * production hazard rather than a convenience: if the variable is missing on
 * a live deploy, the site keeps working while every canonical tag, the
 * sitemap, robots.txt and every link in every customer email point at a
 * domain the shop doesn't own. Search engines take the canonical tag at its
 * word, so the failure mode is losing search traffic weeks later with
 * nothing in the logs.
 *
 * So: in production a missing or placeholder SITE_URL is a hard failure at
 * boot, where it's obvious and fixable during the deploy. In development it
 * falls back to localhost, which is what a developer actually wants.
 */

function resolveSiteUrl(): string {
  const raw = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  const isProd = process.env.NODE_ENV === "production";

  if (!raw) {
    if (isProd) {
      throw new Error(
        "SITE_URL is required in production. Without it, canonical URLs, the " +
          "sitemap, robots.txt and email links would all point at a placeholder " +
          "domain. Set it to the site's real origin, e.g. https://smsstores.in",
      );
    }
    return "http://localhost:3000";
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SITE_URL is not a valid URL: "${raw}"`);
  }

  // Catch the old placeholder explicitly — it's the value most likely to be
  // copied out of an example .env and left in place.
  if (isProd && /(^|\.)example\.(com|org|net)$/i.test(parsed.hostname)) {
    throw new Error(
      `SITE_URL is set to the placeholder "${raw}". Set it to the site's real origin.`,
    );
  }

  // Absolute URLs in emails and metadata must be https in production, or mail
  // clients and browsers will flag or rewrite them. Localhost is exempt:
  // `next build` and `next start` both run with NODE_ENV=production, so
  // requiring https outright would make it impossible to test a production
  // build locally. IP addresses are also exempt for initial deployment testing.
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const isIP = /^[\d\.:]+$/.test(parsed.hostname);
  if (isProd && !isLocal && !isIP && parsed.protocol !== "https:") {
    throw new Error(`SITE_URL must use https in production (got "${raw}").`);
  }

  return raw;
}

export const siteUrl = resolveSiteUrl();

/**
 * True when outbound email is actually configured. The notification code
 * already degrades gracefully without SMTP, but callers sometimes need to
 * know whether to promise the customer an email.
 */
export const emailConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

/* ------------------------------------------------------------------------- *
 * Pre-deploy / runtime configuration audit
 *
 * `siteUrl` above fails at boot, which is the right behaviour once the app is
 * running but useless before the first deploy: you find out by breaking the
 * deploy. The audit below answers the same questions without booting anything,
 * so `npm run check:env` can be run against the production values while they
 * are still being typed into a hosting dashboard. /api/health reuses it to
 * report whether a running instance is fully configured.
 *
 * Every rule here exists because the failure it catches is silent. None of them
 * relax anything enforced above.
 * ------------------------------------------------------------------------- */

export type EnvIssue = {
  variable: string;
  /** `error` blocks a correct production deploy; `warning` degrades a feature. */
  level: "error" | "warning";
  message: string;
};

/** Required for the app to run at all. */
const REQUIRED = ["DATABASE_URL"] as const;

/**
 * Values that must never contain a `#`, because dotenv treats it as the start of
 * a comment unless the value is quoted, and silently keeps only what precedes it.
 */
const HASH_SENSITIVE = [
  "DATABASE_URL",
  "SEED_KEY",
  "INITIAL_ADMIN_PASSWORD",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "CRON_SECRET",
  "SMTP_PASS",
  "R2_SECRET_ACCESS_KEY",
] as const;

const RAZORPAY = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const;
const SMTP = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;
const R2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"] as const;

function present(name: string) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Inspect the current environment.
 *
 * `isProduction` controls strictness rather than reading NODE_ENV directly, so
 * the same function can be used to check a production config from a developer
 * machine.
 */
export function checkEnv(isProduction = process.env.NODE_ENV === "production"): EnvIssue[] {
  const issues: EnvIssue[] = [];

  for (const name of REQUIRED) {
    if (!present(name)) {
      issues.push({
        variable: name,
        level: "error",
        message: "Required. The app cannot serve a single page without a database.",
      });
    }
  }

  // The truncation trap. A `#` that survived into the parsed value means the
  // value was quoted and is fine; a value that *ends* where a `#` would have
  // been is invisible from here, so warn on any `#` present and explain both.
  for (const name of HASH_SENSITIVE) {
    if (present(name) && process.env[name]!.includes("#")) {
      issues.push({
        variable: name,
        level: "warning",
        message:
          'Contains "#". This is only safe if the value is wrapped in double quotes in .env — ' +
          "unquoted, everything from the # onwards is discarded as a comment and the app will " +
          "behave as though you set a shorter value.",
      });
    }
  }

  // Razorpay: all three or none. Partial configuration is worse than none,
  // because the storefront offers online payment and then can't complete it.
  const rzp = RAZORPAY.filter(present);
  if (rzp.length > 0 && rzp.length < RAZORPAY.length) {
    for (const name of RAZORPAY) {
      if (!present(name)) {
        issues.push({
          variable: name,
          level: "error",
          message:
            "Online payment is partially configured. All three Razorpay variables are needed: " +
            "without this one, checkout can open a payment it cannot verify or settle. " +
            "Set all three, or none (the storefront then offers Cash on Delivery only).",
        });
      }
    }
  }

  // SMTP: the same all-or-nothing argument. Order confirmation emails simply
  // don't send if this is half-set, and nothing surfaces to the customer.
  const smtp = SMTP.filter(present);
  if (smtp.length > 0 && smtp.length < SMTP.length) {
    for (const name of SMTP) {
      if (!present(name)) {
        issues.push({
          variable: name,
          level: "warning",
          message:
            "Email is partially configured, so order and account emails will not be sent. " +
            "Set all five SMTP variables, or none.",
        });
      }
    }
  }

  // R2 object storage: all five or none. A half-set group behaves exactly
  // like an unset one (uploads silently keep going into the database as
  // base64), so the owner who set four of five variables would never learn
  // why the CDN stayed empty without this warning.
  const r2 = R2.filter(present);
  if (r2.length > 0 && r2.length < R2.length) {
    for (const name of R2) {
      if (!present(name)) {
        issues.push({
          variable: name,
          level: "warning",
          message:
            "Object storage (Cloudflare R2) is partially configured, so admin media uploads will " +
            "fall back to storing base64 in the database. Set all five R2 variables, or none.",
        });
      }
    }
  }

  if (isProduction) {
    if (!present("SITE_URL")) {
      issues.push({
        variable: "SITE_URL",
        level: "error",
        message:
          "Required in production. Used to build absolute URLs in customer emails, the sitemap " +
          "and payment callbacks.",
      });
    } else {
      const v = process.env.SITE_URL!;
      if (/localhost|127\.0\.0\.1/.test(v)) {
        issues.push({
          variable: "SITE_URL",
          level: "error",
          message:
            "Points at localhost in production. Every link in every order email would send the " +
            "customer to their own machine.",
        });
      } else if (!v.startsWith("https://") && !/^http:\/\/[\d\.:]+$/.test(v)) {
        issues.push({
          variable: "SITE_URL",
          level: "error",
          message: "Must be https:// in production. Session cookies and payment callbacks depend on TLS.",
        });
      }
    }

    if (present("SEED_KEY")) {
      issues.push({
        variable: "SEED_KEY",
        level: "warning",
        message:
          "Set in production, which leaves /api/seed usable. It rewrites store settings and demo " +
          "content. Unset it once the real catalogue is in place — the endpoint refuses to run " +
          "without it.",
      });
    }

    if (present("INITIAL_ADMIN_PASSWORD")) {
      issues.push({
        variable: "INITIAL_ADMIN_PASSWORD",
        level: "warning",
        message:
          "Still set in production. It is only needed to create the first admin. Remove it after " +
          "the account exists and its password has been changed from the console.",
      });
    }

    // Report-only is the right setting for a first deployment and the wrong one
    // to leave enabled, since it looks identical from the outside.
    if (process.env.CSP_REPORT_ONLY === "1") {
      issues.push({
        variable: "CSP_REPORT_ONLY",
        level: "warning",
        message:
          "Content-Security-Policy is running in report-only mode, so violations are reported but " +
          "nothing is blocked — the XSS protection is inactive. Fine for verifying the policy on a " +
          "new deployment; unset it once the browser console is clean.",
      });
    }

    // Not blocking: stderr reporting works without it. But a production shop
    // with nobody watching stderr will not notice a failing payment webhook.
    if (!present("ERROR_WEBHOOK_URL")) {
      issues.push({
        variable: "ERROR_WEBHOOK_URL",
        level: "warning",
        message:
          "Not set. Errors are still written to stderr as structured JSON for your host to collect, " +
          "but nothing will actively alert you. Set it to a Slack/Discord webhook or any JSON endpoint " +
          "if you want to be told when orders start failing.",
      });
    }

    // Rate limiting is only as good as this matching the real topology. Too high
    // and the app trusts a client-supplied hop as the client IP, which lets an
    // attacker rotate X-Forwarded-For for a fresh bucket per request; too low and
    // every customer behind the proxy shares one bucket and throttles each other.
    if (!present("TRUSTED_PROXY_HOPS")) {
      issues.push({
        variable: "TRUSTED_PROXY_HOPS",
        level: "warning",
        message:
          "Not set, defaulting to 1 (one load balancer or CDN in front of the app). Confirm this " +
          "matches your deployment: too high and rate limits can be bypassed by forging " +
          "X-Forwarded-For, too low and all customers share one bucket. Set 0 if nothing " +
          "proxies the app, 2 if two layers do.",
      });
    }

    // Not a security hole either way, but the two settings have very different
    // bills attached and the operator should know which one they picked.
    const hosts = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || "").trim();
    if (!hosts) {
      issues.push({
        variable: "NEXT_PUBLIC_IMAGE_HOSTS",
        level: "warning",
        message:
          "Not set, so remote images render unoptimized (correct and safe, just heavier). " +
          "List the image hosts you actually use, comma-separated, to enable resizing and " +
          "responsive sizing for them.",
      });
    } else if (hosts.split(",").some((h) => h.trim() === "*")) {
      issues.push({
        variable: "NEXT_PUBLIC_IMAGE_HOSTS",
        level: "warning",
        message:
          'Set to "*", which lets /_next/image fetch and resize any HTTPS URL on the internet. ' +
          "Anyone who can reach that path can run their traffic through your server on your bill. " +
          "Replace it with the specific hosts you use.",
      });
    }

    if (rzp.length === RAZORPAY.length && process.env.RAZORPAY_KEY_ID!.startsWith("rzp_test_")) {
      issues.push({
        variable: "RAZORPAY_KEY_ID",
        level: "error",
        message:
          "This is a test-mode key (rzp_test_…), so no real payment can be collected. Replace it " +
          "with the live key before taking orders.",
      });
    }
  }

  return issues;
}

/** True when nothing would block a correct production deploy. */
export function envIsDeployable(issues: EnvIssue[]) {
  return !issues.some((i) => i.level === "error");
}
