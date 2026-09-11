/**
 * Payment state transitions.
 *
 * Three different callers drive an order's payment forward, and they race:
 *
 *   - the browser, hitting /api/payments/verify right after checkout closes
 *   - the gateway, hitting /api/payments/webhook (at least once, often more)
 *   - the reconciler, sweeping payments that got stuck
 *
 * All three funnel through this module so the transition rules exist once.
 * Every function here is written to be safe to call twice with the same input:
 * the second call must be a no-op, not a second confirmation email, not a
 * second stock release, not a second refund. That property is what keeps a
 * duplicated webhook from corrupting an order.
 */

import { db } from "@/db";
import { orders, orderItems, payments, paymentEvents, products, productVariants, stockHistory } from "@/db/schema";
import { and, eq, sql, isNull, inArray, lt } from "drizzle-orm";
import { createNotification, sendCustomerEmail } from "@/lib/notify";
import { toRupees } from "./config";
import type { RazorpayPayment } from "./razorpay";

/** Payment states an order can be in. */
export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

/**
 * Order status used while the customer is at the gateway.
 *
 * A distinct status rather than "Placed" is important operationally: staff
 * must never pack an order that hasn't been paid for. Awaiting Payment orders
 * are filtered out of the fulfilment queue.
 */
export const AWAITING_PAYMENT = "Awaiting Payment";

/**
 * Claim a webhook/callback event ID, returning false if it was already handled.
 *
 * The insert *is* the lock. Checking with a SELECT and then inserting leaves a
 * window in which two concurrent deliveries of the same event both see "not
 * handled" and both proceed — precisely the duplicate-processing bug this is
 * meant to prevent. `onConflictDoNothing` makes the check and the claim a
 * single atomic statement: exactly one caller gets a returned row.
 */
export async function claimEvent(args: {
  gateway?: string;
  eventId: string;
  eventType: string;
  paymentId?: number | null;
}): Promise<boolean> {
  if (!args.eventId) return true; // Nothing to dedupe on; let the caller proceed.
  const inserted = await db
    .insert(paymentEvents)
    .values({
      gateway: args.gateway || "razorpay",
      eventId: args.eventId,
      eventType: args.eventType,
      paymentId: args.paymentId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  return inserted.length > 0;
}

/**
 * Hand back the stock an unpaid order was holding.
 *
 * Stock is decremented when the order row is created, before the customer
 * reaches the gateway, so that two people cannot both buy the last handset.
 * The cost of reserving early is that abandoned and failed payments must give
 * it back, or the shop slowly shows itself as out of stock on items sitting on
 * the shelf.
 *
 * The `isNull(stockReleasedAt)` guard in the UPDATE is what makes this safe to
 * call from the webhook, the verify handler and the reconciler at the same
 * time: whichever transaction commits first claims the release, and the others
 * match zero rows and return without touching stock. Without it, a failed
 * payment that produced both a webhook and a reconciler visit would credit the
 * stock twice and invent inventory that does not exist.
 */
export async function releaseStock(paymentRowId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(payments)
      .set({ stockReleasedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(payments.id, paymentRowId), isNull(payments.stockReleasedAt)))
      .returning({ orderId: payments.orderId });

    if (claimed.length === 0) return false; // Someone else already released it.

    const orderId = claimed[0].orderId;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    for (const it of items) {
      const pUpdated = await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${it.qty}` })
        .where(eq(products.id, it.productId))
        .returning({ stock: products.stock });
      let vNew: number | null = null;
      if (it.variantId) {
        const vUpdated = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} + ${it.qty}` })
          .where(eq(productVariants.id, it.variantId))
          .returning({ stock: productVariants.stock });
        vNew = vUpdated[0]?.stock ?? null;
      }
      // Audit-trail row for the release: without it a failed payment's stock
      // return would appear in exports as an unexplained jump. Uses the same
      // variant-first numbers as the sale row it mirrors.
      const newStock = it.variantId && vNew !== null ? vNew : (pUpdated[0]?.stock ?? 0);
      await tx.insert(stockHistory).values({
        productId: it.productId,
        productName: it.name,
        sku: it.sku ?? "",
        oldStock: newStock - it.qty,
        newStock,
        change: it.qty,
        adminId: null,
        adminName: "",
        reason: "Payment failed or abandoned — reserved stock returned",
        movementType: "payment_release",
        orderId,
        variantId: it.variantId ?? null,
        variantLabel: it.variantLabel ?? "",
      });
    }
    return true;
  });
}

