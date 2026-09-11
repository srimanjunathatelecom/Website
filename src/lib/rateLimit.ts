import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Rate limiting for login, OTP, payment and public write endpoints.
 *
 * Two things were wrong with the previous version, and the second one made the
 * first irrelevant.
 *
 * 1. The counters lived in a Map in one process, so limits were per-instance and
 *    reset on every deploy. Behind a load balancer an attacker gets a fresh
 *    budget per instance, and a restart hands out a fresh budget to everyone.
 *
 * 2. `clientIp` returned the FIRST entry of `x-forwarded-for`, which is supplied
 *    by the caller. Sending `X-Forwarded-For: <random>` on each request produced
 *    a new bucket every time, so the limits did not apply to anyone who knew
 *    that. Verified before this change: nine wrong admin passwords with a
 *    rotating header returned nine 401s and no 429, while the same nine without
 *    it were blocked on the ninth.
 *
 * Now: counters live in Postgres so every instance shares them, and the client
 * IP is read from the right end of the forwarded chain.
 */

// ---------------------------------------------------------------------------
// Client IP
// ---------------------------------------------------------------------------

/**
 * How many proxies of your own sit in front of the app. Everything up to this
 * many hops from the right of `x-forwarded-for` is trusted; anything further
 * left was potentially written by the client and is ignored.
 *
 * Why the right and not the left: each proxy appends the address it received the
 * connection from. A client that sends `X-Forwarded-For: 1.2.3.4` to a single
 * proxy produces `1.2.3.4, <real client ip>` — the value the client invented
 * ends up leftmost, and the address our own proxy observed ends up rightmost.
 * Reading from the left means reading the attacker's input.
 *
 * Default 1, which is correct for the usual single load balancer or CDN. Set
 * TRUSTED_PROXY_HOPS=2 if you run, say, Cloudflare in front of your own nginx.
 * Set it to 0 only if nothing proxies the app, in which case the header is
 * ignored entirely.
 */
const TRUSTED_PROXY_HOPS = (() => {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(raw) && raw >= 0 ? raw : 1;
})();

/**
 * Best-effort client IP, used as part of the rate-limit key.
 *
 * Returns "unknown" when no trustworthy value is available. That is deliberately
 * a single shared bucket rather than a random one: if we cannot tell callers
 * apart, throttling them together is the safe failure, while inventing a unique
 * key per request would silently disable the limit.
 */
export function clientIp(req: Request): string {
  const h = req.headers;

  if (TRUSTED_PROXY_HOPS > 0) {
    const chain = (h.get("x-forwarded-for") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (chain.length > 0) {
      // Walk in from the right by the number of hops we own. If the chain is
      // shorter than expected, the leftmost entry is the closest we have.
      const idx = Math.max(0, chain.length - TRUSTED_PROXY_HOPS);
      return chain[idx];
    }
    // Set by nginx and several hosted platforms, and not part of a chain, so
    // there is nothing to pick apart.
    const real = h.get("x-real-ip");
    if (real) return real.trim();
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Counter storage
// ---------------------------------------------------------------------------

type Result = { allowed: boolean; remaining: number; retryAfterMs: number };

/**
 * In-memory counters, kept only as a fallback for when the database cannot be
 * reached.
 *
 * The alternative on a database error is to fail open, which turns a brief
 * connection blip into an unthrottled window on the login endpoint, or to fail
 * closed, which locks every customer out over the same blip. Falling back to a
 * per-instance counter is weaker than the shared one but far better than either:
 * an attacker still has to get past a limit, and legitimate users still get in.
 */
const localBuckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = Date.now();

function checkLocal(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();

  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of localBuckets) if (b.resetAt < now) localBuckets.delete(k);
  }

  const existing = localBuckets.get(key);
  if (!existing || existing.resetAt < now) {
    localBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/** Expired rows are pruned occasionally rather than on every request. */
let lastPrune = 0;
async function pruneOccasionally() {
  const now = Date.now();
  if (now - lastPrune < 300_000) return;
  lastPrune = now;
  try {
    await db.execute(sql`delete from rate_limits where reset_at < now()`);
  } catch {
    // Housekeeping only. A failure here costs some dead rows, nothing more.
  }
}

/**
 * Check and increment a rate-limit bucket.
 *
 * @param key      Identifies the limit, e.g. `admin-login:<ip>`.
 * @param limit    Attempts allowed per window.
 * @param windowMs Window length in milliseconds.
 *
 * The counter is incremented in a single statement, so two simultaneous
 * requests cannot both read "7 of 8" and both proceed. Doing this as a
 * SELECT-then-UPDATE would leave exactly that race on the endpoint where it
 * matters most.
 *
 * Blocked requests still increment. The window is not extended by them (reset_at
 * is left alone once set), so hammering the endpoint cannot lengthen the
 * lockout, but it also means an attacker gets no signal from the count.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<Result> {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const rows = await db.execute(sql`
      insert into rate_limits (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${windowSec}))
      on conflict (key) do update set
        count = case
          when rate_limits.reset_at < now() then 1
          else rate_limits.count + 1
        end,
        reset_at = case
          when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSec})
          else rate_limits.reset_at
        end
      returning count, reset_at
    `);

    // node-postgres returns { rows }, but drizzle's execute is typed loosely
    // enough across drivers that this needs normalising.
    const row = (Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] })?.rows?.[0]) as
      | { count: number | string; reset_at: string | Date }
      | undefined;

    if (!row) throw new Error("rate_limits upsert returned no row");

    const count = Number(row.count);
    const resetAt = new Date(row.reset_at).getTime();

    void pruneOccasionally();

    if (count > limit) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, resetAt - Date.now()) };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
  } catch {
    // See checkLocal: degraded, per-instance, still a limit.
    return checkLocal(key, limit, windowMs);
  }
}

/**
 * Hand back one slot, for endpoints that only want to limit FAILURES.
 *
 * The counter is incremented before the work (atomically, see above), so an
 * endpoint that shouldn't charge successful requests refunds the slot
 * afterwards. Increment-then-refund keeps the check race-free — a peek-only
 * check would let N parallel requests through the same last slot.
 *
 * Used by admin login: brute force burns the budget, but a team signing in
 * and out from one office IP all day never locks itself out.
 */
export async function refundRateLimit(key: string): Promise<void> {
  try {
    await db.execute(sql`
      update rate_limits
         set count = greatest(count - 1, 0)
       where key = ${key} and reset_at > now()
    `);
  } catch {
    const b = localBuckets.get(key);
    if (b && b.resetAt > Date.now()) b.count = Math.max(0, b.count - 1);
  }
}

/** Standard 429 for a blocked request. */
export function rateLimitedResponse(retryAfterMs: number) {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: "Too many attempts. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
