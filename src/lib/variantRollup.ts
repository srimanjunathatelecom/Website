import { db } from "@/db";
import { products, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Keeps a variant product's own row a faithful roll-up of its variants.
 *
 * Why this exists
 * ---------------
 * Price and stock live in two places: on the product row, and again on every
 * colour / RAM / storage variant. Listing cards, category rails, search
 * results and the product page's <title> all read the product row, while the
 * product page body prices whatever variant the shopper has selected.
 *
 * Nothing reconciled the two. Editing a phone's price in Admin -> Products &
 * Stock updated only the product row, so the storefront advertised a price
 * (card, rail, SEO title) that no variant actually sold at: a card reading
 * "Rs 21,499" opened a product page charging Rs 22,999. That is the worst
 * class of pricing bug — the shopper is shown a number they cannot buy at,
 * and the store owner has no way to tell it happened.
 *
 * The variants are the only purchasable things, so they are treated as the
 * source of truth and the product row is recomputed from them:
 *
 *   - mop / mrp come from the cheapest variant a shopper can actually buy,
 *     which makes the listed price a real "starting from" price.
 *   - stock becomes the total sellable stock across variants, so scarcity
 *     badges on cards agree with what the product page allows.
 *
 * Called after any write that can change the set of variants or the product
 * row itself. Products with no variants are left completely untouched, so
 * accessories keep behaving exactly as before.
 */
export async function syncProductRowFromVariants(productId: number): Promise<void> {
  if (!Number.isFinite(productId)) return;

  const rows = await db
    .select({
      mrp: productVariants.mrp,
      mop: productVariants.mop,
      stock: productVariants.stock,
      available: productVariants.available,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  // No variants: the product row is already the only source of truth.
  if (rows.length === 0) return;

  const num = (v: string | number | null | undefined) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
  };

  const sellable = rows.filter((r) => r.available !== false && (r.stock ?? 0) > 0);
  // Fall back to every variant when the whole product is out of stock, so an
  // out-of-stock phone still shows its real price instead of reverting to a
  // stale one.
  const pricingBasis = sellable.length > 0 ? sellable : rows;

  let cheapest: { mrp: number | null; mop: number } | null = null;
  for (const r of pricingBasis) {
    const mop = num(r.mop);
    if (mop === null || mop <= 0) continue;
    if (!cheapest || mop < cheapest.mop) cheapest = { mrp: num(r.mrp), mop };
  }

  const totalStock = rows.reduce(
    (sum, r) => sum + (r.available !== false ? Math.max(0, r.stock ?? 0) : 0),
    0
  );

  const patch: Record<string, unknown> = { stock: totalStock };
  if (cheapest) {
    patch.mop = cheapest.mop.toFixed(2);
    // Only lift MRP from the variant when it is at least the selling price;
    // a lower or missing variant MRP would invent a negative discount.
    if (cheapest.mrp !== null && cheapest.mrp >= cheapest.mop) {
      patch.mrp = cheapest.mrp.toFixed(2);
    }
  }

  await db.update(products).set(patch).where(eq(products.id, productId));
}
