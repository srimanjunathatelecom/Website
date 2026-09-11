import { db } from "@/db";
import { customers, productQuestions, products } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { createNotification, sendCustomerEmail } from "@/lib/notify";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { siteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "published", "rejected"] as const;
type Status = (typeof STATUSES)[number];

function readStatus(value: unknown): Status | null {
  const s = String(value || "");
  return (STATUSES as readonly string[]).includes(s) ? (s as Status) : null;
}

/**
 * GET /api/questions?productId=12&limit=5&offset=0
 *   Storefront: published questions for one product, newest first, paged.
 *   A signed-in shopper also gets their own still-unpublished questions back
 *   (as `mine`) so they can see that what they asked was received instead of
 *   silently vanishing into the moderation queue.
 *
 * GET /api/questions?status=pending  (admin only)
 *   Moderation queue across all products, with the product name attached.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("productId"));
  const statusParam = url.searchParams.get("status");

  const limitRaw = Number(url.searchParams.get("limit"));
  const offsetRaw = Number(url.searchParams.get("offset"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10;
  const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  // ---- Admin moderation queue ----
  if (statusParam) {
    const admin = await getCurrentAdmin();
    if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const status = readStatus(statusParam);
    const where = status ? eq(productQuestions.status, status) : undefined;

    const [rows, [totals], statusCounts] = await Promise.all([
      db
        .select()
        .from(productQuestions)
        .where(where)
        .orderBy(desc(productQuestions.createdAt))
        .limit(Math.min(limit, 50))
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(productQuestions)
        .where(where),
      // Tab counters, computed in SQL so the admin sees the true size of each
      // queue rather than the size of the page being displayed.
      db
        .select({ status: productQuestions.status, count: sql<number>`count(*)::int` })
        .from(productQuestions)
        .groupBy(productQuestions.status),
    ]);

    // Product names for the queue, resolved in one read instead of per row.
    const ids = Array.from(new Set(rows.map((r) => r.productId)));
    const nameRows = ids.length
      ? await db
          .select({ id: products.id, name: products.name, slug: products.slug })
          .from(products)
          .where(inArray(products.id, ids))
      : [];
    const nameMap = new Map(nameRows.map((p) => [p.id, p]));

    const counts: Record<string, number> = { pending: 0, published: 0, rejected: 0 };
    for (const c of statusCounts) counts[c.status] = c.count;

    return Response.json({
      items: rows.map((r) => ({
        ...r,
        productName: nameMap.get(r.productId)?.name || `Product #${r.productId}`,
        productSlug: nameMap.get(r.productId)?.slug || "",
      })),
      total: totals?.count ?? 0,
      counts,
    });
  }

  // ---- Storefront list ----
  if (!productId) return Response.json({ items: [], total: 0, answered: 0, mine: [] });

  const publishedFilter = and(
    eq(productQuestions.productId, productId),
    eq(productQuestions.status, "published")
  );

  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(productQuestions)
      .where(publishedFilter)
      // Answered questions first: an unanswered one is useful context but a
      // shopper looking for facts should not have to scroll past it.
      .orderBy(
        sql`case when ${productQuestions.answer} = '' then 1 else 0 end`,
        desc(productQuestions.createdAt)
      )
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        answered: sql<number>`count(*) filter (where ${productQuestions.answer} <> '')::int`,
      })
      .from(productQuestions)
      .where(publishedFilter),
  ]);

  const customer = await getCurrentCustomer();
  const mine = customer
    ? await db
        .select()
        .from(productQuestions)
        .where(
          and(
            eq(productQuestions.productId, productId),
            eq(productQuestions.customerId, customer.id),
            sql`${productQuestions.status} <> 'published'`
          )
        )
        .orderBy(desc(productQuestions.createdAt))
        .limit(5)
    : [];

  return Response.json({
    items: rows,
    total: totals?.count ?? 0,
    answered: totals?.answered ?? 0,
    // Rejected questions are reported as such to their author only — the
    // shopper otherwise keeps re-asking something the store declined.
    mine,
    signedIn: !!customer,
  });
}

/**
 * POST /api/questions  { productId, body }
 * A signed-in shopper asks a question. It is stored as 'pending' and does not
 * appear on the product page until an admin publishes it.
 */