/**
 * Mark a payment (and its order) as successfully paid.
 *
 * Returns whether this call was the one that made the transition, so the
 * caller knows whether to send the confirmation email. Guarded by
 * `status <> 'captured'` in the WHERE clause rather than an if-statement on a
 * previously-read row: the guard has to be evaluated by the database at write
 * time, or two concurrent captures both read "created" and both send email.
 */
export async function markPaid(args: {
  paymentRowId: number;
  gatewayPaymentId: string;
  method?: string;
  amountPaise?: number;
  eventId?: string;
}): Promise<{ transitioned: boolean; orderId: number }> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(payments)
      .set({
        status: "captured",
        gatewayPaymentId: args.gatewayPaymentId,
        method: args.method || "",
        errorCode: "",
        errorDescription: "",
        lastEventId: args.eventId || "",
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, args.paymentRowId), sql`${payments.status} <> 'captured'`))
      .returning({ orderId: payments.orderId, amountPaise: payments.amountPaise });

    if (claimed.length === 0) {
      const [existing] = await tx.select().from(payments).where(eq(payments.id, args.paymentRowId));
      return { transitioned: false, orderId: existing?.orderId ?? 0 };
    }

    const orderId = claimed[0].orderId;

    // Only advance fulfilment out of Awaiting Payment. An order a human has
    // already moved to Packed or Shipped must not be dragged back to Placed by
    // a late webhook.
    await tx
      .update(orders)
      .set({
        paymentStatus: PAYMENT_STATUS.PAID,
        paidAt: new Date(),
        status: sql`CASE WHEN ${orders.status} = ${AWAITING_PAYMENT} THEN 'Placed' ELSE ${orders.status} END`,
      })
      .where(eq(orders.id, orderId));

    return { transitioned: true, orderId };
  });
}

/**
 * Record a failed or cancelled payment attempt and give the stock back.
 *
 * The order row is kept rather than deleted. A customer whose card was
 * declined usually retries, and keeping the order means the retry reuses the
 * same order number and the same reserved cart instead of starting over. It
 * also leaves a trail when someone asks why their bank showed a pending
 * charge that vanished.
 */
export async function markFailed(args: {
  paymentRowId: number;
  gatewayPaymentId?: string;
  errorCode?: string;
  errorDescription?: string;
  cancelled?: boolean;
  eventId?: string;
}): Promise<{ transitioned: boolean; orderId: number }> {
  const claimed = await db
    .update(payments)
    .set({
      status: args.cancelled ? "cancelled" : "failed",
      gatewayPaymentId: args.gatewayPaymentId || null,
      errorCode: (args.errorCode || "").slice(0, 120),
      errorDescription: (args.errorDescription || "").slice(0, 500),
      lastEventId: args.eventId || "",
      updatedAt: new Date(),
    })
    // A captured payment is terminal. Razorpay can deliver `payment.failed`
    // for one attempt after a later attempt on the same order succeeded, and
    // acting on it would un-pay a paid order and release stock for goods that
    // are about to ship.
    .where(and(eq(payments.id, args.paymentRowId), sql`${payments.status} NOT IN ('captured', 'refunded')`))
    .returning({ orderId: payments.orderId });

  if (claimed.length === 0) {
    const [existing] = await db.select().from(payments).where(eq(payments.id, args.paymentRowId));
    return { transitioned: false, orderId: existing?.orderId ?? 0 };
  }

  const orderId = claimed[0].orderId;
  await releaseStock(args.paymentRowId);

  // Leave the order at Awaiting Payment so a retry can pick it up, but record
  // that the money side failed.
  await db
    .update(orders)
    .set({ paymentStatus: PAYMENT_STATUS.FAILED })
    .where(and(eq(orders.id, orderId), sql`${orders.paymentStatus} <> ${PAYMENT_STATUS.PAID}`));

  return { transitioned: true, orderId };
}

