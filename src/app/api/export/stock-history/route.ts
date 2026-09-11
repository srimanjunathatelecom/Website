/**
 * Stock movement export: every change to every item's stock — sales,
 * imports, manual edits, cancellations, undos — as a CSV for Excel.
 *
 * Filters: ?product=<id>  ?type=<movementType>  ?days=<n, default 90>
 */

import { db } from "@/db";
import { stockHistory } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { resolveAdmin } from "@/lib/resolveAdmin";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = ["When", "Product", "Variant", "SKU", "Before", "Change", "After", "Type", "Reason", "By", "Import #", "Order #"];

export async function GET(req: Request) {
  const admin = await resolveAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("product") ?? "");
  const type = url.searchParams.get("type")?.trim() ?? "";
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 90) || 90, 1), 730);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const conds = [gte(stockHistory.createdAt, since)];
  if (Number.isInteger(productId) && productId > 0) conds.push(eq(stockHistory.productId, productId));
  if (type) conds.push(eq(stockHistory.movementType, type));

  const rows = await db
    .select()
    .from(stockHistory)
    .where(and(...conds))
    .orderBy(desc(stockHistory.id))
    .limit(20000);

  const lines = [HEADER.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(), r.productName, r.variantLabel, r.sku,
        r.oldStock, r.change > 0 ? `+${r.change}` : r.change, r.newStock,
        r.movementType, r.reason, r.adminName, r.importId ?? "", r.orderId ?? "",
      ].map(csvEscape).join(",")
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="stock-history-${Date.now()}.csv"`,
    },
  });
}
