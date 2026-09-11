import { db } from "@/db";
import { orders, payments, storeSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentCustomer } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { paymentsConfigured, razorpaySecrets, toPaise } from "@/lib/payments/config";
import { createGatewayOrder, PaymentGatewayError } from "@/lib/payments/razorpay";
import { AWAITING_PAYMENT, PAYMENT_STATUS } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/**
 * Open a gateway order for an order that is already sitting in our database
 * awaiting payment.
 *
 * Order creation and gateway-order creation are deliberately two steps. If the
 * gateway call were folded into POST /api/orders, a gateway timeout would
 * leave the shop with no record of the attempt at all — and if the gateway had
 * in fact created the order, the customer could still pay against something we
 * never stored. Writing our order first means every payment attempt has a
 * durable local anchor before any money is involved, and a retry has somewhere
 * to attach.
 */
export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in to pay for your order." }, { status: 401 });

  if (!paymentsConfigured()) {
    return Response.json(
      { error: "Online payment is not available right now. Please choose Cash on Delivery." },
      { status: 503 }
    );
  }

  // Creating gateway orders is an outbound, billable, rate-limited call to a
  // third party. Without a limit here a script could hammer this endpoint and
  // both exhaust the gateway's own rate limit for the merchant (breaking
  // checkout for real customers) and fill the payments table.
  const limit = await checkRateLimit(`payments:create:${customer.id}:${clientIp(req)}`, 12, 60_000);
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

  // Scoped to this customer's own orders. Looking the order up by id alone
  // would be an IDOR: anyone could enumerate order ids, open a gateway order
  // against a stranger's order and read back that stranger's name, phone and
  // order total from the response.
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customer.id)));

  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    // Not an error from the customer's point of view — they probably
    // double-submitted or came back to a stale tab. Tell them it's done.
    return Response.json({ alreadyPaid: true, orderNo: order.orderNo });
  }
  if (order.status !== AWAITING_PAYMENT) {
    return Response.json({ error: "This order is not awaiting payment." }, { status: 409 });
  }

  // The amount comes from the order row, which was computed server-side from
  // database prices. It is never taken from the request body — that would let
  // a customer pay ₹1 for a ₹80,000 handset.
  const amountPaise = toPaise(order.totalMop);
  if (amountPaise < 100) {
    return Response.json({ error: "This order total cannot be paid online." }, { status: 400 });
  }

  // Reuse an in-flight attempt rather than opening a second gateway order for
  // the same cart. A customer who taps Pay, closes the sheet and taps again
  // should land back on the same gateway order; two open orders for one cart
  // is how a shop ends up charging twice.
  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, "created")));

  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));

  // The publishable key id is returned with the order so a caller can open the
  // checkout sheet from one response. It is the public half of the credential
  // pair and is designed to be exposed in the browser; the secret never leaves
  // the server.
  const keyId = razorpaySecrets().keyId;
  const brandName = settings?.brandName || "SMS Stores";

  if (existing?.gatewayOrderId && existing.amountPaise === amountPaise) {
    return Response.json({
      gatewayOrderId: existing.gatewayOrderId,
      amountPaise: existing.amountPaise,
      currency: existing.currency,
      orderNo: order.orderNo,
      paymentId: existing.id,
      keyId,
      name: brandName,
      prefill: prefillFor(order),
    });
  }

  // Our payment row is written before the gateway call so that a timeout still
  // leaves a traceable attempt, and so its id can seed the idempotency key.
  const [row] = await db
    .insert(payments)
    .values({
      orderId: order.id,
      gateway: "razorpay",
      amountPaise,
      currency: "INR",
      status: "created",
    })
    .returning();

  try {
    const gwOrder = await createGatewayOrder({
      amountPaise,
      currency: "INR",
      receipt: order.orderNo,
      notes: {
        orderNo: order.orderNo,
        // Useful in the Razorpay dashboard when support has a phone number and
        // nothing else to go on.
        customerPhone: order.customerPhone || "",
      },
      // Derived from our own payment row id, so a retry of *this* request
      // reuses the key and the gateway returns the order it already made
      // rather than creating a duplicate.
      idempotencyKey: `sms-pay-${row.id}`,
    });

    await db
      .update(payments)
      .set({ gatewayOrderId: gwOrder.id, updatedAt: new Date() })
      .where(eq(payments.id, row.id));

    return Response.json({
      gatewayOrderId: gwOrder.id,
      amountPaise,
      currency: "INR",
      orderNo: order.orderNo,
      paymentId: row.id,
      keyId,
      name: brandName,
      prefill: prefillFor(order),
    });
  } catch (e) {
    // Record why the attempt died. An empty payments row with no explanation is
    // useless three days later when the customer asks what happened.
    const message = e instanceof PaymentGatewayError ? e.message : "Could not start the payment.";
    await db
      .update(payments)
      .set({
        status: "failed",
        errorCode: e instanceof PaymentGatewayError ? e.gatewayCode || String(e.status) : "internal",
        errorDescription: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, row.id));

    if (!(e instanceof PaymentGatewayError)) console.error("payment create failed", e);
    // Stock stays reserved: the order is still Awaiting Payment and the
    // customer can retry. It is released by the reconciler if they never do.
    return Response.json({ error: message }, { status: 502 });
  }
}

/**
 * Prefill for the gateway's checkout sheet. Pre-filling the contact details
 * the customer already gave us removes a form they should not have to fill in
 * twice, which is one of the larger drop-off points in a mobile checkout.
 */
function prefillFor(order: { customerName: string; customerEmail: string; customerPhone: string }) {
  return {
    name: order.customerName || "",
    email: order.customerEmail || "",
    contact: order.customerPhone || "",
  };
}
