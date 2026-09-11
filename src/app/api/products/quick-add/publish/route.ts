import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { validateProductInput } from "@/lib/productValidation";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { enqueueEnrichment } from "@/lib/catalogue/jobs";

export const dynamic = "force-dynamic";

type PublishRow = {
  name?: unknown;
  brand?: unknown;
  categoryId?: unknown;
  ram?: unknown;
  storage?: unknown;
  color?: unknown;
  mrp?: unknown;
  mop?: unknown;
  stock?: unknown;
  sku?: unknown;
  status?: unknown; // "active" | "draft" — draft = saved hidden for later review
};

// Publishes admin-confirmed Quick Add rows. Each row is validated
// independently with the same rules as the normal product form — a bad
// row is reported and skipped rather than aborting the whole batch, so
// the admin doesn't lose 19 good rows because row 20 had a typo.
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { rows?: PublishRow[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return Response.json({ error: "No rows to publish." }, { status: 400 });
  if (rows.length > 200) return Response.json({ error: "Too many rows in one batch (max 200)." }, { status: 400 });

  const allCats = await db.select().from(categories);
  const defaultCatId = allCats[0]?.id;

  const created: { index: number; id: number; slug: string; name: string }[] = [];
  const failed: { index: number; name: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r.name ?? "").trim();

    try {
      const result = await validateProductInput(
        { ...r, categoryId: r.categoryId ?? defaultCatId },
        { requireCategory: true }
      );
      if (!result.ok) {
        failed.push({ index: i, name: name || `Row ${i + 1}`, error: result.error });
        continue;
      }
      const { mrp, mop, stock, lowStockThreshold, categoryId, sku } = result.values;

      // Fold detected specs (RAM/storage/colour) into the description
      // rather than inventing dedicated columns for a one-off import
      // path — specifications field already exists for exactly this.
      const specParts = [r.ram, r.storage, r.color].filter((x) => typeof x === "string" && x.trim());
      const specifications = specParts.length ? specParts.join(" · ") : "";

      let slug = slugify(name) || "product";
      const [dup] = await db.select().from(products).where(eq(products.slug, slug));
      if (dup) slug = `${slug}-${Date.now().toString(36)}-${i}`;

      const [p] = await db
        .insert(products)
        .values({
          name: result.values.name,
          brand: String(r.brand ?? "").trim(),
          slug,
          description: "",
          categoryId,
          subcategory: "",
          mrp: String(mrp),
          mop: String(mop),
          stock,
          lowStockThreshold,
          sku,
          warranty: "",
          specifications,
          imageSource: "Not yet added",
          featured: false,
          bestseller: false,
          newArrival: true,
          // Quick Add always saves as hidden by default so nothing goes
          // live on the storefront until the admin reviews it once more
          // and flips it to active from Products & Stock — matches the
          // "never automatically publish uncertain data" requirement.
          status: r.status === "active" ? "active" : "hidden",
        })
        .returning();

      created.push({ index: i, id: p.id, slug: p.slug, name: p.name });
    } catch (e: any) {
      failed.push({ index: i, name: name || `Row ${i + 1}`, error: e?.message || "Unknown error" });
    }
  }

  revalidateProduct();

  // Hand the new products to the catalogue engine: it fills SEO/specs from
  // real fields and hunts official images in the background (spec §15).
  if (created.length) {
    try {
      await enqueueEnrichment(created.map((c) => c.id), admin.name);
    } catch {
      // enrichment is a bonus, never a blocker
    }
  }
  return Response.json({ ok: true, created, failed });
}