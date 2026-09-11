/**
 * Shared client-side wishlist state.
 *
 * The wishlist lives on the server (it is per-customer, not per-device), but
 * every component that drew a heart was deciding on its own whether that heart
 * should be filled. ProductDetailClient fetched /api/wishlist and got it right;
 * ProductCard initialised `wished` to false and never fetched anything, so it
 * always got it wrong. The same phone therefore showed a filled heart on its
 * product page and an empty heart on the homepage.
 *
 * That was not merely cosmetic. Because the card believed nothing was
 * wishlisted, the first click POSTed — which the API treats as a no-op for an
 * item already saved — and flipped the local icon to "filled", so it looked
 * like it had just been added. The second click then DELETEd, silently removing
 * an item the shopper thought they were adding.
 *
 * So the state is fetched once per page load and shared. Two things this has to
 * get right that a naive per-component fetch does not:
 *
 *  - A homepage renders around forty cards at once. A fetch per card would mean
 *    forty identical requests, so the in-flight promise is memoised at module
 *    level and every caller awaits the same one.
 *  - Guests get 401 from this endpoint by design, and the browser logs a red
 *    console error for it. lib/session.ts was written to solve precisely that
 *    for the product page, so the session is checked first and the wishlist
 *    request is skipped entirely for anyone not signed in.
 *
 * Subscription deliberately mirrors lib/compare.ts — a window event that
 * components already know how to listen for — rather than introducing a store
 * or context for one boolean per product.
 */

import { fetchSession } from "./session";

const CHANGE_EVENT = "sms-wishlist-change";

/** Product ids known to be wishlisted. Empty until the first load resolves. */
let ids = new Set<number>();

/** null = not attempted yet, otherwise the in-flight or settled load. */
let loadPromise: Promise<void> | null = null;

/** True once the server has said 401. Guests stop re-requesting after that. */
let isGuest = false;

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Kicks off the single shared load if it has not happened yet. Safe to call
 * from every card's effect; only the first call does any work.
 */
export function ensureWishlistLoaded(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (isGuest) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Ask who this is before asking what they saved. The session read is
      // shared and briefly cached, so this costs nothing on a page that
      // already needed it, and it keeps a logged-out visitor from firing a
      // request that can only answer 401.
      const session = await fetchSession();
      if (!session.customer) {
        isGuest = true;
        return;
      }

      const r = await fetch("/api/wishlist");
      if (r.status === 401) {
        // Expected for a logged-out visitor, not an error worth retrying.
        isGuest = true;
        return;
      }
      if (!r.ok) return;
      const data = await r.json();
      const items: unknown = data?.items;
      if (Array.isArray(items)) {
        ids = new Set(
          items
            .map((it: { id?: number; productId?: number }) =>
              // getWishlist returns product rows, so the product id is `id`.
              // `productId` is accepted as well so a change in that query's
              // shape degrades to an empty heart rather than a wrong one.
              Number(it?.id ?? it?.productId),
            )
            .filter((n) => Number.isFinite(n)),
        );
        announce();
      }
    } catch {
      // Offline or aborted. Hearts stay empty, which is the honest default,
      // and the next toggle still reaches the server.
    }
  })();

  return loadPromise;
}

export function isWishlisted(productId: number): boolean {
  return ids.has(productId);
}

export type WishlistToggleResult = "added" | "removed" | "unauthorized" | "error";

/**
 * Adds or removes a product, updating shared state optimistically and rolling
 * back if the server rejects it, so a failed request cannot leave every card on
 * the page showing a state the database does not agree with.
 */
export async function toggleWishlist(productId: number): Promise<WishlistToggleResult> {
  // Same reasoning as the load: a guest's write can only 401, so answer from
  // the session and let the caller send them to login without a failed request.
  const session = await fetchSession();
  if (!session.customer) {
    isGuest = true;
    return "unauthorized";
  }

  const wasWishlisted = ids.has(productId);
  const method = wasWishlisted ? "DELETE" : "POST";

  if (wasWishlisted) ids.delete(productId);
  else ids.add(productId);
  announce();

  try {
    const r = await fetch("/api/wishlist", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });

    if (r.status === 401) {
      if (wasWishlisted) ids.add(productId);
      else ids.delete(productId);
      isGuest = true;
      announce();
      return "unauthorized";
    }

    if (!r.ok) throw new Error(String(r.status));

    // A successful call proves there is a session, so a previously-cached
    // guest verdict is stale and the list should be re-read on next demand.
    if (isGuest) {
      isGuest = false;
      loadPromise = null;
    }
    return wasWishlisted ? "removed" : "added";
  } catch {
    if (wasWishlisted) ids.add(productId);
    else ids.delete(productId);
    announce();
    return "error";
  }
}

/** Lets a component subscribe without hardcoding the event name. */
export function onWishlistChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

/**
 * Called by views that mutate the wishlist through their own fetch (the
 * wishlist page, the account dashboard) so cards elsewhere do not keep a
 * removed item looking saved.
 */
export function markWishlistStale() {
  loadPromise = null;
  ensureWishlistLoaded();
}
