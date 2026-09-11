import { db } from "@/db";
import { products, productVariants, categories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { resolveAdmin } from "@/lib/resolveAdmin";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The export is designed to round-trip: everything here re-imports cleanly
// through the import wizard (Admin → Products & Stock → Import).
//
// - ID / SKU / Variant SKU / Barcode are the matching keys — never edit them
//   on a row you want to update.
// - Variant products get ONE ROW PER VARIANT (stock truly lives on the
//   variant); the product's own roll-up row is not exported for them, so a
//   re-import can never fight the variant roll-up.
// - "Exported At" tells the importer when this sheet was generated, which is
//   how "your sheet is older than the last stock change" warnings work.
const HEADER = [
  "ID", "SKU", "Variant SKU", "Barcode", "Name", "Brand", "Category",
  "Colour", "RAM", "Storage",
  "MRP", "Selling Price", "Cost Price", "GST %", "HSN Code",
  "Stock", "Low-Stock Threshold", "Status", "Exported At",
];

export async function GET(req: Request) {
  const admin = await resolveAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category")?.trim();
  // ?filter=low → only items at/below their low-stock alert level.
  const filter = url.searchParams.get("filter")?.trim() ?? "";

  const cats = await db.select().from(categories);
  const catMap = new Map(cats.map((c) => [c.id, c.name]));

  // Optional per-category export: ?category=<id|slug> downloads just that
  // category so each product type can be managed and re-imported alone.
  let categoryId: number | null = null;
  let categoryLabel = "";
  if (categoryParam) {
    const byId = Number(categoryParam);
    const cat = Number.isFinite(byId) && byId > 0
      ? cats.find((c) => c.id === byId)
      : cats.find((c) => c.slug === categoryParam);
    if (!cat) return Response.json({ error: "Unknown category." }, { status: 400 });
    categoryId = cat.id;
    categoryLabel = `-${cat.slug}`;
  }

  const prods = categoryId
    ? await db.select().from(products).where(eq(products.categoryId, categoryId))
    : await db.select().from(products);

  const variants = prods.length
    ? await db.select().from(productVariants).where(inArray(productVariants.productId, prods.map((p) => p.id)))
    : [];
  const variantsByProduct = new Map<number, typeof variants>();
  for (const v of variants) {
    const arr = variantsByProduct.get(v.productId);
    if (arr) arr.push(v);
    else variantsByProduct.set(v.productId, [v]);
  }

  const exportedAt = new Date().toISOString();
  const lines = [HEADER.map(csvEscape).join(",")];
  for (const p of prods) {
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length > 0) {
      for (const v of vs) {
        if (filter === "low" && v.stock > p.lowStockThreshold) continue;
        lines.push(
          [
            p.id, p.sku, v.sku, v.barcode || p.barcode,
            `${p.name}${[v.color, v.ram, v.storage].filter(Boolean).length ? ` (${[v.color, v.ram, v.storage].filter(Boolean).join(", ")})` : ""}`,
            p.brand, catMap.get(p.categoryId) || "",
            v.color, v.ram, v.storage,
            v.mrp, v.mop, p.costPrice ?? "", p.gstRate ?? "", p.hsn,
            v.stock, p.lowStockThreshold, p.status, exportedAt,
          ].map(csvEscape).join(",")
        );
      }
    } else {
      if (filter === "low" && p.stock > p.lowStockThreshold) continue;
      lines.push(
        [
          p.id, p.sku, "", p.barcode, p.name, p.brand, catMap.get(p.categoryId) || "",
          "", "", "",
          p.mrp, p.mop, p.costPrice ?? "", p.gstRate ?? "", p.hsn,
          p.stock, p.lowStockThreshold, p.status, exportedAt,
        ].map(csvEscape).join(",")
      );
    }
  }
  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sms-stock${categoryLabel}${filter === "low" ? "-low" : ""}-${Date.now()}.csv"`,
    },
  });
}
