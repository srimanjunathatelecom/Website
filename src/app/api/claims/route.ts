import { db } from "@/db";
import { claims, orders, products } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { createNotification } from "@/lib/notify";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function genClaimNo() {
  const d = new Date();
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `CLM${d.getFullYear().toString().slice(2)}${rnd}`;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  const customer = await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = admin
    ? await db.select().from(claims).orderBy(desc(claims.createdAt))
    : await db.select().from(claims).where(eq(claims.customerId, customer!.id)).orderBy(desc(claims.createdAt));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in to raise a claim." }, { status: 401 });

  // Same reasoning as bookings: a claim is a support obligation, not a
  // cheap write. 10 per customer per hour.
  const rl = await checkRateLimit(`claim:${customer.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);
  const b = await req.json();
  const orderId = Number(b.orderId);
  const productId = Number(b.productId);
  const reason = String(b.reason || "").trim();
  if (!reason) return Response.json({ error: "Please describe the issue." }, { status: 400 });

  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)));
  if (!o) return Response.json({ error: "Order not found." }, { status: 404 });
  const [p] = await db.select().from(products).where(eq(products.id, productId));
  if (!p) return Response.json({ error: "Product not found." }, { status: 404 });

  const claimNo = genClaimNo();
  const [c] = await db
    .insert(claims)
    .values({
      claimNo,
      orderId,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      productId,
      productName: p.name,
      reason,
      status: "Pending",
    })
    .returning();

  await createNotification(
    "claim",
    "New warranty/defect claim",
    `Claim ${claimNo}: ${p.name} by ${customer.name} (${customer.phone}). Reason: ${reason}.`,
    `/admin/claims`
  );

  return Response.json({ ok: true, claimId: c.id, claimNo });
}
