/**
 * GET /api/catalogue/issues?status=needs_review|open|auto_fixed&type=...
 * The review queue + auto-fix log, newest first.
 */

import { db } from "@/db";
import { catalogueIssues, productImages, products } from "@/db/schema";
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["open", "needs_review", "auto_fixed", "approved", "rejected", "resolved", "dismissed"]);

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const type = url.searchParams.get("type") || "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 300);

  const conds: SQL[] = [];
  if (status && STATUSES.has(status)) conds.push(eq(catalogueIssues.status, status));
  if (type) conds.push(eq(catalogueIssues.type, type));

  const rows = await db
    .select()
    .from(catalogueIssues)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(catalogueIssues.id))
    .limit(limit);

  // Attach each product's CURRENT first image + slug so review cards can
  // show "what you have now" next to "what is proposed".
  const pids = [...new Set(rows.map((r) => r.productId))];
  const current = new Map<number, { image: string; slug: string; status: string }>();
  if (pids.length) {
    const prods = await db
      .select({ id: products.id, slug: products.slug, status: products.status })
      .from(products)
      .where(inArray(products.id, pids));
    const imgs = await db
      .select({ productId: productImages.productId, dataUrl: productImages.dataUrl, sortOrder: productImages.sortOrder })
      .from(productImages)
      .where(inArray(productImages.productId, pids))
      .orderBy(asc(productImages.sortOrder));
    const firstImg = new Map<number, string>();
    for (const i of imgs) if (!firstImg.has(i.productId)) firstImg.set(i.productId, i.dataUrl);
    for (const p of prods) current.set(p.id, { image: firstImg.get(p.id) || "", slug: p.slug, status: p.status });
  }

  const items = rows.map((r) => ({
    ...r,
    currentImage: current.get(r.productId)?.image || "",
    productSlug: current.get(r.productId)?.slug || "",
    productStatus: current.get(r.productId)?.status || "",
  }));

  return Response.json({ items });
}
