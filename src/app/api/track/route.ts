import { db } from "@/db";
import { orders, bookings, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentCustomer } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Guest order tracking is a real, needed feature — but an order/booking
// number alone is too weak a secret: this route's own generator only has
// ~1.7M possible suffixes per day, and a plain lookup would let anyone
// enumerate other customers' names, addresses and order contents. A
// signed-in customer looking up their OWN order still only needs the
// number. Everyone else (guests, or looking up someone else's number)
// must also supply the last 4 digits of the phone number on the order —
// something only the actual customer would know, not something that can
// be brute-forced by iterating order numbers.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const no = url.searchParams.get("no");
  const phoneLast4 = (url.searchParams.get("phone") || "").trim();
  if (!no) return Response.json({ error: "Enter a tracking number." }, { status: 400 });

  // The phone-last-4 check below is the real access control, but 4 digits is
  // only 10,000 possibilities: given one leaked order number, an attacker
  // could walk them all in seconds and read the customer's name, address and
  // order contents. 20 lookups per IP per 10 minutes makes that impractical
  // while leaving a genuine customer, who typically checks once or twice,
  // completely unaffected.
  const rl = await checkRateLimit(`track:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const customer = await getCurrentCustomer();

  const [o] = await db.select().from(orders).where(eq(orders.orderNo, no.toUpperCase()));
  if (o) {
    const owner = customer && customer.id === o.customerId;
    const verified = owner || (phoneLast4.length === 4 && o.customerPhone.slice(-4) === phoneLast4);
    if (!verified) {
      return Response.json(
        { error: "PHONE_REQUIRED", message: "Enter the last 4 digits of the phone number used for this order to view its status." },
        { status: 401 }
      );
    }
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    return Response.json({ type: "order", status: o.status, orderNo: o.orderNo, total: o.totalMop, items: items.map((i) => ({ name: i.name, qty: i.qty })) });
  }

  const [b] = await db.select().from(bookings).where(eq(bookings.bookingNo, no.toUpperCase()));
  if (b) {
    const owner = customer && customer.id === b.customerId;
    const verified = owner || (phoneLast4.length === 4 && b.customerPhone.slice(-4) === phoneLast4);
    if (!verified) {
      return Response.json(
        { error: "PHONE_REQUIRED", message: "Enter the last 4 digits of the phone number used for this booking to view its status." },
        { status: 401 }
      );
    }
    return Response.json({ type: "booking", status: b.status, bookingNo: b.bookingNo, service: b.serviceName, device: b.device });
  }

  return Response.json({ error: "No record found for this number." }, { status: 404 });
}
