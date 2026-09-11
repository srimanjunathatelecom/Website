import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { createNotification } from "@/lib/notify";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

function genBookingNo() {
  const d = new Date();
  const crypto = require("crypto");
  const rnd = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `SVC${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${rnd}`;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  const customer = await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = admin
    ? await db.select().from(bookings).orderBy(desc(bookings.createdAt))
    : await db.select().from(bookings).where(eq(bookings.customerId, customer!.id)).orderBy(desc(bookings.createdAt));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in to book a service." }, { status: 401 });

  // Each booking creates work for the shop and a notification for the
  // owner. 10 per customer per hour bounds accidental double-taps and
  // deliberate flooding without getting in a real customer's way.
  const rl = await checkRateLimit(`booking:${customer.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);
  const b = await req.json();
  const serviceId = Number(b.serviceId);
  const [svc] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!svc) return Response.json({ error: "Please select a valid service." }, { status: 400 });

  const bookingNo = genBookingNo();
  const [bk] = await db
    .insert(bookings)
    .values({
      bookingNo,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      serviceId,
      serviceName: svc.name,
      device: String(b.device || ""),
      issue: String(b.issue || ""),
      outletId: b.outletId ? Number(b.outletId) : null,
      status: "Booked",
    })
    .returning();

  await createNotification(
    "booking",
    "New repair/service booking",
    `Booking ${bookingNo}: ${svc.name} for ${customer.name} (${customer.phone}). Device: ${b.device || "n/a"}.`,
    `/admin/bookings`
  );

  return Response.json({ ok: true, bookingId: bk.id, bookingNo });
}
