/**
 * Shared client-side reader for /api/auth/me.
 *
 * Two problems this solves:
 *
 * 1. The product page called /api/wishlist on mount for every visitor. For a
 *    guest that endpoint correctly answers 401, but the browser still logs a
 *    red console error on every product view and the server still does the
 *    session lookup for nothing. Callers can now check for a customer first
 *    and skip the request entirely.
 *
 * 2. Several components each fetched /api/auth/me independently, so pages that
 *    render more than one of them (the header plus checkout, for example) asked
 *    the server the same question twice on the same page load.
 *
 * The result is cached briefly rather than forever: long enough to collapse the
 * duplicate calls that happen within a single page load, short enough that
 * signing in or out is never reflected stale. `clearSession()` is available for
 * call sites that mutate the session and want the next read to be immediate.
 */

export type SessionUser = { id: number; name: string; email: string; phone?: string | null };
export type SessionInfo = {
  customer: SessionUser | null;
  admin: { id: number; name: string; email: string; role: string } | null;
};

const TTL_MS = 5_000;

let cached: { at: number; promise: Promise<SessionInfo> } | null = null;

export function fetchSession(): Promise<SessionInfo> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.promise;

  const promise = fetch("/api/auth/me", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { customer: null, admin: null }))
    .then((d): SessionInfo => ({ customer: d?.customer ?? null, admin: d?.admin ?? null }))
    .catch((): SessionInfo => ({ customer: null, admin: null }));

  cached = { at: now, promise };
  return promise;
}

/** Drop the cached answer, so the next fetchSession() hits the server. */
export function clearSession() {
  cached = null;
}
