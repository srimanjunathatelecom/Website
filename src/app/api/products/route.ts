import { db } from "@/db";
import { products, productImages, orderItems } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getProducts } from "@/lib/queries";
import { getCurrentAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { validateProductInput } from "@/lib/productValidation";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { enqueueEnrichment } from "@/lib/catalogue/jobs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const admin = await getCurrentAdmin();
    const url = new URL(req.url);
    const params = url.searchParams;

    // ?ids=3,17,4 — used by the "Recently viewed" rail, which keeps only a
    // list of product ids in localStorage and asks the server for the live
    // rows. Fetching just those ids (instead of pulling the whole catalogue
    // and filtering in the browser) keeps the payload small, and the result
    // is returned in the order the ids were given so the most recent item
    // stays first. Anything that no longer exists or is hidden is simply
    // absent from the response rather than rendered from stale local data.
    const idsParam = params.get("ids");
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0)
        .slice(0, 24);
      if (ids.length === 0) return Response.json({ items: [] });
      const rows = await getProducts({ ids, activeOnly: admin ? false : true });
      const order = new Map(ids.map((id, i) => [id, i]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return Response.json({ items: rows });
    }

    const items = await getProducts({
      categorySlug: params.get("category") || undefined,
      search: params.get("search") || undefined,
      brand: params.get("brand") || undefined,
      minPrice: params.get("minPrice") ? Number(params.get("minPrice")) : undefined,
      maxPrice: params.get("maxPrice") ? Number(params.get("maxPrice")) : undefined,
      minDiscount: params.get("minDiscount") ? Number(params.get("minDiscount")) : undefined,
      sort: params.get("sort") || undefined,
      limit: params.get("limit") ? Number(params.get("limit")) : 500,
      offset: params.get("offset") ? Number(params.get("offset")) : 0,
      activeOnly: admin ? false : true, 
    });

    const brandRows = await db
      .selectDistinct({ brand: products.brand })
      .from(products)
      .where(sql`status='active' and brand <> ''`)
      .orderBy(products.brand);
    
    const brands = brandRows.map((r) => r.brand).filter(Boolean);

    return Response.json({ items, brands });
  } catch (e) {
    return Response.json({ error: "Failed to load products." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await req.json();

    const result = await validateProductInput(b, { requireCategory: true });
    if (!result.ok) return Response.json({ error: result.error, field: result.field }, { status: 400 });
    const { name, mrp, mop, stock, lowStockThreshold, categoryId, sku } = result.values;

    let slug = slugify(b.slug || name) || "product";
    const [dup] = await db.select().from(products).where(eq(products.slug, slug));
    if (dup) slug = `${slug}-${Date.now().toString(36)}`;

    const [p] = await db
      .insert(products)
      .values({
        name,
        brand: String(b.brand || "").trim(),
        slug,
        description: String(b.description || ""),
        categoryId,
        subcategory: String(b.subcategory || ""),
        mrp: String(mrp),
        mop: String(mop),
        stock,
        lowStockThreshold,
        sku,
        warranty: String(b.warranty || ""),
        specifications: String(b.specifications || ""),
        imageSource: String(b.imageSource || "Our own photo"),
        featured: !!b.featured,
        bestseller: !!b.bestseller,
        newArrival: !!b.newArrival,
        status: b.status === "hidden" ? "hidden" : "active",
        highlights: String(b.highlights || ""),
        saleBadge: String(b.saleBadge || ""),
        protectPromiseFee: String(b.protectPromiseFee || ""),
        sellerName: String(b.sellerName || ""),
        sellerRating: b.sellerRating != null && b.sellerRating !== "" ? String(b.sellerRating) : null,
        sellerYears: b.sellerYears != null && b.sellerYears !== "" ? Number(b.sellerYears) : null,
        boxContents: String(b.boxContents || ""),
        trending: !!b.trending,
        limitedStock: !!b.limitedStock,
        hotDeal: !!b.hotDeal,
      })
      .returning();

    await saveImages(p.id, b.images);
    revalidateProduct();
    // Manual add → background enrichment (SEO/specs/official image hunt).
    try {
      await enqueueEnrichment([p.id], admin.name);
    } catch {
      // enrichment is a bonus, never a blocker
    }
    return Response.json({ ok: true, id: p.id, slug: p.slug });
  } catch (e) {
    return Response.json({ error: "Could not save product." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // This wipes the ENTIRE catalog — every product and product image,
    // store-wide. The admin UI already gets a confirm() dialog and a
    // 7-second countdown, but that's client-side only: anything with a
    // valid admin session cookie (a CSRF'd request, a leaked cookie, a
    // compromised admin browser tab) could otherwise trigger this with a
    // single blind DELETE request and no further confirmation. Requiring
    // this exact phrase in the body means the request itself has to be
    // deliberately constructed, not just carry a valid session.
    const b = await req.json().catch(() => ({}));
    if (b.confirm !== "DELETE ALL PRODUCTS") {
      return Response.json(
        { error: 'Confirmation required: send { "confirm": "DELETE ALL PRODUCTS" } to proceed.' },
        { status: 400 }
      );
    }

    // Same safety the single-product DELETE below already enforces: don't
    // silently orphan order history. orderItems has no FK constraint back
    // to products (it intentionally snapshots name/price at purchase time),
    // so a bulk delete here wouldn't fail at the DB level — it would just
    // quietly leave every past order's productId pointing at nothing.
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(orderItems);
    if (count > 0) {
      return Response.json(
        { error: `Cannot delete all products because ${count} order item(s) reference existing products. Historical orders must be preserved.` },
        { status: 409 }
      );
    }

    await db.delete(productImages).where(sql`1=1`);
    await db.delete(products).where(sql`1=1`);

    revalidateProduct();
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("Bulk delete error:", error);
    if (error.message?.toLowerCase().includes("foreign key") || error.message?.toLowerCase().includes("constraint")) {
      return Response.json({ 
        error: "Cannot delete products because they are linked to existing Orders. Please clear dummy orders first." 
      }, { status: 400 });
    }
    return Response.json({ error: "A database error occurred while deleting products." }, { status: 500 });
  }
}

// Replaces a product's whole gallery in the order given — index 0 is the
// cover. Each entry may carry an optional `variantColor` (shows that image
// only when the matching colour is selected on the PDP) and `mediaType`
// ("image" | "video"). Both are optional so older callers that send plain
// { dataUrl, alt } objects keep behaving exactly as before.
export async function saveImages(productId: number, images: any[]) {
  if (!Array.isArray(images)) return;
  await db.delete(productImages).where(eq(productImages.productId, productId));
  const vals = images
    .filter((im) => im && im.dataUrl)
    .map((im, i) => ({
      productId,
      dataUrl: String(im.dataUrl),
      alt: String(im.alt || ""),
      sortOrder: i,
      variantColor: String(im.variantColor || "").trim(),
      mediaType: im.mediaType === "video" ? "video" : "image",
    }));
  if (vals.length) await db.insert(productImages).values(vals);
}