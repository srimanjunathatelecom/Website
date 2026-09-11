import { db } from "@/db";
import { getCurrentCustomer } from "@/lib/auth";
import { resolveCartLine, type CartLineInput } from "@/lib/cartPricing";

export const dynamic = "force-dynamic";

/**
 * Re-price a cart against the database.
 *
 * The cart is localStorage, so its prices and stock counts are a snapshot from
 * whenever the shopper pressed "Add to cart". The order endpoint has always
 * re-read the real prices before charging, which stopped a tampered client
 * setting its own price — but the checkout page went on displaying the snapshot,
 * so a product repriced in the admin console between add-to-cart and checkout
 * was charged at the new amount while the page still showed the old one. With
 * online payment that means the gateway collects a figure the shopper was never
 * shown.
 *
 * This route closes that gap by giving the checkout page the same numbers the
 * order endpoint will use, so it can say what changed before anyone pays. It
 * shares resolveCartLine with the order endpoint precisely so the two cannot
 * disagree.
 *
 * Read-only: it writes nothing, holds no stock and creates no order.
 */
export async function POST(req: Request) {
  // Checkout is behind sign-in, so this is too. It isn't sensitive data — every
  // price here is on the public product page — but there is no reason to offer
  // an unauthenticated endpoint that runs a database query per posted line.
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw) return Response.json({ error: "Expected an items array." }, { status: 400 });

  // A cap on the number of lines, matching nothing in particular except the
  // observation that a genuine cart is small and an unbounded array here is one
  // database round-trip per element.
  if (raw.length > 50) {
    return Response.json({ error: "Too many items to validate at once." }, { status: 400 });
  }

  const lines: {
    productId: number;
    variantId: number | null;
    name: string;
    variantLabel: string;
    /** Null when the line can no longer be ordered at all. */
    mrp: number | null;
    mop: number | null;
    stock: number | null;
    /** Why it can't be ordered, ready to show the shopper. */
    unavailableReason: string | null;
  }[] = [];

  for (const item of raw as CartLineInput[]) {
    const resolved = await resolveCartLine(db, item);
    const productId = Number(item?.productId) || 0;
    const variantId = item?.variantId == null ? null : Number(item.variantId) || null;

    if (!resolved.ok) {
      lines.push({
        productId,
        variantId,
        name: "",
        variantLabel: "",
        mrp: null,
        mop: null,
        stock: null,
        unavailableReason: resolved.reason,
      });
      continue;
    }

    lines.push({
      productId: resolved.product.id,
      variantId: resolved.variant ? resolved.variant.id : null,
      name: resolved.product.name,
      variantLabel: resolved.variantLabel,
      mrp: resolved.mrp,
      mop: resolved.mop,
      stock: resolved.stock,
      unavailableReason: null,
    });
  }

  return Response.json({ lines });
}
