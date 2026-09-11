import { db } from "@/db";
import { products, productImages, productVariants, stockHistory } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { saveImages } from "../route";
import { validateProductInput } from "@/lib/productValidation";
import { syncProductRowFromVariants } from "@/lib/variantRollup";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { notifyStockAlerts } from "@/lib/stockAlerts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  const [p] = await db.select().from(products).where(eq(products.id, numId));
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });
  // Variants ship with the product so the admin editor can manage gallery,
  // colours and configurations in one place without a second request.
  const [imgs, vars] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, numId)).orderBy(productImages.sortOrder, productImages.id),
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, numId))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.id)),
  ]);
  return Response.json({ product: p, images: imgs, variants: vars });
}

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const numId = Number((await params).id);
    const b = await req_json(_req);
    const [existing] = await db.select().from(products).where(eq(products.id, numId));
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    // Only fields the caller actually sent are validated against the
    // merged (existing + incoming) values, so a request that only sends
    // `{ stock: 5 }` (the +/- buttons) doesn't need to re-send name/category.
    const merged = {
      name: b.name ?? existing.name,
      categoryId: b.categoryId ?? existing.categoryId,
      mrp: b.mrp ?? existing.mrp,
      mop: b.mop ?? existing.mop,
      stock: b.stock ?? existing.stock,
      lowStockThreshold: b.lowStockThreshold ?? existing.lowStockThreshold,
      sku: b.sku ?? existing.sku,
    };
    const result = await validateProductInput(merged, { excludeProductId: numId });
    if (!result.ok) return Response.json({ error: result.error, field: result.field }, { status: 400 });
    const { mrp, mop, stock, lowStockThreshold, sku } = result.values;

    let slug = existing.slug;
    if (b.slug && b.slug !== existing.slug) {
      slug = slugify(b.slug);
      const [dup] = await db.select().from(products).where(eq(products.slug, slug));
      if (dup && dup.id !== numId) slug = `${slug}-${numId}`;
    }

    await db
      .update(products)
      .set({
        name: result.values.name,
        brand: b.brand ?? existing.brand,
        slug,
        description: b.description ?? existing.description,
        categoryId: b.categoryId ? Number(b.categoryId) : existing.categoryId,
        subcategory: b.subcategory ?? existing.subcategory,
        mrp: String(mrp),
        mop: String(mop),
        stock,
        lowStockThreshold,
        sku,
        warranty: b.warranty ?? existing.warranty,
        specifications: b.specifications ?? existing.specifications,
        imageSource: b.imageSource ?? existing.imageSource,
        featured: b.featured != null ? !!b.featured : existing.featured,
        bestseller: b.bestseller != null ? !!b.bestseller : existing.bestseller,
        newArrival: b.newArrival != null ? !!b.newArrival : existing.newArrival,
        status: b.status ?? existing.status,
        highlights: b.highlights ?? existing.highlights,
        saleBadge: b.saleBadge ?? existing.saleBadge,
        protectPromiseFee: b.protectPromiseFee ?? existing.protectPromiseFee,
        sellerName: b.sellerName ?? existing.sellerName,
        sellerRating: b.sellerRating != null && b.sellerRating !== "" ? String(b.sellerRating) : (b.sellerRating === "" ? null : existing.sellerRating),
        sellerYears: b.sellerYears != null && b.sellerYears !== "" ? Number(b.sellerYears) : (b.sellerYears === "" ? null : existing.sellerYears),
        boxContents: b.boxContents ?? existing.boxContents,
        trending: b.trending != null ? !!b.trending : existing.trending,
        limitedStock: b.limitedStock != null ? !!b.limitedStock : existing.limitedStock,
        hotDeal: b.hotDeal != null ? !!b.hotDeal : existing.hotDeal,
      })
      .where(eq(products.id, numId));

    // Log to the stock audit trail only when stock actually changed —
    // avoids a history row on every unrelated field edit.
    if (stock !== existing.stock) {
      await db.insert(stockHistory).values({
        productId: numId,
        productName: result.values.name,
        sku,
        oldStock: existing.stock,
        newStock: stock,
        change: stock - existing.stock,
        adminId: admin.id,
        adminName: admin.name || admin.email || "Admin",
        reason: String(b.stockChangeReason || "").trim() || "Manual edit",
      });
    }

    if (b.images) await saveImages(numId, b.images);

    // For a product that sells through variants, the variants are the only
    // purchasable things — so the row the storefront advertises from is
    // recomputed rather than trusted. Without this, editing a phone's price
    // here updated the listing card and the page <title> but not any variant,
    // advertising a price no variant sold at. Products without variants are
    // left exactly as saved.
    await syncProductRowFromVariants(numId);

    // Restock hook: if stock rose from zero, honour any "notify me when
    // back" requests. Counts are returned so the admin UI (and tests) can
    // see the effect; a send failure never fails the edit itself.
    let alerts: { matched: number; sent: number } | undefined;
    if (existing.stock <= 0 && stock > 0) {
      alerts = await notifyStockAlerts(numId);
    }

    revalidateProduct();
    return Response.json({ ok: true, ...(alerts ? { stockAlerts: alerts } : {}) });
  } catch (e) {
    return Response.json({ error: "Could not update product." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const numId = Number((await params).id);
  await db.delete(productImages).where(eq(productImages.productId, numId));
  // Variants were previously left behind when a product was deleted, leaving
  // orphan rows that still showed up in the admin variants list.
  await db.delete(productVariants).where(eq(productVariants.productId, numId));
  await db.delete(products).where(eq(products.id, numId));
  revalidateProduct();
  return Response.json({ ok: true });
}

async function req_json(req: Request) {
  return req.json();
}