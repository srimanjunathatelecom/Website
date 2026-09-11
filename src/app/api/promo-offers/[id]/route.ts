import { db } from "@/db";
import { promoOffers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateProduct } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await req.json();
  const [existing] = await db.select().from(promoOffers).where(eq(promoOffers.id, id));
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const title = b.title != null ? String(b.title).trim() : existing.title;
  if (!title) return Response.json({ error: "Offer title is required." }, { status: 400 });

  await db
    .update(promoOffers)
    .set({
      type: b.type != null && ["bank", "upi", "instant", "exchange", "emi"].includes(b.type) ? b.type : existing.type,
      title,
      description: b.description != null ? String(b.description) : existing.description,
      discountType: b.discountType === "fixed" ? "fixed" : b.discountType === "percent" ? "percent" : existing.discountType,
      discountValue: b.discountValue != null ? String(b.discountValue) : existing.discountValue,
      maxDiscount: b.maxDiscount != null ? (b.maxDiscount === "" ? null : String(b.maxDiscount)) : existing.maxDiscount,
      minOrder: b.minOrder != null ? String(b.minOrder) : existing.minOrder,
      categoryId: b.categoryId !== undefined ? (b.categoryId === "" || b.categoryId === null ? null : Number(b.categoryId)) : existing.categoryId,
      productId: b.productId !== undefined ? (b.productId === "" || b.productId === null ? null : Number(b.productId)) : existing.productId,
      active: b.active != null ? !!b.active : existing.active,
      startsAt: b.startsAt !== undefined ? (b.startsAt ? new Date(b.startsAt) : null) : existing.startsAt,
      expiresAt: b.expiresAt !== undefined ? (b.expiresAt ? new Date(b.expiresAt) : null) : existing.expiresAt,
      sortOrder: b.sortOrder != null ? Number(b.sortOrder) : existing.sortOrder,
      provider: b.provider != null ? String(b.provider) : existing.provider,
      cardType: b.cardType != null ? String(b.cardType) : existing.cardType,
      emiTenures: b.emiTenures != null ? String(b.emiTenures) : existing.emiTenures,
      emiInterestRate: b.emiInterestRate !== undefined ? (b.emiInterestRate === "" || b.emiInterestRate == null ? null : String(b.emiInterestRate)) : existing.emiInterestRate,
      noCostEmi: b.noCostEmi != null ? !!b.noCostEmi : existing.noCostEmi,
      processingFee: b.processingFee !== undefined ? (b.processingFee === "" || b.processingFee == null ? null : String(b.processingFee)) : existing.processingFee,
      minPurchaseAmount: b.minPurchaseAmount !== undefined ? (b.minPurchaseAmount === "" || b.minPurchaseAmount == null ? null : String(b.minPurchaseAmount)) : existing.minPurchaseAmount,
      maxExchangeValue: b.maxExchangeValue !== undefined ? (b.maxExchangeValue === "" || b.maxExchangeValue == null ? null : String(b.maxExchangeValue)) : existing.maxExchangeValue,
      exchangeEligibility: b.exchangeEligibility != null ? String(b.exchangeEligibility) : existing.exchangeEligibility,
    })
    .where(eq(promoOffers.id, id));
  revalidateProduct();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(promoOffers).where(eq(promoOffers.id, Number((await params).id)));
  revalidateProduct();
  return Response.json({ ok: true });
}