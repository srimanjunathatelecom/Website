/**
 * Deal-of-the-day selection: a deterministic daily rotation over the live
 * discounted list. Uses the day number in IST so every visitor sees the
 * same product and it changes at the store's midnight, not UTC's.
 *
 * Lives in lib (not in the page component) so the current-time read is an
 * explicit data-selection step, like the date-window checks in queries.ts,
 * rather than an impure call inside a component render.
 */
export function pickDailyDrop<T extends { stock: number }>(deals: T[], now = Date.now()): T | undefined {
  const inStock = deals.filter((d) => d.stock > 0);
  if (inStock.length === 0) return undefined;
  const istDayNumber = Math.floor((now + 5.5 * 3600 * 1000) / 86400000);
  return inStock[istDayNumber % inStock.length];
}
