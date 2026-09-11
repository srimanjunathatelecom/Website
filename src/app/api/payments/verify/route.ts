import { db } from "@/db";
import { orders, payments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentCustomer } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { paymentsConfigured } from "@/lib/payments/config";
import { verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { markFailed, markPaid, notifyOrderPaid, PAYMENT_STATUS } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/**
 * Confirm a payment using the signed handshake the gateway hands to the
 * browser when checkout succeeds.
 *
 * This is the fast path: it runs while the customer is still watching, so the
 * order page can say "paid" immediately instead of waiting for a webhook that
 * may take seconds. The webhook remains the authority for anything this path
 * misses — a customer who closes the tab mid-redirect never calls this, and
 * the reconciler catches whatever the webhook also misses.
 *
 * The security of the whole online flow rests on the signature check below.
 * The request comes from the browser, so every field in it is attacker-
 * controlled; the only thing that cannot be forged is an HMAC computed with
 * the key secret.
 */
export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in." }, { status: 401 });
  if (!paymentsConfigured()) return Response.json({ error: "Online payment is not configured." }, { status: 503 });

  // Signature verification is cheap, but this endpoint should not be a free
  // oracle for testing forged signatures at speed.
  const limit = await checkRateLimit(`payments:verify:${customer.id}:${clientIp(req)}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  let body: {
    razorpay_order_id?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
    failed?: unknown;
    reason?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const gatewayOrderId = typeof body.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  if (!gatewayOrderId) return Response.json({ error: "Missing payment reference." }, { status: 400 });

  // Look the attempt up by gateway order id *and* ownership. The join through
  // orders.customerId is what stops one customer confirming or cancelling
  // another customer's payment by passing a gateway order id they observed.
  const [found] = await db
    .select({ payment: payments, order: orders })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.gatewayOrderId, gatewayOrderId), eq(orders.customerId, customer.id)));

  if (!found) return Response.json({ error: "Payment not found." }, { status: 404 });

  // The customer closed or cancelled the gateway sheet. Reported by the
  // browser, and safe to trust *because* it is the pessimistic direction: the
  // worst a forged cancellation can do is release the caller's own stock and
  // leave their own order unpaid. A forged *success* is the dangerous one, and
  // that requires a valid signature below.
  if (body.failed) {
    const r = await markFailed({
      paymentRowId: found.payment.id,
      cancelled: true,
      errorCode: "cancelled_by_user",
      errorDescription: typeof body.reason === "string" ? body.reason : "Payment cancelled at the gateway.",
    });
    return Response.json({ ok: false, cancelled: true, orderNo: found.order.orderNo, transitioned: r.transitioned });
  }

  const gatewayPaymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body.razorpay_signature === "string" ? body.razorpay_signature : "";

  const valid = verifyCheckoutSignature({ gatewayOrderId, gatewayPaymentId, signature });

  if (!valid) {
    // A bad signature is not a customer mistake — it is either a corrupted
    // handshake or someone trying to mark an order paid for free. Log it for
    // review, do not transition anything, and do not explain to the caller
    // which part failed.
    console.error("payment signature verification failed", {
      gatewayOrderId,
      customerId: customer.id,
      paymentRowId: found.payment.id,
    });
    return Response.json(
      { error: "We could not verify this payment. If money has left your account it will be confirmed shortly." },
      { status: 400 }
    );
  }

  const result = await markPaid({
    paymentRowId: found.payment.id,
    gatewayPaymentId,
    eventId: `verify:${gatewayPaymentId}`,
  });

  // Only on the transition, so a customer refreshing the confirmation page
  // does not trigger a second confirmation email.
  if (result.transitioned) await notifyOrderPaid(result.orderId);

  return Response.json({
    ok: true,
    paid: true,
    orderId: found.order.id,
    orderNo: found.order.orderNo,
    paymentStatus: PAYMENT_STATUS.PAID,
  });
}
