/**
 * `npm test` — runs every fetch-based suite in tests/ against a running,
 * seeded server, one after another, and fails if any suite fails.
 *
 * The suites are deliberately plain Node scripts (no framework): each one
 * exits non-zero on failure and prints its own pass/fail lines. This runner
 * only adds the two things they can't do alone — check the server is
 * actually up before starting (a connection-refused stack trace 21 times
 * over helps nobody), and roll the results up into a single exit code that
 * CI can act on.
 *
 * When DATABASE_URL is set, the runner clears the rate_limits table between
 * suites. The limits themselves are tested by rate-limit.mjs; for every other
 * suite they are noise — twelve suites sharing one IP budget for admin login
 * and registration means later suites fail on 429s that say nothing about
 * the code under test.
 *
 * The payment suites (payments-webhook, fulfilment-block, order-integrity's
 * gateway cases) need the server started with test-mode gateway env:
 *   RAZORPAY_KEY_ID=rzp_test_qa RAZORPAY_KEY_SECRET=qasecret
 *   RAZORPAY_WEBHOOK_SECRET=localqawebhooksecret
 * No real gateway is contacted — webhooks are signed locally with that secret.
 *
 * Usage:
 *   BASE=http://localhost:3000 npm test          # all suites
 *   npm test -- order-integrity payments-webhook  # just these
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env before anything reads process.env. Without this, DATABASE_URL is
// undefined here even when it is configured for the app, so clearRateLimits()
// below silently did nothing and suites inherited each other's rate-limit
// budgets — the later ones then failed with 429 for no visible reason.
if (existsSync(path.join(repoRoot, ".env"))) {
  try {
    const { default: dotenv } = await import("dotenv");
    dotenv.config({ path: path.join(repoRoot, ".env"), quiet: true });
  } catch {
    // dotenv is optional; without it the suites still run, they just share
    // rate-limit budgets and rely on env vars being exported by the caller.
  }
}

const BASE = process.env.BASE || "http://localhost:3000";
const testsDir = path.join(repoRoot, "tests");

// ---------- is the server up? ----------
try {
  const res = await fetch(`${BASE}/api/products?limit=1`);
  if (!res.ok) throw new Error(`status ${res.status}`);
} catch (e) {
  console.error(`\nNo server answering at ${BASE} — start one first:\n`);
  console.error(`  npm run build && npm run start   (or: npm run dev)`);
  console.error(`  BASE=${BASE} npm test\n`);
  console.error(`(${e.message})\n`);
  process.exit(1);
}

// ---------- which suites? ----------
const only = process.argv.slice(2).map((a) => a.replace(/\.mjs$/, ""));
const suites = readdirSync(testsDir)
  .filter((f) => f.endsWith(".mjs"))
  .filter((f) => only.length === 0 || only.includes(f.replace(/\.mjs$/, "")))
  .sort();

if (suites.length === 0) {
  console.error(`No matching suites in tests/ for: ${only.join(", ")}`);
  process.exit(1);
}

// ---------- rate-limit hygiene between suites ----------
async function clearRateLimits() {
  if (!process.env.DATABASE_URL) return;
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("DELETE FROM rate_limits");
    await client.end();
  } catch {
    // Table may not exist yet, or the URL may point elsewhere — the suites
    // still run, they just share rate-limit budgets.
  }
}

// ---------- run ----------
const results = [];
for (const suite of suites) {
  await clearRateLimits();
  console.log(`\n━━━ ${suite} ━━━`);
  const r = spawnSync(process.execPath, [path.join(testsDir, suite)], {
    stdio: "inherit",
    // Both spellings, deliberately. Ten suites read BASE and four read
    // BASE_URL, and the runner used to pass only BASE — so those four always
    // fell back to their localhost:3000 default and could never pass against a
    // server on any other port. They cover payments, cart revalidation,
    // fulfilment blocking and rate limiting, so the suite was reporting green
    // on the areas that most need testing while never reaching them.
    env: { ...process.env, BASE, BASE_URL: BASE },
  });
  results.push({ suite, ok: r.status === 0 });
}

// ---------- summary ----------
console.log(`\n━━━ summary ━━━`);
let failed = 0;
for (const r of results) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.suite}`);
  if (!r.ok) failed += 1;
}
console.log(`\n${results.length - failed}/${results.length} suites passed\n`);
process.exit(failed ? 1 : 0);
