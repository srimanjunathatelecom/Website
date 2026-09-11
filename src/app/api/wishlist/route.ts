import { db } from "@/db";
import { wishlist } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentCustomer } from "@/lib/auth";
import { getWishlist } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const items = await getWishlist(customer.id);
  return Response.json({ items });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const productId = Number(b.productId);
  const [ex] = await db
    .select()
    .from(wishlist)
    .where(and(eq(wishlist.customerId, customer.id), eq(wishlist.productId, productId)));
  if (!ex) {
    await db.insert(wishlist).values({ customerId: customer.id, productId });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  await db
    .delete(wishlist)
    .where(and(eq(wishlist.customerId, customer.id), eq(wishlist.productId, Number(b.productId))));
  return Response.json({ ok: true });
}