/** Record a refund reported by the gateway. Supports partial refunds. */
export async function markRefunded(args: {
  paymentRowId: number;
  refundedPaise: number;
  eventId?: string;
}): Promise<{ transitioned: boolean; orderId: number; fullyRefunded: boolean }> {
  const [row] = await db.select().from(payments).where(eq(payments.id, args.paymentRowId));
  if (!row) return { transitioned: false, orderId: 0, fullyRefunded: false };

  // Refund webhooks are cumulative, not incremental — `amount_refunded` is the
  // running total. Taking the max rather than adding prevents a duplicate
  // delivery from inflating the figure past what was actually refunded.
  const refunded = Math.max(row.refundedPaise, Math.max(0, args.refundedPaise));
  const fullyRefunded = refunded >= row.amountPaise;

  if (refunded === row.refundedPaise) {
    return { transitioned: false, orderId: row.orderId, fullyRefunded };
  }

  await db
    .update(payments)
    .set({
      refundedPaise: refunded,
      status: fullyRefunded ? "refunded" : row.status,
      lastEventId: args.eventId || "",
      updatedAt: new Date(),
    })
    .where(eq(payments.id, args.paymentRowId));

  if (fullyRefunded) {
    await db
      .update(orders)
      .set({ paymentStatus: PAYMENT_STATUS.REFUNDED })
      .where(eq(orders.id, row.orderId));
  }

  return { transitioned: true, orderId: row.orderId, fullyRefunded };
}

/**
 * Apply the gateway's own view of a payment to our records.
 *
 * The gateway is the authority on whether money moved; our database is a
 * cache of that fact. Both the webhook handler and the reconciler therefore
 * end up here, passing whatever the gateway told them, rather than each
 * re-deriving the transition rules.
 */
export async function applyGatewayPayment(
  paymentRowId: number,
  gw: RazorpayPayment,
  eventId?: string
): Promise<{ status: string; transitioned: boolean; orderId: number }> {
  if (gw.status === "captured" || (gw.status === "authorized" && gw.captured)) {
    const r = await markPaid({
      paymentRowId,
      gatewayPaymentId: gw.id,
      method: gw.method,
      amountPaise: gw.amount,
      eventId,
    });
    return { status: "captured", ...r };
  }

  if (gw.status === "refunded" || (gw.amount_refunded && gw.amount_refunded >= gw.amount)) {
    const r = await markRefunded({ paymentRowId, refundedPaise: gw.amount_refunded || gw.amount, eventId });
    return { status: "refunded", transitioned: r.transitioned, orderId: r.orderId };
  }

  if (gw.status === "failed") {
    const r = await markFailed({
      paymentRowId,
      gatewayPaymentId: gw.id,
      errorCode: gw.error_code || "",
      errorDescription: gw.error_description || "",
      eventId,
    });
    return { status: "failed", ...r };
  }

  // "created" / un-captured "authorized": still in flight. Deliberately no
  // transition — the reconciler will look again later. Treating an in-flight
  // payment as failed here would release stock under a customer who is still
  // on their bank's 3-D Secure page.
  return { status: gw.status, transitioned: false, orderId: 0 };
}

/**
 * Notify shop and customer that an order is paid. Called only when
 * `markPaid` reports it actually made the transition, so duplicate webhook
 * deliveries do not produce duplicate emails.
 */
