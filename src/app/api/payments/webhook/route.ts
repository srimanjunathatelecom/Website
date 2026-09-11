import { db } from "@/db";
import { payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { webhookConfigured } from "@/lib/payments/config";
import {
  applyGatewayPayment,
  claimEvent,
  markFailed,
  markPaid,
  markRefunded,
  notifyOrderPaid,
} from "@/lib/payments/service";
import type { RazorpayPayment } from "@/lib/payments/razorpay";
import { reportError, reportWarning } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Gateway webhook receiver.
 *
 * This endpoint is what makes the payment flow survive reality. The browser
 * handshake covers the case where the customer waits patiently on the success
 * screen; webhooks cover everything else — the tab closed during the bank
 * redirect, the phone lost signal after the OTP, the payment that succeeded
 * forty seconds after the customer gave up. Without it, those become orders the
 * shop was paid for and never shipped.
 *
 * Three properties are non-negotiable here:
 *
 *   1. Unauthenticated but signed. There is no session — the caller is a
 *      server. Trust comes entirely from the HMAC over the raw body.
 *   2. Idempotent. Delivery is at-least-once; duplicates must be no-ops.
 *   3. Always 2xx once accepted. Returning 5xx makes the gateway retry with
 *      backoff and eventually disable the webhook. A payload we cannot act on
 *      is acknowledged and logged, not retried forever.
 */
export async function POST(req: Request) {
  if (!webhookConfigured()) {
    // Refuse rather than accept-and-ignore. Silently returning 200 with no
    // secret set would mean anyone who found this URL could post arbitrary
    // "payment captured" payloads and mark orders paid.
    console.error("razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Webhooks are not configured." }, { status: 503 });
  }

  // Raw text, not req.json(). The signature is computed over the exact bytes
  // sent; parsing and re-serializing changes key order and whitespace and the
  // HMAC will never match.
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  if (!verifyWebhookSignature(raw, signature)) {
    console.error("razorpay webhook signature rejected", { bytes: raw.length });
    // 400, not 401: this is a malformed/forged request, and there is no
    // credential the caller could add to fix it.
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: {
    event?: string;
    id?: string;
    payload?: { payment?: { entity?: RazorpayPayment }; refund?: { entity?: { payment_id?: string; amount?: number } } };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventType = String(event.event || "");
  // Razorpay sends its event id in a header on newer accounts and in the body
  // on others. Falling back to a composite key means dedupe still works either
  // way rather than silently degrading to "process everything twice".
  const eventId =
    req.headers.get("x-razorpay-event-id") ||
    String(event.id || "") ||
    `${eventType}:${event.payload?.payment?.entity?.id || event.payload?.refund?.entity?.payment_id || raw.length}`;

  const entity = event.payload?.payment?.entity;

  try {
    // ---- Refunds ----
    if (eventType.startsWith("refund.")) {
      const refundPaymentId = event.payload?.refund?.entity?.payment_id || entity?.id || "";
      if (!refundPaymentId) return ack("no payment reference on refund event");

      const row = await findByGatewayPaymentId(refundPaymentId);
      if (!row) return ack("unknown payment on refund event");

      if (!(await claimEvent({ eventId, eventType, paymentId: row.id }))) return ack("duplicate");

      // Prefer the payment entity's cumulative total when present; a single
      // refund entity's amount is only this refund's slice.
      const refundedPaise = entity?.amount_refunded ?? event.payload?.refund?.entity?.amount ?? 0;
      await markRefunded({ paymentRowId: row.id, refundedPaise, eventId });
      return ack("refund recorded");
    }

    // ---- Payments ----
    if (!entity?.id) return ack("no payment entity");

    // Match on the gateway *order* id, because our payment row exists before
    // any payment id does. Falling back to the payment id covers events for
    // attempts created outside our own create flow.
    const row =
      (entity.order_id ? await findByGatewayOrderId(entity.order_id) : null) ||
      (await findByGatewayPaymentId(entity.id));

    if (!row) {
      // Not an error worth retrying: most likely a payment made from another
      // integration against the same merchant account.
      // Not an exception, but it means money moved for an order we can't find.
      reportWarning("razorpay webhook for unknown payment", "api/payments/webhook", {
        razorpayOrderId: entity.order_id,
        razorpayPaymentId: entity.id,
      });
      return ack("unknown payment");
    }

    if (!(await claimEvent({ eventId, eventType, paymentId: row.id }))) return ack("duplicate");

    if (eventType === "payment.captured" || eventType === "order.paid") {
      const r = await markPaid({
        paymentRowId: row.id,
        gatewayPaymentId: entity.id,
        method: entity.method || "",
        amountPaise: entity.amount,
        eventId,
      });
      if (r.transitioned) await notifyOrderPaid(r.orderId);
      return ack("captured");
    }

    if (eventType === "payment.failed") {
      await markFailed({
        paymentRowId: row.id,
        gatewayPaymentId: entity.id,
        errorCode: entity.error_code || "",
        errorDescription: entity.error_description || "",
        eventId,
      });
      return ack("failed");
    }

    // Anything else (payment.authorized, payment.pending, and events added by
    // the gateway in future) is handled by applying the entity's own state
    // through the shared transition rules. An unrecognised event type is not a
    // reason to drop information the gateway just gave us.
    const applied = await applyGatewayPayment(row.id, entity, eventId);
    if (applied.status === "captured" && applied.transitioned) await notifyOrderPaid(applied.orderId);
    return ack(`applied:${applied.status}`);
  } catch (e) {
    // Signature already verified, so this is our bug, not a forged request.
    // 500 here is correct: it asks the gateway to redeliver, and the dedupe
    // ledger makes that redelivery safe.
    // Razorpay retries a non-2xx, so this is recoverable — but a webhook that
    // keeps failing means paid orders are not being marked paid, which is the
    // most expensive silent failure in the app. Route it through the reporter so
    // it can page someone rather than sitting in a log.
    reportError(e, "api/payments/webhook", { eventType, eventId });
    return Response.json({ error: "Handler error." }, { status: 500 });
  }
}

/** Acknowledge a delivery. Always 200 so the gateway stops retrying. */
function ack(note: string) {
  return Response.json({ ok: true, note });
}

async function findByGatewayOrderId(gatewayOrderId: string) {
  const [row] = await db.select().from(payments).where(eq(payments.gatewayOrderId, gatewayOrderId));
  return row || null;
}

async function findByGatewayPaymentId(gatewayPaymentId: string) {
  const [row] = await db.select().from(payments).where(eq(payments.gatewayPaymentId, gatewayPaymentId));
  return row || null;
}
