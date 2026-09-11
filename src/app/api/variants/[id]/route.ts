import { db } from "@/db";
import { productVariants } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { syncProductRowFromVariants } from "@/lib/variantRollup";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { reportError } from "@/lib/observability";
import { notifyStockAlerts } from "@/lib/stockAlerts";

export const dynamic = "force-dynamic";

// Editing and removing a single variant. Kept separate from ../route.ts so the
// list/create endpoint stays readable, matching the products/[id] pattern
// already used elsewhere in this project.

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = Number((await params).id);
    const [existing] = await db.select().from(productVariants).where(eq(productVariants.id, id));
    if (!existing) return Response.json({ error: "Variant not found." }, { status: 404 });

    const b = await req.json();

    // Merge-then-validate, the same approach products/[id] PUT uses: a partial
    // payload (e.g. just { stock } from an inline stock edit) is valid and
    // leaves every other field untouched.
    const color = b.color != null ? String(b.color).trim() : existing.color;
    const ram = b.ram != null ? String(b.ram).trim() : existing.ram;
    const storage = b.storage != null ? String(b.storage).trim() : existing.storage;
    if (!color && !ram && !storage) {
      return Response.json({ error: "Give the variant at least a colour, RAM or storage value." }, { status: 400 });
    }

    const mrp = Number(b.mrp != null ? b.mrp : existing.mrp);
    const mop = Number(b.mop != null ? b.mop : existing.mop);
    if (!Number.isFinite(mrp) || mrp < 0) return Response.json({ error: "MRP must be a number, 0 or more." }, { status: 400 });
    if (!Number.isFinite(mop) || mop < 0) return Response.json({ error: "Selling price must be a number, 0 or more." }, { status: 400 });
    if (mrp > 0 && mop > mrp) return Response.json({ error: "Selling price cannot be higher than MRP." }, { status: 400 });

    const stock = Number(b.stock != null ? b.stock : existing.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return Response.json({ error: "Stock must be a whole number, 0 or more." }, { status: 400 });
    }

    const colorHex = b.colorHex != null ? String(b.colorHex).trim() : existing.colorHex;
    if (colorHex && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorHex)) {
      return Response.json({ error: "Swatch colour must be a hex value like #1e3a5f." }, { status: 400 });
    }

    // Renaming a variant into an existing combination would give the PDP two
    // different prices for the same selection.
    const [dup] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, existing.productId),
          ne(productVariants.id, id),
          sql`lower(${productVariants.color}) = ${color.toLowerCase()}`,
          sql`lower(${productVariants.ram}) = ${ram.toLowerCase()}`,
          sql`lower(${productVariants.storage}) = ${storage.toLowerCase()}`
        )
      );
    if (dup) {
      return Response.json(
        { error: "That colour / RAM / storage combination already exists for this product." },
        { status: 409 }
      );
    }

    await db
      .update(productVariants)
      .set({
        color,
        ram,
        storage,
        mrp: String(mrp),
        mop: String(mop),
        stock,
        sku: b.sku != null ? String(b.sku).trim() : existing.sku,
        image: b.image !== undefined ? (b.image ? String(b.image) : null) : existing.image,
        colorHex,
        swatchImage: b.swatchImage != null ? String(b.swatchImage).trim() : existing.swatchImage,
        available: b.available != null ? !!b.available : existing.available,
        sortOrder: b.sortOrder != null && Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : existing.sortOrder,
      })
      .where(eq(productVariants.id, id));

    // A price, stock or availability edit here changes what the storefront
    // should advertise for the parent product.
    await syncProductRowFromVariants(existing.productId);

    // Restock hook: a variant going 0→>0 (or being re-enabled with stock) is
    // exactly what "notify me when back" customers are waiting on.
    const wasBuyable = existing.stock > 0 && existing.available;
    const nowBuyable = stock > 0 && (b.available != null ? !!b.available : existing.available);
    let alerts: { matched: number; sent: number } | undefined;
    if (!wasBuyable && nowBuyable) {
      alerts = await notifyStockAlerts(existing.productId);
    }

    revalidateProduct();
    return Response.json({ ok: true, ...(alerts ? { stockAlerts: alerts } : {}) });
  } catch (err) {
    reportError(err, "api/variants/[id]", { method: "PUT" });
    return Response.json({ error: "Could not update the variant." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!id) return Response.json({ error: "Variant id required." }, { status: 400 });
  const [existing] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, id));
  await db.delete(productVariants).where(eq(productVariants.id, id));
  // Removing the cheapest variant must raise the advertised "from" price
  // rather than leaving a price nothing sells at.
  if (existing) await syncProductRowFromVariants(existing.productId);
  revalidateProduct();
  return Response.json({ ok: true });
}
