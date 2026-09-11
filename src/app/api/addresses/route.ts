import { db } from "@/db";
import { addresses } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentCustomer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.customerId, customer.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.id));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const isDefault = !!b.isDefault;
  if (isDefault) {
    await db.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customer.id));
  }
  const [a] = await db
    .insert(addresses)
    .values({
      customerId: customer.id,
      label: String(b.label || "Home"),
      line: String(b.line || ""),
      city: String(b.city || "Bengaluru"),
      pincode: String(b.pincode || ""),
      lat: b.lat !== undefined ? b.lat : null,
      lng: b.lng !== undefined ? b.lng : null,
      isDefault,
    })
    .returning();
  return Response.json({ ok: true, address: a });
}

export async function DELETE(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  await db
    .delete(addresses)
    .where(and(eq(addresses.id, Number(b.id)), eq(addresses.customerId, customer.id)));
  return Response.json({ ok: true });
}
