import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentCustomer } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { createNotification, sendCustomerEmail } from "@/lib/notify";
import { PAYMENT_METHODS } from "@/lib/payments/config";
import { AWAITING_PAYMENT, PAYMENT_STATUS } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/**
 * Convert an order that is stuck awaiting online payment into Cash on Delivery.
 *
 * This exists to prevent a duplicate order, which is the obvious bug in the
 * shape of this flow: a customer whose card is declined switches to Cash on
 * Delivery and taps the button again. Without this endpoint the checkout page
 * would file a *second* order for the same cart, reserving the stock twice and
 * leaving the shop with two orders to reconcile and a customer who may be
 * charged for one of them.
 *
 * Converting instead reuses the order that already exists, keeps its order
 * number and its existing stock reservation, and needs no stock movement at
 * all — the goods were already set aside when the order was created.
 */
export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in." }, { status: 401 });

  const limit = await checkRateLimit(`payments:cod:${customer.id}:${clientIp(req)}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  let body: { orderId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return Response.json({ error: "Invalid order." }, { status: 400 });
  }

  // Ownership is part of the lookup, not a later check — otherwise this is an
  // IDOR that lets anyone flip a stranger's paid online order to Cash on
  // Delivery.
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)));

  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    return Response.json({ error: "This order is already paid." }, { status: 409 });
  }
  if (order.status !== AWAITING_PAYMENT) {
    return Response.json({ error: "This order is not awaiting payment." }, { status: 409 });
  }

  // Close out any in-flight gateway attempts so the reconciler doesn't later
  // find them, decide they were abandoned, and release stock out from under an
  // order that is now a live Cash on Delivery order due for dispatch.
  //
  // `stockReleasedAt` is set here without touching stock on purpose: it marks
  // the reservation as accounted for, which is exactly what it now is — held by
  // the COD order rather than by the payment attempt.
  await db
    .update(payments)
    .set({
      status: "cancelled",
      errorCode: "switched_to_cod",
      errorDescription: "Customer chose Cash on Delivery instead.",
      stockReleasedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(payments.orderId, order.id), inArray(payments.status, ["created", "authorized"])));

  // Guarded on the status again so a webhook that lands between the read above
  // and this write (marking the order paid) wins, rather than being overwritten
  // and turning a paid order into an unpaid COD one.
  const updated = await db
    .update(orders)
    .set({
      paymentMethod: PAYMENT_METHODS.COD,
      paymentStatus: PAYMENT_STATUS.PENDING,
      status: "Placed",
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, AWAITING_PAYMENT)))
    .returning();

  if (updated.length === 0) {
    return Response.json({ error: "This order was just updated. Please refresh." }, { status: 409 });
  }

  // The order is only genuinely placed now, so this is the right moment for the
  // notifications that the online path deliberately withheld.
  const amount = Number(order.totalMop).toLocaleString("en-IN");
  await createNotification(
    "order",
    "New order placed",
    `Order ${order.orderNo} by ${order.customerName} (${order.customerPhone}) — ₹${amount}, Cash on Delivery.`,
    "/admin/orders"
  );
  if (order.customerEmail) {
    await sendCustomerEmail(
      order.customerEmail,
      `Order confirmed — ${order.orderNo}`,
      `Hi ${order.customerName},\n\nYour order ${order.orderNo} has been placed and will be paid by cash on delivery.\n\n` +
        `Order total: ₹${amount}\nDelivery address: ${order.addressLine}, ${order.city} ${order.pincode}\n\n` +
        `You can view your invoice anytime from your account under Order History.\n\n— SMS Stores`
    );
  }

  return Response.json({ ok: true, orderId: order.id, orderNo: order.orderNo, status: "Placed" });
}
