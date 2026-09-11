import { db } from "@/db";
import { promoOffers } from "@/db/schema";
import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateProduct } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

// Public read: returns only currently-active, in-window offers applicable
// to a given product/category, for the PDP to render. Admin-only read
// (no productId/categoryId params) returns every offer for the admin list.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");
  const categoryId = url.searchParams.get("categoryId");

  if (productId || categoryId) {
    const now = new Date();
    const pid = productId ? Number(productId) : null;
    const cid = categoryId ? Number(categoryId) : null;

    const rows = await db
      .select()
      .from(promoOffers)
      .where(
        and(
          eq(promoOffers.active, true),
          or(isNull(promoOffers.startsAt), lte(promoOffers.startsAt, now)),
          or(isNull(promoOffers.expiresAt), gt(promoOffers.expiresAt, now)),
          // Scope: applies store-wide (both null), OR matches this product,
          // OR matches this category (when the offer isn't pinned to a
          // different single product).
          or(
            and(isNull(promoOffers.productId), isNull(promoOffers.categoryId)),
            pid != null ? eq(promoOffers.productId, pid) : undefined,
            cid != null
              ? and(isNull(promoOffers.productId), eq(promoOffers.categoryId, cid))
              : undefined
          )
        )
      )
      .orderBy(asc(promoOffers.sortOrder), desc(promoOffers.id));
    return Response.json({ items: rows });
  }

  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(promoOffers).orderBy(asc(promoOffers.sortOrder), desc(promoOffers.id));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();

  const title = String(b.title || "").trim();
  if (!title) return Response.json({ error: "Offer title is required." }, { status: 400 });
  const offerType = ["bank", "upi", "instant", "exchange", "emi"].includes(b.type) ? b.type : "bank";
  // EMI and Exchange offers don't carry a generic percent/fixed discount —
  // they're validated against their own type-specific fields instead.
  if (offerType !== "emi" && offerType !== "exchange") {
    if (!b.discountValue || Number(b.discountValue) <= 0) {
      return Response.json({ error: "Enter a discount value greater than 0." }, { status: 400 });
    }
  }
  if (offerType === "emi" && !String(b.emiTenures || "").trim()) {
    return Response.json({ error: "Add at least one EMI tenure (e.g. 6,12,24)." }, { status: 400 });
  }
  if (offerType === "exchange" && !b.maxExchangeValue) {
    return Response.json({ error: "Enter a maximum exchange value." }, { status: 400 });
  }

  const [row] = await db
    .insert(promoOffers)
    .values({
      type: offerType,
      title,
      description: String(b.description || ""),
      discountType: b.discountType === "fixed" ? "fixed" : "percent",
      discountValue: b.discountValue ? String(b.discountValue) : "0",
      maxDiscount: b.maxDiscount != null && b.maxDiscount !== "" ? String(b.maxDiscount) : null,
      minOrder: String(b.minOrder || 0),
      categoryId: b.categoryId != null && b.categoryId !== "" ? Number(b.categoryId) : null,
      productId: b.productId != null && b.productId !== "" ? Number(b.productId) : null,
      active: b.active !== false,
      startsAt: b.startsAt ? new Date(b.startsAt) : null,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      sortOrder: b.sortOrder != null ? Number(b.sortOrder) : 0,
      provider: String(b.provider || ""),
      cardType: String(b.cardType || ""),
      emiTenures: String(b.emiTenures || ""),
      emiInterestRate: b.emiInterestRate != null && b.emiInterestRate !== "" ? String(b.emiInterestRate) : null,
      noCostEmi: !!b.noCostEmi,
      processingFee: b.processingFee != null && b.processingFee !== "" ? String(b.processingFee) : null,
      minPurchaseAmount: b.minPurchaseAmount != null && b.minPurchaseAmount !== "" ? String(b.minPurchaseAmount) : null,
      maxExchangeValue: b.maxExchangeValue != null && b.maxExchangeValue !== "" ? String(b.maxExchangeValue) : null,
      exchangeEligibility: String(b.exchangeEligibility || ""),
    })
    .returning();
  revalidateProduct();
  return Response.json({ ok: true, offer: row });
}