export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return Response.json({ error: "Please log in to ask a question." }, { status: 401 });
  }

  // Questions are published on the product page and notify the owner, so a
  // single account should not be able to spray them. 10 per hour.
  const rl = await checkRateLimit(`question:${customer.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const b = await req.json().catch(() => ({}));
  const productId = Number(b.productId);
  const body = String(b.body || "").trim();

  if (!productId) return Response.json({ error: "Product required." }, { status: 400 });
  if (body.length < 10) {
    return Response.json({ error: "Please write a slightly longer question." }, { status: 400 });
  }

  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, productId));
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  const productName = product.name;

  // A shopper with several questions already waiting on the same product is
  // almost always duplicating or spamming; the cap keeps the moderation queue
  // usable without silently discarding anything.
  const [{ waiting }] = await db
    .select({ waiting: sql<number>`count(*)::int` })
    .from(productQuestions)
    .where(
      and(
        eq(productQuestions.productId, productId),
        eq(productQuestions.customerId, customer.id),
        eq(productQuestions.status, "pending")
      )
    );
  if (waiting >= 3) {
    return Response.json(
      { error: "You already have questions awaiting a reply on this product." },
      { status: 429 }
    );
  }

  const [row] = await db
    .insert(productQuestions)
    .values({
      productId,
      customerId: customer.id,
      customerName: customer.name,
      body: body.slice(0, 1000),
      status: "pending",
    })
    .returning();

  // Put the question in the owner's existing notification feed (and their email
  // alerts, if enabled). A question that nobody notices is a lost sale, and the
  // moderation queue is not a page anyone visits speculatively.
  await createNotification(
    "system",
    "New product question",
    `${customer.name} asked about ${productName}: "${body.slice(0, 140)}"`,
    "/admin/questions"
  );

  return Response.json({ ok: true, item: row, pending: true });
}

/**
 * PATCH /api/questions  { id, answer?, status? }   (admin only)
 * Answer and/or moderate a question. Publishing is deliberately separate from
 * answering so a question can be published unanswered, or answered and held
 * back for review.
 */
export async function PATCH(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Question id required." }, { status: 400 });

  const [row] = await db.select().from(productQuestions).where(eq(productQuestions.id, id));
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  const patch: Partial<typeof productQuestions.$inferInsert> = {};

  if (b.answer !== undefined) {
    const answer = String(b.answer || "").trim().slice(0, 2000);
    patch.answer = answer;
    // Attribution and timestamp are set from the signed-in admin and the
    // server clock, never from the request body.
    patch.answeredBy = answer ? admin.name : "";
    patch.answeredAt = answer ? new Date() : null;
  }

  if (b.status !== undefined) {
    const status = readStatus(b.status);
    if (!status) return Response.json({ error: "Unknown status." }, { status: 400 });
    patch.status = status;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  const [updated] = await db
    .update(productQuestions)
    .set(patch)
    .where(eq(productQuestions.id, id))
    .returning();

  // Tell the shopper their question was answered — but only on the transition
  // that actually makes the answer visible to them, so correcting a typo in a
  // published answer doesn't email them again. Delivery is best-effort: a
  // missing SMTP config or a bounced address must not fail the moderation
  // action that already succeeded.
  const nowPublished = updated.status === "published" && !!updated.answer;
  const wasVisibleAnswer = row.status === "published" && !!row.answer;
  if (nowPublished && !wasVisibleAnswer) {
    const [asker] = await db
      .select({ email: customers.email, name: customers.name })
      .from(customers)
      .where(eq(customers.id, updated.customerId));
    const [prod] = await db
      .select({ name: products.name, slug: products.slug })
      .from(products)
      .where(eq(products.id, updated.productId));
    if (asker?.email) {
      // Same env fallback the sitemap/metadata use, so the email links to the
      // real storefront rather than a localhost URL in production.
      const base = siteUrl;
      const link = prod?.slug ? `${base}/products/${prod.slug}#questions` : base;
      await sendCustomerEmail(
        asker.email,
        "Your question has been answered",
        `Hi ${asker.name || "there"},\n\nYou asked about ${prod?.name || "a product"}:\n"${updated.body}"\n\nOur reply:\n${updated.answer}\n\nSee it on the product page: ${link}\n\n— SMS Stores`
      );
    }
  }

  return Response.json({ ok: true, item: updated });
}

/**
 * DELETE /api/questions  { id }
 * Admins can remove any question. A shopper can withdraw their own question
 * while it is still unpublished, but never touch anyone else's.
 */
export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  const customer = admin ? null : await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Question id required." }, { status: 400 });

  const [row] = await db.select().from(productQuestions).where(eq(productQuestions.id, id));
  if (!row) return Response.json({ error: "Not found." }, { status: 404 });

  if (!admin) {
    if (row.customerId !== customer!.id) {
      return Response.json({ error: "You can only remove your own question." }, { status: 403 });
    }
    if (row.status === "published") {
      return Response.json(
        { error: "Published questions can only be removed by the store." },
        { status: 403 }
      );
    }
  }

  await db.delete(productQuestions).where(eq(productQuestions.id, id));
  return Response.json({ ok: true });
}
