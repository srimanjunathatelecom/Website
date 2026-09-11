import { db } from "@/db";
import { products, productVariants } from "@/db/schema";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { syncProductRowFromVariants } from "@/lib/variantRollup";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

// Variant CRUD for the Admin dashboard.
//
// The variants screen previously only supported add + delete through inline
// server actions, so fixing a typo in a colour name or correcting a price
// meant deleting the row and re-adding it (losing its position, and briefly
// breaking the PDP for anyone mid-purchase). This route gives the dashboard
// real create/read/update/delete against the same product_variants table the
// PDP reads, so Admin → Database → API → PDP stays a single flow.

type VariantBody = Record<string, unknown>;

/** Normalizes a variant payload. Returns an error string instead of throwing. */
function readVariant(b: VariantBody) {
  const color = String(b.color ?? "").trim();
  const ram = String(b.ram ?? "").trim();
  const storage = String(b.storage ?? "").trim();

  // A variant with no distinguishing attribute at all can't be selected on
  // the PDP and would silently shadow the product's own price/stock.
  if (!color && !ram && !storage) {
    return { ok: false as const, error: "Give the variant at least a colour, RAM or storage value." };
  }

  const mrp = Number(b.mrp);
  const mop = Number(b.mop);
  if (!Number.isFinite(mrp) || mrp < 0) return { ok: false as const, error: "MRP must be a number, 0 or more." };
  if (!Number.isFinite(mop) || mop < 0) return { ok: false as const, error: "Selling price must be a number, 0 or more." };
  if (mrp > 0 && mop > mrp) return { ok: false as const, error: "Selling price cannot be higher than MRP." };

  const stock = Number(b.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) return { ok: false as const, error: "Stock must be a whole number, 0 or more." };

  const colorHex = String(b.colorHex ?? "").trim();
  // Accept #rgb / #rrggbb only — anything else would render as a broken
  // swatch, and silently accepting it makes the admin think it saved.
  if (colorHex && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorHex)) {
    return { ok: false as const, error: "Swatch colour must be a hex value like #1e3a5f." };
  }

  return {
    ok: true as const,
    values: {
      color,
      ram,
      storage,
      mrp: String(mrp),
      mop: String(mop),
      stock,
      sku: String(b.sku ?? "").trim(),
      image: b.image ? String(b.image) : null,
      colorHex,
      swatchImage: String(b.swatchImage ?? "").trim(),
      available: b.available !== false,
      sortOrder: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
    },
  };
}

/**
 * True when this product already has a variant with the same
 * colour + RAM + storage. Duplicate combinations are what make a PDP
 * ambiguous (two different prices for the same selection), so they're
 * rejected rather than merged.
 */
async function combinationTaken(productId: number, v: { color: string; ram: string; storage: string }, excludeId?: number) {
  const conditions = [
    eq(productVariants.productId, productId),
    sql`lower(${productVariants.color}) = ${v.color.toLowerCase()}`,
    sql`lower(${productVariants.ram}) = ${v.ram.toLowerCase()}`,
    sql`lower(${productVariants.storage}) = ${v.storage.toLowerCase()}`,
  ];
  if (excludeId) conditions.push(ne(productVariants.id, excludeId));
  const [dup] = await db.select({ id: productVariants.id }).from(productVariants).where(and(...conditions));
  return !!dup;
}

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const productId = Number(new URL(req.url).searchParams.get("productId"));
  const rows = productId
    ? await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId))
        .orderBy(asc(productVariants.sortOrder), asc(productVariants.id))
    : await db
        .select()
        .from(productVariants)
        .orderBy(asc(productVariants.productId), asc(productVariants.sortOrder), asc(productVariants.id));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b: VariantBody = await req.json();
    const productId = Number(b.productId);
    if (!productId) return Response.json({ error: "Pick a product for this variant." }, { status: 400 });

    const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
    if (!p) return Response.json({ error: "That product no longer exists." }, { status: 404 });

    const parsed = readVariant(b);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    if (await combinationTaken(productId, parsed.values)) {
      return Response.json(
        { error: "That colour / RAM / storage combination already exists for this product." },
        { status: 409 }
      );
    }

    const [row] = await db.insert(productVariants).values({ productId, ...parsed.values }).returning();
    // Adding a cheaper (or the first) variant changes the price and stock the
    // storefront advertises for this product, so roll it up immediately.
    await syncProductRowFromVariants(productId);
    revalidateProduct();
    return Response.json({ ok: true, item: row });
  } catch (err) {
    reportError(err, "api/variants", { method: "POST" });
    return Response.json({ error: "Could not save the variant." }, { status: 500 });
  }
}