export async function notifyOrderPaid(orderId: number): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return;

  const amount = Number(order.totalMop).toLocaleString("en-IN");
  await createNotification(
    "order",
    "Payment received",
    `Order ${order.orderNo} paid online — ₹${amount} from ${order.customerName} (${order.customerPhone}).`,
    "/admin/orders"
  );

  if (order.customerEmail) {
    await sendCustomerEmail(
      order.customerEmail,
      `Payment received — ${order.orderNo}`,
      `Hi ${order.customerName},\n\nWe've received your payment of ₹${amount} for order ${order.orderNo}.\n\n` +
        `Delivery address: ${order.addressLine}, ${order.city} ${order.pincode}\n\n` +
        `You can track this order anytime from your account under Order History.\n\n` +
        `We'll let you know as it moves to Packed, Shipped and Delivered.\n\n— SMS Stores`
    );
  }
}

/**
 * Find payment attempts that need to be checked against the gateway.
 *
 * These are the orders that quietly lose a shop money. The customer pays, the
 * browser dies before it can call /api/payments/verify, and the webhook is
 * misconfigured or was dropped — so the gateway has the money and the shop
 * thinks the order was abandoned. Nobody notices until the customer
 * complains. Sweeping anything still in flight after a grace period and asking
 * the gateway directly closes that hole.
 *
 * The grace period matters: a payment started thirty seconds ago is probably a
 * customer still typing an OTP, not a stuck payment.
 */
export async function findStalePayments(opts: { olderThanMinutes?: number; limit?: number } = {}) {
  const cutoff = new Date(Date.now() - (opts.olderThanMinutes ?? 15) * 60_000);
  return db
    .select()
    .from(payments)
    .where(and(inArray(payments.status, ["created", "authorized"]), lt(payments.createdAt, cutoff)))
    .orderBy(payments.createdAt)
    .limit(Math.min(opts.limit ?? 50, 200));
}

/** Rupee amount of a payment row, for display. */
export function paymentRupees(row: { amountPaise: number }): number {
  return toRupees(row.amountPaise);
}

/**
 * Refund every captured payment on an order, called when a paid order is
 * cancelled from the admin console.
 *
 * Previously cancellation only restored stock and emailed the customer a
 * "refund is due" note — the money itself moved only when the owner remembered
 * to press Refund in the Razorpay dashboard. This executes the refund through
 * the gateway API at the moment of cancellation instead.
 *
 * Safety properties, in keeping with the rest of this module:
 *
 *  - Idempotent at the gateway: the refund call carries an idempotency key
 *    derived from the payment row, so retrying a cancellation that failed
 *    halfway cannot refund the same payment twice.
 *  - Idempotent locally: only the outstanding amount (amount minus what is
 *    already refunded) is requested; a fully refunded row is skipped.
 *  - Non-blocking: a gateway failure must not stop the cancellation itself —
 *    stock is already restored and the customer notified. The caller receives
 *    `failed > 0` and raises an admin notification so a human refunds from
 *    the dashboard, which is exactly the pre-existing manual path.
 *  - Reconciled: the refund webhook (refund.processed) reports cumulative
 *    amounts and markRefunded takes the max, so the webhook confirming this
 *    same refund later is a harmless no-op.
 */
export async function refundOrderPayments(orderId: number): Promise<{
  attempted: number;
  refunded: number;
  failed: number;
}> {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, "captured")));

  let attempted = 0;
  let refunded = 0;
  let failed = 0;

  for (const row of rows) {
    const outstanding = row.amountPaise - row.refundedPaise;
    if (!row.gatewayPaymentId || outstanding <= 0) continue;
    attempted += 1;
    try {
      const { refundPayment } = await import("./razorpay");
      const res = await refundPayment({
        paymentId: row.gatewayPaymentId,
        amountPaise: outstanding,
        idempotencyKey: `cancel-refund-${row.id}`,
        notes: { reason: "order cancelled", order_id: String(orderId) },
      });
      // Record it immediately rather than waiting for the webhook, so the
      // admin console shows the truth the moment the cancellation completes.
      await markRefunded({
        paymentRowId: row.id,
        refundedPaise: row.refundedPaise + (res.amount || outstanding),
        eventId: res.id,
      });
      refunded += 1;
    } catch (e) {
      failed += 1;
      console.error(`refund failed for payment row ${row.id} (order ${orderId})`, e);
    }
  }

  return { attempted, refunded, failed };
}
