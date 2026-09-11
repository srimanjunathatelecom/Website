import { db } from "@/db";
import { stockAlerts, products, productVariants } from "@/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

// Deliberately simple: enough to reject obvious junk without bouncing real
// addresses. The email is only ever used to send one restock note.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST — public "notify me when back" box on an out-of-stock product page.
 * Body: { productId, variantId?, email, website? (honeypot) }
 */
export async function POST(req: Request) {
  try {
    // Same budget as the newsletter box: 5 per IP per 10 minutes. This is a
    // public unauthenticated write, so it must be throttled.
    const rl = await checkRateLimit(`stock-alert:${clientIp(req)}`, 5, 10 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const b = await req.json().catch(() => ({}));

    // Honeypot — see /api/contact. A filled hidden field means a bot; answer
    // success and store nothing.
    if (String(b.website || "").trim()) {
      return Response.json({ ok: true, message: "You'll get one email when it's back." });
    }

    const email = String(b.email || "").trim().toLowerCase();
    const productId = Number(b.productId);
    const variantIdRaw = b.variantId == null ? null : Number(b.variantId);
    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!Number.isInteger(productId) || productId <= 0) {
      return Response.json({ error: "Invalid product." }, { status: 400 });
    }
    if (variantIdRaw != null && (!Number.isInteger(variantIdRaw) || variantIdRaw <= 0)) {
      return Response.json({ error: "Invalid variant." }, { status: 400 });
    }

    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product || product.status !== "active") {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }

    // Only accept alerts for things that are actually out of stock — an alert
    // on an in-stock item would never fire (the 0→>0 transition already
    // happened) and just confuses the customer.
    let variantId: number | null = null;
    if (variantIdRaw != null) {
      const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantIdRaw));
      if (!v || v.productId !== productId) {
        return Response.json({ error: "Variant not found." }, { status: 404 });
      }
      if (v.stock > 0 && v.available) {
        return Response.json({ error: "This variant is already in stock." }, { status: 409 });
      }
      variantId = v.id;
    } else if (product.stock > 0) {
      return Response.json({ error: "This product is already in stock." }, { status: 409 });
    }

    // The partial unique index (pending rows only) makes duplicates a silent
    // no-op — the customer just sees the same success message again.
    await db
      .insert(stockAlerts)
      .values({ productId, variantId, email })
      .onConflictDoNothing();

    return Response.json({ ok: true, message: "You'll get one email when it's back." });
  } catch (err) {
    reportError(err, "api/stock-alerts");
    return Response.json({ error: "Could not save your alert. Please try again." }, { status: 500 });
  }
}

/**
 * GET — admin: pending alerts with product names, most recent first, plus
 * counts. This is how the shop sees demand for out-of-stock items.
 */
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: stockAlerts.id,
      productId: stockAlerts.productId,
      variantId: stockAlerts.variantId,
      email: stockAlerts.email,
      createdAt: stockAlerts.createdAt,
      productName: products.name,
    })
    .from(stockAlerts)
    .leftJoin(products, eq(products.id, stockAlerts.productId))
    .where(isNull(stockAlerts.notifiedAt))
    .orderBy(desc(stockAlerts.createdAt))
    .limit(500);

  const [{ c: notified }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(stockAlerts)
    .where(and(sql`${stockAlerts.notifiedAt} is not null`));

  return Response.json({ pending: rows, pendingCount: rows.length, notifiedCount: notified });
}

/**
 * DELETE ?id=N — admin removes a pending request (customer asked over the
 * counter, address is junk, or the product is being discontinued). Deleting
 * is the only edit that makes sense here: the row is a customer's email plus
 * a product id, and "editing" someone else's email would just corrupt it.
 */
export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Valid id required." }, { status: 400 });
  }

  const deleted = await db.delete(stockAlerts).where(eq(stockAlerts.id, id)).returning({ id: stockAlerts.id });
  if (!deleted.length) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ ok: true });
}
