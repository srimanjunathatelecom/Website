/**
 * Rate limiting — the parts that were broken, and the parts that must not break.
 *
 * The limiter previously read the FIRST entry of `x-forwarded-for`, which the
 * caller supplies. Sending a different value on each request produced a new
 * bucket every time, so the limits applied to nobody who knew that. Nine wrong
 * admin passwords with a rotating header returned nine 401s and no 429; the same
 * nine without it were blocked on the ninth. Counters also lived in process
 * memory, so they reset on deploy and were multiplied by the instance count.
 *
 * Both are fixed: the client IP is taken from the trusted end of the forwarded
 * chain, and counters live in Postgres. Logins additionally carry a per-account
 * limit so that credential stuffing spread across many IPs is still capped.
 *
 * These assertions exist because every one of these failures is invisible from
 * the outside — the endpoint returns a perfectly normal 401 either way.
 *
 * Assumes the server runs with the default TRUSTED_PROXY_HOPS (1), i.e. one
 * proxy in front, which is what a deployed instance looks like. Requests here
 * therefore send a two-entry chain: a forged left entry, and a right entry
 * standing in for what a real proxy would append.
 *
 * Run with the server up:  node tests/rate-limit.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log("FAIL: " + label);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

/** Each run uses a distinct IP range so repeated runs don't collide. */
const RUN = Math.floor(Math.random() * 200) + 20;

/**
 * One admin login attempt.
 * @param forgedLeft  what a hostile client puts in x-forwarded-for
 * @param proxyRight  what the trusted proxy appends — the real client IP
 */
async function attempt({ forgedLeft, proxyRight, email = ADMIN_EMAIL, password = "definitely-wrong" }) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": forgedLeft ? `${forgedLeft}, ${proxyRight}` : proxyRight,
    },
    body: JSON.stringify({ email, password }),
  });
  return res.status;
}

async function main() {
  // -----------------------------------------------------------------------
  // Forging x-forwarded-for must not buy a fresh bucket.
  // -----------------------------------------------------------------------
  {
    const realIp = `10.${RUN}.1.5`;
    const statuses = [];
    // The IP limit is 8 per 15 min. Ten attempts, each forging a different left
    // entry, all arriving through the same proxy hop.
    for (let i = 1; i <= 10; i++) {
      statuses.push(await attempt({ forgedLeft: `203.0.113.${i}`, proxyRight: realIp }));
    }
    ok(
      statuses.includes(429),
      "rotating a forged x-forwarded-for does not evade the per-IP limit (this is the bug that was fixed)"
    );
    eq(statuses[0], 401, "the first attempt is a normal auth failure, not a block");
    // Blocking should begin once the budget is spent, not immediately.
    ok(statuses.slice(0, 8).every((s) => s === 401), "the first 8 attempts are allowed through");
    ok(statuses.slice(8).every((s) => s === 429), "attempts past the limit are blocked");
  }

  // -----------------------------------------------------------------------
  // A distributed attack on one account is capped even though no single IP
  // reaches its own limit.
  // -----------------------------------------------------------------------
  {
    const email = `nosuchadmin-${RUN}@example.com`;
    const statuses = [];
    // 13 attempts, each from a genuinely different client IP, so the per-IP
    // limit never fires. The per-account limit (10) has to be what stops it.
    for (let i = 1; i <= 13; i++) {
      statuses.push(await attempt({ proxyRight: `10.${RUN}.2.${i}`, email }));
    }
    ok(statuses.includes(429), "13 attempts on one account from 13 distinct IPs are eventually blocked");
    eq(statuses.filter((s) => s === 401).length, 10, "exactly the account budget of 10 is allowed");
    ok(statuses.slice(10).every((s) => s === 429), "the remaining attempts are blocked");
  }

  // -----------------------------------------------------------------------
  // The account limit must not become a lockout weapon.
  // -----------------------------------------------------------------------
  {
    // Burn the real admin account's failure budget from scattered IPs.
    for (let i = 1; i <= 12; i++) {
      await attempt({ proxyRight: `10.${RUN}.3.${i}` });
    }
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.${RUN}.4.1` },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    // The password is checked before the account counter is touched, so a
    // correct password still gets in. Without this, anyone could lock the shop
    // owner out of their own admin console with a dozen bad guesses.
    eq(res.status, 200, "the correct password still works after the account budget is spent");
  }

  // -----------------------------------------------------------------------
  // Successful sign-ins must not consume the budget at all.
  // -----------------------------------------------------------------------
  {
    let allOk = true;
    // Well past the account limit of 10. Each from a different IP so the per-IP
    // limit isn't what's being measured.
    for (let i = 1; i <= 12; i++) {
      const res = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.${RUN}.5.${i}` },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      if (res.status !== 200) allOk = false;
    }
    ok(allOk, "12 consecutive successful logins are never throttled");
  }

  // -----------------------------------------------------------------------
  // A blocked response has to tell the caller when to come back.
  // -----------------------------------------------------------------------
  {
    const realIp = `10.${RUN}.6.5`;
    let blocked = null;
    for (let i = 1; i <= 10 && !blocked; i++) {
      const res = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": realIp },
        body: JSON.stringify({ email: `other-${RUN}@example.com`, password: "wrong" }),
      });
      if (res.status === 429) blocked = res;
    }
    ok(blocked !== null, "the per-IP limit fires without any forwarded-for games");
    if (blocked) {
      const retry = Number(blocked.headers.get("retry-after"));
      ok(Number.isFinite(retry) && retry > 0, "a 429 carries a positive Retry-After");
      ok(retry <= 15 * 60, "Retry-After is within the configured window, so the block is not permanent");
      const body = await blocked.json().catch(() => ({}));
      ok(typeof body.error === "string" && body.error.length > 0, "a 429 explains itself in the body");
      ok(
        !/rate|bucket|redis|postgres|sql/i.test(body.error),
        "the 429 message doesn't leak how the limiter is implemented"
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
