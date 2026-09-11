import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { resolveAdmin } from "@/lib/resolveAdmin";

export const dynamic = "force-dynamic";

function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const admin = await resolveAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const prods = await db.select().from(products);
  const cats = await db.select().from(categories);
  const catMap = new Map(cats.map((c) => [c.id, c.name]));

  // Note: this store only tracks MRP (list price) and MOP (selling price) —
  // there is no separate cost-price field, so this reports the MRP-to-MOP
  // gap ("customer savings" / "margin off list"), not true profit margin.
  // Labeled honestly rather than implying a profit figure that isn't tracked.
  const header = [
    "SKU", "Name", "Brand", "Category", "MRP", "MOP",
    "Discount Off MRP", "Discount %", "Stock",
    "Stock Value at MOP", "Stock Value at MRP", "Status",
  ];
  const lines = [header.map(csvEscape).join(",")];

  let totalStockValueMop = 0;
  let totalStockValueMrp = 0;

  for (const p of prods) {
    const mrp = Number(p.mrp || 0);
    const mop = Number(p.mop || 0);
    const stock = Number(p.stock || 0);
    const discountOff = mrp - mop;
    const discountPct = mrp > 0 ? (discountOff / mrp) * 100 : 0;
    const stockValueMop = stock * mop;
    const stockValueMrp = stock * mrp;
    totalStockValueMop += stockValueMop;
    totalStockValueMrp += stockValueMrp;

    lines.push(
      [
        p.sku, p.name, p.brand, catMap.get(p.categoryId) || "",
        mrp.toFixed(2), mop.toFixed(2),
        discountOff.toFixed(2), discountPct.toFixed(1),
        stock, stockValueMop.toFixed(2), stockValueMrp.toFixed(2),
        p.status,
      ].map(csvEscape).join(",")
    );
  }

  lines.push("");
  lines.push(["", "", "", "", "", "", "", "", "TOTAL STOCK VALUE (MOP)", totalStockValueMop.toFixed(2), ""].map(csvEscape).join(","));
  lines.push(["", "", "", "", "", "", "", "", "TOTAL STOCK VALUE (MRP)", "", totalStockValueMrp.toFixed(2)].map(csvEscape).join(","));

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sms-margins-${Date.now()}.csv"`,
    },
  });
}