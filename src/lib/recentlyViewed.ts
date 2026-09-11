// Recently viewed products.
//
// Only product IDs are persisted locally — names, prices, stock and images are
// always re-read from the API so the rail can never show a stale price or a
// product that has since been unpublished.

const KEY = "sms-recently-viewed";
const MAX = 12;

export function getRecentlyViewed(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX);
  } catch {
    return [];
  }
}

/** Most-recent-first, de-duplicated, capped. */
export function pushRecentlyViewed(productId: number): number[] {
  if (typeof window === "undefined") return [];
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) return getRecentlyViewed();
  const next = [id, ...getRecentlyViewed().filter((n) => n !== id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked (private mode) — the rail simply stays empty.
  }
  return next;
}
