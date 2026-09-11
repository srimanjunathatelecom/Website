import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
      createdAt: customers.createdAt,
      orderCount: sql<number>`(select count(*)::int from orders o where o.customer_id = ${customers.id})`,
    })
    .from(customers)
    .orderBy(desc(customers.createdAt));
  return Response.json({ items: rows });
}
