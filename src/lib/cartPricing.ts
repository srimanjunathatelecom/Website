import { and, eq } from "drizzle-orm";
import { products, productVariants } from "@/db/schema";
import { variantLabel } from "@/lib/productContent";

/**
 * Resolving a cart line against the database.
 *
 * The cart lives in the browser's localStorage, which means every price, stock
 * count and product name in it is a snapshot taken whenever the shopper pressed
 * "Add to cart" — possibly days ago, and possibly before the shop owner edited
 * the product. Two separate places need to turn those stale lines back into
 * authoritative ones:
 *
 *   - POST /api/orders, which must charge the real price and refuse anything
 *     unavailable, and
 *   - POST /api/cart/validate, which the checkout page calls on load so the
 *     shopper is told what changed *before* they pay.
 *
 * Those two had drifted apart, which is the whole reason this file exists: the
 * order route resolved prices correctly but the checkout page displayed the
 * localStorage snapshot, so a price edited between add-to-cart and checkout was
 * charged silently at the new amount while the page still showed the old one.
 * Keeping one resolver means the total the shopper is shown and the total they
 * are charged cannot disagree again.
 *
 * The resolver deliberately *reports* problems instead of throwing. The order
 * route turns a refusal into an error the checkout displays; the validate route
 * turns the same refusal into a line the shopper is asked to remove. Throwing
 * here would have forced one of the two to catch and unpick its own control
 * flow.
 */

/**
 * Upper bound on a single line item. Deliberately generous for a genuine
 * customer and far below the point where one request can reserve a shop's
 * entire stock of something.
 */
export const MAX_QTY_PER_ITEM = 20;

/** A cart line as it arrives from the browser — every field untrusted. */
export type CartLineInput = {
  productId?: unknown;
  variantId?: unknown;
  qty?: unknown;
};

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

export type ResolvedLine = {
  product: ProductRow;
  variant: VariantRow | null;
  qty: number;
  /** Authoritative prices: the variant's own when one was chosen. */
  mrp: number;
  mop: number;
  variantLabel: string;
  sku: string;
  /** Stock actually available for this line (the variant's, when applicable). */
  stock: number;
};

export type LineResolution =
  | ({ ok: true } & ResolvedLine)
  | { ok: false; reason: string };

/**
 * Anything that can run a select: the live `db` handle or a transaction. Typed
 * structurally so this file doesn't have to import Drizzle's transaction type,
 * which changes shape between versions.
 */
type Selector = {
  select: (...args: never[]) => any;
};

/** Whole numbers only, at least one, no more than the per-line cap. */
export function quantityProblem(raw: unknown): string | null {
  const qty = Number(raw);
  if (!Number.isInteger(qty) || qty < 1) {
    return "Please choose a whole quantity of at least 1 for every item.";
  }
  if (qty > MAX_QTY_PER_ITEM) {
    return `You can order up to ${MAX_QTY_PER_ITEM} of any single item. Please contact us for bulk orders.`;
  }
  return null;
}

/**
 * Re-read one cart line from the database and return the real product, variant
 * and prices — or the reason it can no longer be ordered.
 */
export async function resolveCartLine(
  exec: Selector,
  line: CartLineInput
): Promise<LineResolution> {
  const qtyProblem = quantityProblem(line.qty);
  if (qtyProblem) return { ok: false, reason: qtyProblem };
  const qty = Number(line.qty);

  const pid = Number(line.productId);
  if (!Number.isInteger(pid) || pid < 1) {
    return { ok: false, reason: "A product in your cart is no longer available." };
  }

  const [p] = await exec.select().from(products).where(eq(products.id, pid));
  if (!p) return { ok: false, reason: "A product in your cart is no longer available." };

  // A product the owner has unpublished should not be orderable just because it
  // is still sitting in somebody's cart from when it was live.
  if (p.status !== "active") {
    return { ok: false, reason: `"${p.name}" is no longer available.` };
  }
  if (p.stock < qty) {
    return { ok: false, reason: `"${p.name}" is out of stock or low on stock.` };
  }

  let variant: VariantRow | null = null;
  if (line.variantId != null && line.variantId !== 0) {
    const vid = Number(line.variantId);
    if (!Number.isInteger(vid) || vid < 1) {
      return { ok: false, reason: `The selected option for "${p.name}" is no longer available.` };
    }
    const [v] = await exec
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, vid), eq(productVariants.productId, p.id)));
    if (!v) {
      return { ok: false, reason: `The selected option for "${p.name}" is no longer available.` };
    }
    if (!v.available) {
      return { ok: false, reason: `The selected option for "${p.name}" is no longer sold.` };
    }
    if (v.stock < qty) {
      return { ok: false, reason: `The selected option for "${p.name}" is out of stock.` };
    }
    variant = v;
  }

  return {
    ok: true,
    product: p,
    variant,
    qty,
    mrp: Number(variant ? variant.mrp : p.mrp),
    mop: Number(variant ? variant.mop : p.mop),
    // The shared label helper, so the wording on the invoice matches what the
    // shopper saw on the product page and in the cart. The order route used to
    // keep its own copy that joined RAM and storage with "/" while every other
    // surface used "+", so the same phone read "8 GB + 256 GB" in the cart and
    // "8 GB / 256 GB" on the invoice.
    variantLabel: variant ? variantLabel(variant) : "",
    sku: variant?.sku || p.sku || "",
    stock: variant ? variant.stock : p.stock,
  };
}
