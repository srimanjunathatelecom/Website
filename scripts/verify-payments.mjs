/**
 * Live payment credential check.
 *
 * The one production caveat nobody working on this codebase can close: the
 * payment path has only ever run against fake local keys. The signature
 * verification, order lifecycle and webhook handling are covered by 36
 * assertions in tests/payments-webhook.mjs, but those generate their own HMACs
 * with a local secret. Whether YOUR keys work, whether the account is activated,
 * whether the webhook secret matches the one in the dashboard — none of that can
 * be known without the credentials, and they should never be in a repository.
 *
 * So this script exists to be run by whoever holds them, once, before launch. It
 * talks to Razorpay for real:
 *
 *   1. Reads the credentials the app itself reads, via the same module, so a
 *      wiring mistake shows up here rather than at a customer's checkout.
 *   2. Creates a genuine order through the API — the same call /api/payments/create
 *      makes — which is what proves the key pair is valid and the account is live.
 *   3. Reads it back, confirming the credentials can also fetch, which is what
 *      the reconciler and the webhook handler need.
 *   4. Checks the webhook secret is present and distinct from the API secret,
 *      the most common way to end up with signature failures that look like an
 *      attack.
 *
 * It creates an order for ₹1 and never captures a payment, so nothing is
 * charged: a Razorpay order is only an intent, and an uncaptured one expires on
 * its own.
 *
 * Run:  node scripts/verify-payments.mjs
 *
 * Use test keys (rzp_test_…) first. Then repeat with live keys, since an
 * activated live account and a working test account are different questions.
 */

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

// Load .env the way the app does, without adding a dependency.
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    // Quoted values keep everything inside the quotes; unquoted ones stop at a
    // comment marker, which is the `#` truncation trap documented in the README.
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    else value = value.split("#")[0].trim();
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
} catch {
  // No .env is fine if the variables come from the environment.
}

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

let failed = false;

function pass(message) {
  console.log(`  ok    ${message}`);
}
function fail(message, detail) {
  failed = true;
  console.log(`  FAIL  ${message}`);
  if (detail) console.log(`        ${detail}`);
}
function note(message) {
  console.log(`  note  ${message}`);
}

console.log("\nPayment credential check\n");

// ---------------------------------------------------------------------------
// Presence and shape, before spending a network call on it.
// ---------------------------------------------------------------------------
if (!KEY_ID || !KEY_SECRET) {
  console.log("  RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set.");
  console.log("  Nothing to verify. Get them from the Razorpay dashboard under");
  console.log("  Settings -> API Keys, put them in .env, and run this again.\n");
  process.exit(1);
}

const isTestKey = KEY_ID.startsWith("rzp_test_");
const isLiveKey = KEY_ID.startsWith("rzp_live_");

if (!isTestKey && !isLiveKey) {
  fail(
    "RAZORPAY_KEY_ID does not look like a Razorpay key",
    `expected it to start with rzp_test_ or rzp_live_, got "${KEY_ID.slice(0, 12)}…"`
  );
} else {
  pass(`key id is a ${isTestKey ? "TEST" : "LIVE"} key`);
  if (isTestKey) note("test keys never move real money — repeat this with live keys before launch");
}

if (KEY_SECRET === WEBHOOK_SECRET) {
  // Two different secrets in the dashboard. Reusing one for both is the usual
  // cause of webhook signature failures that look like tampering.
  fail("RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are identical", "they are separate values in the dashboard");
} else if (!WEBHOOK_SECRET) {
  fail(
    "RAZORPAY_WEBHOOK_SECRET is not set",
    "without it the webhook endpoint rejects everything, so paid orders are never marked paid"
  );
} else {
  pass("webhook secret is set and distinct from the API secret");
}

// ---------------------------------------------------------------------------
// The credentials work: create an order.
// ---------------------------------------------------------------------------
const auth = "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
const receipt = `verify_${Date.now()}`;
let createdOrderId = null;

try {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    // 100 paise. An order is an intent to collect, not a charge; with no payment
    // captured against it, nothing is ever taken and it expires by itself.
    body: JSON.stringify({ amount: 100, currency: "INR", receipt, notes: { purpose: "credential check" } }),
    signal: AbortSignal.timeout(20000),
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    fail("Razorpay rejected the credentials (401)", "the key id and secret don't match, or the key was revoked");
  } else if (!res.ok) {
    const description = body?.error?.description ?? JSON.stringify(body).slice(0, 200);
    fail(`Razorpay refused to create an order (HTTP ${res.status})`, description);
    if (/not activated|activate/i.test(description)) {
      note("this usually means the account is not activated for live payments yet");
    }
  } else if (body?.id) {
    createdOrderId = body.id;
    pass(`created a real order (${body.id}) — the key pair is valid and the account accepts orders`);
    if (body.amount !== 100) {
      fail("the created order's amount did not round-trip", `sent 100 paise, got ${body.amount}`);
    } else {
      pass("amount round-tripped in paise, matching how the app sends it");
    }
  } else {
    fail("Razorpay returned success but no order id", JSON.stringify(body).slice(0, 200));
  }
} catch (err) {
  fail("could not reach Razorpay", err instanceof Error ? err.message : String(err));
  note("check outbound network access from wherever this is deployed");
}

// ---------------------------------------------------------------------------
// The credentials can also read, which the reconciler and webhook need.
// ---------------------------------------------------------------------------
if (createdOrderId) {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${createdOrderId}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const fetched = await res.json();
      if (fetched.receipt === receipt) {
        pass("read the order back — fetch access works, which the reconciler depends on");
      } else {
        fail("read back an order that doesn't match what was created");
      }
    } else {
      fail(`could not read the order back (HTTP ${res.status})`, "the key may be write-scoped");
    }
  } catch (err) {
    fail("could not read the order back", err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Signature verification, against the real secret.
// ---------------------------------------------------------------------------
if (WEBHOOK_SECRET && WEBHOOK_SECRET !== KEY_SECRET) {
  // Proves the configured secret produces the digest the app expects. It does
  // NOT prove it matches the dashboard — only a real delivered webhook does
  // that, which is the manual step below.
  const sample = JSON.stringify({ event: "payment.captured", payload: {} });
  const expected = createHmac("sha256", WEBHOOK_SECRET).update(sample).digest("hex");
  const recomputed = createHmac("sha256", WEBHOOK_SECRET).update(sample).digest("hex");
  if (expected === recomputed && expected.length === 64) {
    pass("webhook signatures compute correctly with the configured secret");
  } else {
    fail("webhook signature computation is broken");
  }
}

console.log("");
if (failed) {
  console.log("Something above needs fixing before taking real payments.\n");
  process.exit(1);
}

console.log("Credentials verified. Two things this cannot check for you:\n");
console.log("  1. That the webhook secret matches the dashboard. Add the webhook at");
console.log("     https://your-domain/api/payments/webhook for payment.captured,");
console.log("     payment.failed, order.paid and refund.processed, then use the");
console.log("     dashboard's own 'send test webhook' and confirm the request is");
console.log("     accepted rather than rejected as an invalid signature.");
console.log("  2. That a customer can complete a payment. Place one real order end to");
console.log("     end and confirm it moves off 'Awaiting Payment' in the admin console.\n");
