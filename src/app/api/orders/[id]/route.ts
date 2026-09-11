import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { createNotification, sendCustomerEmail } from "@/lib/notify";
import { fulfilmentBlockReason, refundNoteFor, restoreOrderStock } from "@/lib/orderFulfilment";
import { PAYMENT_STATUS, refundOrderPayments } from "@/lib/payments/service";
import { isOnlineMethod, paymentsConfigured } from "@/lib/payments/config";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  const customer = await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) return Response.json({ error: "Not found" }, { status: 404 });
  if (!admin && o.customerId !== customer!.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return Response.json({ order: o, items });
}

const STATUS_MESSAGES: Record<string, string> = {
  Placed: "Your order has been placed and is being prepared.",
  Packed: "Your order has been packed and will be shipped soon.",
  Shipped: "Your order is on its way!",
  "Out for Delivery": "Your order is out for delivery today.",
  Delivered: "Your order has been delivered. Thank you for shopping with us!",
  Cancelled: "Your order has been cancelled.",
};

// The forward lifecycle TrackClient.tsx renders as a progress timeline
// (ORDER_STEPS) — any status outside this list would silently break that
// UI (indexOf returns -1) and desynchronize the order's real-world state
// from what's stored. Cancelled is reachable from any non-terminal status;
// Delivered and Cancelled are terminal — no further transition is valid
// once an order reaches either.
const ORDER_LIFECYCLE = ["Placed", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const TERMINAL_STATUSES = ["Delivered", "Cancelled"];

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await _req.json();
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) return Response.json({ error: "Not found" }, { status: 404 });
  const newStatus = b.status || o.status;

  if (newStatus !== o.status) {
    if (!ORDER_LIFECYCLE.includes(newStatus) && newStatus !== "Cancelled") {
      return Response.json({ error: `"${newStatus}" is not a valid order status.` }, { status: 400 });
    }
    if (TERMINAL_STATUSES.includes(o.status)) {
      return Response.json({ error: `This order is already "${o.status}" and cannot be moved to another status.` }, { status: 400 });
    }

    // Refuse to dispatch goods that haven't been paid for. See
    // fulfilmentBlockReason for why this is a server-side rule and not just a
    // disabled dropdown option.
    const blocked = fulfilmentBlockReason(o, newStatus);
    if (blocked) return Response.json({ error: blocked }, { status: 409 });

    // Cancelling an order that hadn't already been cancelled restores the
    // stock it reserved. Runs in a transaction with the status update so a
    // failure partway through can't leave stock restored but the order
    // still showing an old status, or vice versa. Guarded by the status
    // check above and o.status !== "Cancelled" below so restoring can never
    // double-run (e.g. Cancelled -> Cancelled, or re-saving the same
    // status), which would inflate stock beyond what was actually ordered.
    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status: newStatus }).where(eq(orders.id, id));
      if (newStatus === "Cancelled" && o.status !== "Cancelled") {
        await restoreOrderStock(tx, [id]);
      }
    });

    // Cancelling a paid online order now moves the money back through the
    // gateway API instead of waiting for a manual dashboard refund. Runs
    // after the status transaction: the cancellation itself must stand even
    // if the gateway is unreachable, in which case the owner is notified to
    // refund by hand — exactly the previous manual path, now as fallback.
    let refundNote = newStatus === "Cancelled" ? refundNoteFor(o) : "";
    if (
      newStatus === "Cancelled" &&
      o.status !== "Cancelled" &&
      o.paymentStatus === PAYMENT_STATUS.PAID &&
      isOnlineMethod(o.paymentMethod) &&
      paymentsConfigured()
    ) {
      const result = await refundOrderPayments(id);
      if (result.attempted > 0 && result.failed === 0) {
        refundNote =
          "\n\nYour refund has been initiated to your original payment method. It usually reaches your account within 5-7 working days.";
      } else if (result.failed > 0) {
        await createNotification(
          "order",
          `Refund needs attention — order ${o.orderNo}`,
          `Order ${o.orderNo} was cancelled but the automatic refund could not be completed ` +
            `(${result.failed} of ${result.attempted} attempts failed). Please issue the refund from the Razorpay dashboard.`,
          `/admin/orders`
        );
      }
    }

    await createNotification(
      "order",
      `Order ${o.orderNo} updated`,
      `Status changed to "${newStatus}". Customer: ${o.customerName} (${o.customerPhone}).`,
      `/admin/orders`
    );
    const message = STATUS_MESSAGES[newStatus] || `Your order status has been updated to "${newStatus}".`;
    await sendCustomerEmail(
      o.customerEmail,
      `Order ${o.orderNo} — ${newStatus}`,
      `Hi ${o.customerName},\n\n${message}${refundNote}\n\nOrder: ${o.orderNo}\nStatus: ${newStatus}\n\nYou can view your invoice anytime from your account under Order History.\n\n— SMS Stores`
    );
  }
  return Response.json({ ok: true });
}
