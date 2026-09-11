import { db } from "@/db";
import { orderItems, orders, products, reviews, reviewVotes } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * True when this customer has actually ordered this product. Used to set the
 * "Verified Purchase" flag — computed server-side from real order history so
 * the badge can't be claimed by the client, and so it never appears on a
 * review from someone who didn't buy the product.
 */
async function hasPurchased(customerId: number, productId: number) {
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.customerId, customerId), eq(orderItems.productId, productId)))
    .limit(1);
  return !!row;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("productId"));

  // No productId: the admin console's moderation view — the latest reviews
  // across the whole catalogue, with the product name joined in so the owner
  // doesn't have to cross-reference ids. Admin-gated because it exposes
  // customer names and review contents store-wide in one call.
  if (!productId) {
    const admin = await getCurrentAdmin();
    if (!admin) return Response.json({ items: [], total: 0, breakdown: null });
    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: reviews.id,
          productId: reviews.productId,
          productName: products.name,
          productSlug: products.slug,
          customerName: reviews.customerName,
          rating: reviews.rating,
          title: reviews.title,
          body: reviews.body,
          images: reviews.images,
          verifiedPurchase: reviews.verifiedPurchase,
          helpfulCount: reviews.helpfulCount,
          createdAt: reviews.createdAt,
        })
        .from(reviews)
        .leftJoin(products, eq(products.id, reviews.productId))
        .orderBy(desc(reviews.createdAt))
        .limit(100),
      db.select({ count: sql<number>`count(*)::int` }).from(reviews),
    ]);
    return Response.json({ items: rows, total: totals?.count ?? 0, scope: "admin" });
  }

  // Optional paging for the PDP's "Load more reviews" control. Without a
  // limit the page had to ship every review for a product in the initial
  // payload, which grows without bound on popular items.
  const limitParam = Number(url.searchParams.get("limit"));
  const offsetParam = Number(url.searchParams.get("offset"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 50;
  const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

  const [rows, [totals], starRows] = await Promise.all([
    db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(${reviews.rating}), 0)::float` })
      .from(reviews)
      .where(eq(reviews.productId, productId)),
    // Rating histogram computed in SQL over ALL reviews, not just the page
    // being displayed — a breakdown derived from one page would be wrong.
    db
      .select({ rating: reviews.rating, count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .groupBy(reviews.rating),
  ]);

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of starRows) {
    if (r.rating >= 1 && r.rating <= 5) breakdown[r.rating] = r.count;
  }

  // Which of these reviews the signed-in shopper has already marked helpful,
  // so the button can render in its correct state after a reload instead of
  // relying on browser-local state that can drift from the database.
  let votedIds: number[] = [];
  const customer = await getCurrentCustomer();
  if (customer && rows.length) {
    const voted = await db
      .select({ reviewId: reviewVotes.reviewId })
      .from(reviewVotes)
      .where(eq(reviewVotes.customerId, customer.id));
    const set = new Set(voted.map((v) => v.reviewId));
    votedIds = rows.filter((r) => set.has(r.id)).map((r) => r.id);
  }

  return Response.json({
    items: rows,
    total: totals?.count ?? 0,
    average: totals?.avg ?? 0,
    breakdown,
    votedIds,
    myReviewId: customer ? rows.find((r) => r.customerId === customer.id)?.id ?? null : null,
  });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in to review." }, { status: 401 });

  // Signed in, but one account can still flood a product with reviews.
  // 10 per customer per hour is far above honest use.
  const rl = await checkRateLimit(`review:${customer.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);
  const b = await req.json();
  const productId = Number(b.productId);
  if (!productId) return Response.json({ error: "Product required." }, { status: 400 });

  const rating = Math.min(5, Math.max(1, Number(b.rating) || 5));
  const body = String(b.body || "").trim();
  const title = String(b.title || "").trim();

  // One review per customer per product — resubmitting updates the
  // existing review instead of creating a duplicate entry that would
  // inflate the review count and skew the average rating.
  const [existing] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.customerId, customer.id)));

  const values = {
    rating,
    title: title.slice(0, 160),
    body: body.slice(0, 4000),
    // Only keep entries that look like usable image references — an http(s)
    // URL, a site-relative path, or the data:image URL the no-R2 upload
    // fallback produces. Anything else (javascript:, file:, plain junk) is
    // dropped rather than stored and served back to every visitor. An empty
    // or malformed list is stored as "" so the PDP simply renders no photos.
    images: Array.isArray(b.images)
      ? JSON.stringify(
          b.images
            .filter(
              (u: unknown): u is string =>
                typeof u === "string" && /^(https?:\/\/|\/(?!\/)|data:image\/)/.test(u.trim())
            )
            .map((u: string) => u.trim())
            .slice(0, 6)
        )
      : "",
    // Recomputed on every submit: a shopper who reviews first and buys later
    // gets the badge once their order exists, without any manual step.
    verifiedPurchase: await hasPurchased(customer.id, productId),
  };

  if (existing) {
    await db.update(reviews).set(values).where(eq(reviews.id, existing.id));
    return Response.json({ ok: true, updated: true });
  }

  await db.insert(reviews).values({
    productId,
    customerId: customer.id,
    customerName: customer.name,
    ...values,
  });
  return Response.json({ ok: true });
}

// PATCH /api/reviews  { id, helpful: true }
// Marks a review helpful. The unique index on (review_id, customer_id) is what
// actually enforces one vote per person — a repeat click is reported back as
// "already voted" rather than incrementing the count again.
export async function PATCH(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in to vote." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Review id required." }, { status: 400 });

  const [row] = await db.select().from(reviews).where(eq(reviews.id, id));
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  if (row.customerId === customer.id) {
    return Response.json({ error: "You can't mark your own review as helpful." }, { status: 400 });
  }

  const inserted = await db
    .insert(reviewVotes)
    .values({ reviewId: id, customerId: customer.id })
    .onConflictDoNothing()
    .returning({ id: reviewVotes.id });

  if (inserted.length === 0) {
    return Response.json({ ok: true, already: true, helpfulCount: row.helpfulCount });
  }

  // Increment in SQL rather than read-modify-write, so simultaneous votes
  // can't overwrite each other's result.
  const [updated] = await db
    .update(reviews)
    .set({ helpfulCount: sql`${reviews.helpfulCount} + 1` })
    .where(eq(reviews.id, id))
    .returning({ helpfulCount: reviews.helpfulCount });

  return Response.json({ ok: true, helpfulCount: updated?.helpfulCount ?? row.helpfulCount + 1 });
}

export async function DELETE(req: Request) {
  // Admin moderation: remove a review (spam, abusive, fake). A customer
  // can also delete their own review — but never someone else's.
  const admin = await getCurrentAdmin();
  const customer = await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Review id required." }, { status: 400 });

  const [row] = await db.select().from(reviews).where(eq(reviews.id, id));
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });
  if (!admin && row.customerId !== customer!.id) {
    return Response.json({ error: "You can only delete your own review." }, { status: 403 });
  }

  await db.delete(reviews).where(eq(reviews.id, id));
  // Votes on a deleted review would otherwise linger and block a future
  // review that happens to reuse the id.
  await db.delete(reviewVotes).where(eq(reviewVotes.reviewId, id));
  return Response.json({ ok: true });
}
