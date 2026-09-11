import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { resolveAdmin } from "@/lib/resolveAdmin";

export const dynamic = "force-dynamic";

function csvEscape(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const admin = await resolveAdmin();
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

  const header = ["ID", "Name", "Email", "Phone", "Joined", "Orders"];
  const lines = [header.map(csvEscape).join(",")];
  for (const c of rows) {
    lines.push([c.id, c.name, c.email, c.phone, new Date(c.createdAt).toISOString(), c.orderCount].map(csvEscape).join(","));
  }
  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sms-customers-${Date.now()}.csv"`,
    },
  });
}