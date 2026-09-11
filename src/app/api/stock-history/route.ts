import { db } from "@/db";
import { stockHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);

  const rows = productId
    ? await db
        .select()
        .from(stockHistory)
        .where(eq(stockHistory.productId, Number(productId)))
        .orderBy(desc(stockHistory.createdAt))
        .limit(limit)
    : await db.select().from(stockHistory).orderBy(desc(stockHistory.createdAt)).limit(limit);

  return Response.json({ items: rows });
}