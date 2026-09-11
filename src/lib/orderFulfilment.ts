import { orderItems, orders, payments, products, productVariants, stockHistory } from "@/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { AWAITING_PAYMENT, PAYMENT_STATUS } from "@/lib/payments/service";
import { isOnlineMethod } from "@/lib/payments/config";
import type { db as Database } from "@/db";

/**
 * Shared fulfilment rules for order status changes.
 *
 * Both the single-order route and the bulk route need identical behaviour here.
 * They previously each carried their own copy of the stock-restore loop, which
 * is exactly how the two of them ended up with the same two bugs.
 */

/** A Drizzle transaction handle, or the base db when no transaction is needed. */
type Tx = Parameters<Parameters<typeof Database.transaction>[0]>[0];

/** Statuses that mean goods physically move. Cancelling is always allowed. */
const FULFILMENT_STATUSES = ["Packed", "Shipped", "Out for Delivery", "Delivered"];

type OrderRow = {
  status: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
};

/**
 * Whether an order may be advanced to a fulfilment status.
 *
 * The point of this guard is narrow and important: an order paid for online is
 * only really an order once the money arrives. Until then its stock is merely
 * reserved. Without this check, a member of staff working the orders list could
 * move an "Awaiting Payment" row to Packed and ship goods that were never paid
 * for — the customer's card was declined, or they closed the tab at the bank
 * page, and nothing in the interface distinguished that row from a real order.
 *
 * Cash on Delivery is unaffected: those orders are *supposed* to be unpaid
 * while they're being packed.
 */
export function fulfilmentBlockReason(order: OrderRow, newStatus: string): string | null {
  if (!FULFILMENT_STATUSES.includes(newStatus)) return null;

  if (order.status === AWAITING_PAYMENT) {
    return "This order is still awaiting online payment and has not been paid for. Cancel it, or wait for the payment to complete, before packing or dispatching it.";
  }

  // Defence in depth: catches an online order whose fulfilment status was
  // moved off Awaiting Payment by some other path while the money never landed.
  if (isOnlineMethod(order.paymentMethod) && order.paymentStatus !== PAYMENT_STATUS.PAID) {
    return "This order was placed for online payment but no successful payment has been recorded against it, so it cannot be dispatched.";
  }

  return null;
}

/**
 * Return the stock reserved by the given orders.
 *
 * Two things this fixes over the per-route loops it replaces:
 *
 *  1. Variant stock. Order creation decrements both `products.stock` and
 *     `productVariants.stock`, but cancellation only ever restored the product
 *     row. Every cancelled order with a variant permanently destroyed that
 *     variant's stock, so a shop cancelling orders would slowly show options as
 *     unavailable that were sitting on the shelf.
 *
 *  2. Double credit. An order awaiting online payment holds stock that the
 *     payment layer also knows how to release (via `payments.stockReleasedAt`).
 *     If an admin cancelled such an order and a `payment.failed` webhook then
 *     arrived, both paths would credit the same units. Claiming the release
 *     marker here means whichever path runs first wins and the other becomes a
 *     no-op — the same claim the webhook and the reconciler already compete over.
 */
export async function restoreOrderStock(tx: Tx, orderIds: number[]): Promise<void> {
  if (orderIds.length === 0) return;

  // Claim the release marker for any outstanding payment attempts on these
  // orders, so the payment layer cannot later credit the same units again.
  await tx
    .update(payments)
    .set({ stockReleasedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(payments.orderId, orderIds), isNull(payments.stockReleasedAt)));

  const items = await tx.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));

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

    // Mirror of the "sale" movement written at order creation: returning
    // units to the shelf is itself a stock movement the audit must show,
    // otherwise cancelled orders would leave unexplained jumps in the
    // stock-history export. Variant items log the variant's own numbers so
    // the trail matches what the sale row recorded.
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
      reason: "Order cancelled — stock returned to shelf",
      movementType: "cancel_restore",
      orderId: it.orderId,
      variantId: it.variantId ?? null,
      variantLabel: it.variantLabel ?? "",
    });
  }
}

/**
 * Note on the customer's cancellation email when money is owed back.
 *
 * Cancelling a paid order does not refund it — the refund is a deliberate
 * action taken in the gateway dashboard or via the admin refund control. The
 * customer is told the truth either way rather than being promised a refund
 * that may not have been issued, or left wondering about one that has.
 */
export function refundNoteFor(order: OrderRow): string {
  if (isOnlineMethod(order.paymentMethod) && order.paymentStatus === PAYMENT_STATUS.PAID) {
    return "\n\nYou paid for this order online, so a refund is due to you. It will be issued to your original payment method and usually reaches your account within 5-7 working days.";
  }
  return "";
}

/** Orders that are genuinely awaiting fulfilment, for dashboard counts. */
export const FULFILMENT_QUEUE_STATUSES = ["Placed", "Packed", "Shipped", "Out for Delivery"];

/** True when this order is sitting unpaid and should not appear as work to do. */
export function isAwaitingPayment(order: { status: string }): boolean {
  return order.status === AWAITING_PAYMENT;
}

export { AWAITING_PAYMENT };

/** Convenience for routes that need the raw orders table reference. */
export const ordersTable = orders;
