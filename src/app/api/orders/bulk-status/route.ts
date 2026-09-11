import { db } from "@/db";
import { orders } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { createNotification, sendCustomerEmail } from "@/lib/notify";
import { fulfilmentBlockReason, refundNoteFor, restoreOrderStock } from "@/lib/orderFulfilment";
import { PAYMENT_STATUS, refundOrderPayments } from "@/lib/payments/service";
import { isOnlineMethod, paymentsConfigured } from "@/lib/payments/config";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["Placed", "Packed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];
const TERMINAL_STATUSES = ["Delivered", "Cancelled"];

const STATUS_MESSAGES: Record<string, string> = {
  Placed: "Your order has been placed and is being prepared.",
  Packed: "Your order has been packed and will be shipped soon.",
  Shipped: "Your order is on its way!",
  "Out for Delivery": "Your order is out for delivery today.",
  Delivered: "Your order has been delivered. Thank you for shopping with us!",
  Cancelled: "Your order has been cancelled.",
};

// Bulk status update only — deliberately does not accept or touch any
// pricing/item fields, so a bulk action can never alter an order's
// amount. Mirrors the single-order PUT in /api/orders/[id]: same stock
// restore on cancellation, same per-customer status email, just applied to
// many ids in one request with one summary admin notification instead of
// one per order.
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { ids?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const status = String(body.status ?? "");

  if (ids.length === 0) return Response.json({ error: "No orders selected." }, { status: 400 });
  if (ids.length > 200) return Response.json({ error: "Too many orders selected at once (max 200)." }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) {
    return Response.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.` }, { status: 400 });
  }

  const existing = await db.select().from(orders).where(inArray(orders.id, ids));
  if (existing.length === 0) return Response.json({ error: "None of the selected orders were found." }, { status: 404 });

  // Same lifecycle rule as the single-order route: once an order is
  // Delivered or Cancelled, no further transition is valid. A mixed
  // selection (some terminal, some not) still applies to the eligible
  // orders rather than failing the whole batch — the response's `locked`
  // count tells the admin how many were skipped and why.
  const eligible = existing.filter((o) => !TERMINAL_STATUSES.includes(o.status));
  const locked = existing.length - eligible.length;

  // Orders that haven't been paid for are held back from the batch rather than
  // failing it. Selecting a page of orders and marking them Packed is the
  // normal way this screen is used, and one unpaid row in the selection must
  // not become a shipped-but-unpaid order — nor block the genuine work.
  const payable = eligible.filter((o) => fulfilmentBlockReason(o, status) === null);
  const unpaidBlocked = eligible.length - payable.length;
  const toUpdate = payable.filter((o) => o.status !== status);

  if (toUpdate.length > 0) {
    const updateIds = toUpdate.map((o) => o.id);

    await db.transaction(async (tx) => {
      await tx.update(orders).set({ status }).where(inArray(orders.id, updateIds));

      // Only orders that weren't already Cancelled restore stock — same
      // guard as the single-order route, so re-running a bulk action over
      // an order that's already Cancelled never double-restores its items.
      if (status === "Cancelled") {
        const cancelIds = toUpdate.filter((o) => o.status !== "Cancelled").map((o) => o.id);
        await restoreOrderStock(tx, cancelIds);
      }
    });

    const orderNos = toUpdate.slice(0, 5).map((o) => o.orderNo).join(", ");
    const suffix = toUpdate.length > 5 ? ` and ${toUpdate.length - 5} more` : "";
    await createNotification(
      "order",
      `${toUpdate.length} order${toUpdate.length === 1 ? "" : "s"} updated`,
      `Status changed to "${status}" for ${orderNos}${suffix}.`,
      `/admin/orders`
    );

    const message = STATUS_MESSAGES[status] || `Your order status has been updated to "${status}".`;
    for (const o of toUpdate) {
      // Same automatic refund as the single-order route — see the comment
      // there. Failures never block the batch; they raise an admin
      // notification and the customer keeps the generic refund note.
      let refundNote = status === "Cancelled" ? refundNoteFor(o) : "";
      if (
        status === "Cancelled" &&
        o.status !== "Cancelled" &&
        o.paymentStatus === PAYMENT_STATUS.PAID &&
        isOnlineMethod(o.paymentMethod) &&
        paymentsConfigured()
      ) {
        const result = await refundOrderPayments(o.id);
        if (result.attempted > 0 && result.failed === 0) {
          refundNote =
            "\n\nYour refund has been initiated to your original payment method. It usually reaches your account within 5-7 working days.";
        } else if (result.failed > 0) {
          await createNotification(
            "order",
            `Refund needs attention — order ${o.orderNo}`,
            `Order ${o.orderNo} was cancelled in a bulk update but the automatic refund could not be completed. ` +
              `Please issue the refund from the Razorpay dashboard.`,
            `/admin/orders`
          );
        }
      }
      await sendCustomerEmail(
        o.customerEmail,
        `Order ${o.orderNo} — ${status}`,
        `Hi ${o.customerName},\n\n${message}${refundNote}\n\nOrder: ${o.orderNo}\nStatus: ${status}\n\nYou can view your invoice anytime from your account under Order History.\n\n— SMS Stores`
      );
    }
  }

  return Response.json({
    ok: true,
    updated: toUpdate.length,
    unchanged: payable.length - toUpdate.length,
    locked,
    unpaidBlocked,
    notFound: ids.length - existing.length,
  });
}