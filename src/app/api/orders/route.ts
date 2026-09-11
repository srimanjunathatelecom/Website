import { db } from "@/db";
import { orders, orderItems, products, productVariants, customers, addresses, coupons, outlets, stockHistory } from "@/db/schema";
import { eq, desc, and, inArray, or, ilike, gte, lte, sql } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { createNotification, sendCustomerEmail } from "@/lib/notify";
import { evaluateCoupon } from "@/lib/coupon";
import { isOnlineMethod, normalizePaymentMethod, paymentsConfigured } from "@/lib/payments/config";
import { AWAITING_PAYMENT, PAYMENT_STATUS } from "@/lib/payments/service";
import { resolveCartLine } from "@/lib/cartPricing";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

function genOrderNo() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear().toString().slice(2)}`;
  // crypto.randomBytes rather than Math.random(): this suffix, combined
  // with the phone-verification check on /api/track, is the only thing
  // standing between a guesser and another customer's order — Math.random()
  // is not a CSPRNG and shouldn't back anything used as a lookup secret.
  const crypto = require("crypto");
  const rnd = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `SMS${stamp}${rnd}`;
}

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  const customer = await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let rows;
  if (admin) {
    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim();
    const status = url.searchParams.get("status")?.trim();
    const paymentMethod = url.searchParams.get("paymentMethod")?.trim();
    const dateFrom = url.searchParams.get("dateFrom")?.trim();
    const dateTo = url.searchParams.get("dateTo")?.trim();
    const minAmount = url.searchParams.get("minAmount")?.trim();
    const maxAmount = url.searchParams.get("maxAmount")?.trim();

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(orders.orderNo, `%${search}%`),
          ilike(orders.customerName, `%${search}%`),
          ilike(orders.customerPhone, `%${search}%`),
          ilike(orders.customerEmail, `%${search}%`)
        )
      );
    }
    if (status && status !== "all") conditions.push(eq(orders.status, status));
    if (paymentMethod && paymentMethod !== "all") conditions.push(eq(orders.paymentMethod, paymentMethod));
    if (dateFrom) conditions.push(gte(orders.createdAt, new Date(dateFrom)));
    if (dateTo) {
      // End-of-day for the "to" date so the selected day is inclusive.
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(orders.createdAt, end));
    }
    if (minAmount) conditions.push(gte(orders.totalMop, minAmount));
    if (maxAmount) conditions.push(lte(orders.totalMop, maxAmount));

    rows = await db
      .select()
      .from(orders)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(300);
  } else {
    rows = await db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customer!.id))
      .orderBy(desc(orders.createdAt));
  }

  // Scoped to just the orders we're returning — previously this fetched
  // every order_items row in the entire table on every request, which
  // gets slower with every order the store has ever taken.
  const orderIds = rows.map((o) => o.id);
  const items = orderIds.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
  const byOrder = new Map<number, any[]>();
  for (const it of items) {
    const arr = byOrder.get(it.orderId) || [];
    arr.push(it);
    byOrder.set(it.orderId, arr);
  }
  const result = rows.map((o) => ({ order: o, items: byOrder.get(o.id) || [] }));
  return Response.json({ items: result });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return Response.json({ error: "Please log in to place an order." }, { status: 401 });

  try {
    const b = await req.json();
    const cart = Array.isArray(b.items) ? b.items : [];
    if (cart.length === 0) return Response.json({ error: "Your cart is empty." }, { status: 400 });

    // The payment method is now validated against the methods this shop
    // actually supports, instead of being written to the order as free text.
    // Previously any string the client sent was stored verbatim, so a crafted
    // request could file an order that read "Paid in full via UPI" in the
    // admin's list without a rupee having moved.
    const paymentMethod = normalizePaymentMethod(b.paymentMethod);
    if (!paymentMethod) {
      return Response.json({ error: "Please choose a valid payment method." }, { status: 400 });
    }
    const online = isOnlineMethod(paymentMethod);
    // NOTE: gateway availability is checked *after* the grand total is known
    // (inside the transaction below). A coupon can cover the whole cart, and a
    // ₹0 order needs no gateway at all — rejecting it here just because
    // Razorpay keys are absent would strand a customer who owes nothing.

    let addressLine = String(b.address?.line || "").trim();
    let city = String(b.address?.city || "Bengaluru").trim();
    let pincode = String(b.address?.pincode || "").trim();

    if (b.addressId) {
      const [addr] = await db.select().from(addresses).where(and(eq(addresses.id, Number(b.addressId)), eq(addresses.customerId, customer.id)));
      if (addr) {
        addressLine = addr.line;
        city = addr.city;
        pincode = addr.pincode;
      }
    }

    // The delivery address was only ever checked in the browser, which is not a
    // check at all — anything posting straight to this route could file an order
    // with no address whatsoever. Those orders reach the packing bench looking
    // perfectly normal and cannot be delivered, and the shop only finds out once
    // someone tries to print a label.
    if (!addressLine) {
      return Response.json({ error: "Please provide a delivery address." }, { status: 400 });
    }
    if (!city) {
      return Response.json({ error: "Please provide a delivery city." }, { status: 400 });
    }
    // Indian PIN codes are six digits and never start with zero.
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return Response.json({ error: "Please provide a valid 6-digit pincode." }, { status: 400 });
    }

    // Everything from stock validation through order/item creation runs in
    // one transaction. Previously each item's stock was decremented as soon
    // as it passed its own check, inside a plain loop with no rollback — if
    // item 3 of 5 then failed validation, items 1-2 had already lost stock
    // for an order that was never created. Wrapping in db.transaction means
    // a failure partway through (bad product, insufficient stock, DB error)
    // undoes every write made so far in this request.
    const lowStockAlerts: { name: string; sku: string; id: number; newStock: number; threshold: number }[] = [];

    const result = await db.transaction(async (tx) => {
      let totalMrp = 0;
      let totalMop = 0;
      const itemRows: any[] = [];
      // Every unit leaving the shelf gets a stock_history row (movement type
      // "sale", linked to the order) so the admin's stock audit can answer
      // "where did those 3 units go?" — previously sales were the only stock
      // change with no trail at all. Collected here, written after the order
      // row exists so the movement can reference its order id.
      const saleMovements: {
        productId: number;
        productName: string;
        sku: string;
        variantId: number | null;
        variantLabel: string;
        oldStock: number;
        newStock: number;
        qty: number;
      }[] = [];

      for (const ci of cart) {
        // Quantity validation, product and variant lookup, availability checks
        // and price resolution all live in resolveCartLine, shared with
        // /api/cart/validate. That sharing is the point: the checkout page shows
        // the shopper what the validate route returns, so if the two disagreed
        // the shopper would be shown one total and charged another. Prices are
        // always re-read from the database and never taken from the cart
        // payload, so a tampered client can't set its own price.
        const resolved = await resolveCartLine(tx, ci);
        if (!resolved.ok) throw new OrderError(resolved.reason);
        const { product: p, variant, qty, mrp, mop, variantLabel, sku } = resolved;

        totalMrp += mrp * qty;
        totalMop += mop * qty;
        itemRows.push({
          productId: p.id,
          name: p.name,
          brand: p.brand,
          image: b.image || null,
          qty,
          mrp: String(mrp),
          mop: String(mop),
          variantId: variant ? variant.id : null,
          variantLabel,
          sku,
        });

        // Same atomic conditional decrement as the product stock below, applied
        // to the variant's own stock so per-variant availability stays accurate.
        if (variant) {
          const vUpdated = await tx
            .update(productVariants)
            .set({ stock: sql`${productVariants.stock} - ${qty}` })
            .where(and(eq(productVariants.id, variant.id), sql`${productVariants.stock} >= ${qty}`))
            .returning({ stock: productVariants.stock });
          if (vUpdated.length === 0) {
            throw new OrderError(`The selected option for "${p.name}" just sold out — please choose another.`);
          }
          saleMovements.push({
            productId: p.id,
            productName: p.name,
            sku,
            variantId: variant.id,
            variantLabel,
            oldStock: vUpdated[0].stock + qty,
            newStock: vUpdated[0].stock,
            qty,
          });
        }
        // Atomic conditional decrement (UPDATE ... WHERE stock >= qty)
        // instead of read-then-write: two simultaneous orders for the last
        // unit could both pass the `p.stock < qty` check above before
        // either one's write lands, since a plain SELECT doesn't lock the
        // row. Re-checking stock in the WHERE clause and inspecting the
        // affected row count closes that window — if a concurrent order
        // beat this one to the stock, the UPDATE simply matches 0 rows and
        // this order fails cleanly instead of overselling.
        const updated = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${qty}` })
          .where(and(eq(products.id, p.id), sql`${products.stock} >= ${qty}`))
          .returning({ stock: products.stock });
        if (updated.length === 0) {
          throw new OrderError(`"${p.name}" just sold out — please remove it from your cart and try again.`);
        }
        const newStock = updated[0].stock;
        if (newStock <= p.lowStockThreshold) {
          lowStockAlerts.push({ name: p.name, sku: p.sku, id: p.id, newStock, threshold: p.lowStockThreshold });
        }
        if (!variant) {
          // Variant sales are logged against the variant above; logging the
          // roll-up row too would double-count the same units in the audit.
          saleMovements.push({
            productId: p.id,
            productName: p.name,
            sku,
            variantId: null,
            variantLabel: "",
            oldStock: newStock + qty,
            newStock,
            qty,
          });
        }
      }

      let discount = 0;
      let couponCode: string | null = null;
      if (b.couponCode) {
        // Evaluated inside the transaction on purpose. Redemption caps are
        // counted from existing orders, so doing this outside the transaction
        // would let two simultaneous checkouts both see "49 of 50 used" and
        // both succeed. Sharing evaluateCoupon with the preview endpoint also
        // guarantees the customer isn't shown a discount that checkout then
        // refuses.
        const check = await evaluateCoupon(String(b.couponCode), {
          subtotal: totalMop,
          customerId: customer.id,
          tx: tx as unknown as typeof db,
        });
        if (!check.ok) {
          // Previously an unusable code was silently dropped and the customer
          // was charged full price with no explanation. Failing loudly is the
          // honest behaviour — they can remove the code and retry knowingly.
          throw new OrderError(check.reason);
        }
        discount = check.discount;
        couponCode = check.coupon.code;
      }

      const grandMop = Math.max(0, totalMop - discount);

      // A coupon can legitimately cover the whole cart, and then there is
      // nothing for a gateway to charge. Left alone this order would be filed
      // as Awaiting Payment, the gateway would refuse an amount below one
      // rupee, and the customer would be stranded on an order that can never
      // be paid for or dispatched. Nothing owed means nothing to collect, so
      // it is settled here as paid.
      const nothingToPay = grandMop <= 0;

      // Only now — with the real amount owed in hand — does the gateway need
      // to exist. An online order with money owed cannot proceed on a deploy
      // with no configured gateway; a fully discounted one can, because there
      // is nothing to collect.
      if (online && !nothingToPay && !paymentsConfigured()) {
        throw new OrderError(
          "Online payment is not available right now. Please choose Cash on Delivery.",
          503
        );
      }

      const orderNo = genOrderNo();

      const [o] = await tx
        .insert(orders)
        .values({
          orderNo,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          addressLine,
          city,
          pincode,
          outletId: b.outletId ? Number(b.outletId) : null,
          totalMrp: String(totalMrp),
          totalMop: String(grandMop),
          savings: String(totalMrp - grandMop),
          couponCode,
          discount: String(discount),
          paymentMethod,
          // An online order is not "Placed" until the money is confirmed —
          // staff must never see it in the queue and pack it. Cash on Delivery
          // has nothing to confirm up front, so it is Placed immediately and
          // its payment is settled on handover.
          paymentStatus: nothingToPay ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PENDING,
          paidAt: nothingToPay ? new Date() : null,
          status: online && !nothingToPay ? AWAITING_PAYMENT : "Placed",
        })
        .returning();

      await tx.insert(orderItems).values(itemRows.map((it) => ({ ...it, orderId: o.id })));

      if (saleMovements.length > 0) {
        await tx.insert(stockHistory).values(
          saleMovements.map((m) => ({
            productId: m.productId,
            productName: m.productName,
            sku: m.sku,
            oldStock: m.oldStock,
            newStock: m.newStock,
            change: -m.qty,
            adminId: null,
            adminName: "",
            reason: `Order ${orderNo}`,
            movementType: "sale",
            orderId: o.id,
            variantId: m.variantId,
            variantLabel: m.variantLabel,
          }))
        );
      }

      return { order: o, itemCount: itemRows.length, grandMop, orderNo, nothingToPay };
    });

    // For online orders every notification below is deferred until the payment
    // is verified. Announcing "New order placed" and emailing a confirmation
    // while the customer is still on their bank's page would tell the shop to
    // expect money that may never arrive, and tell the customer their order is
    // done when it is one abandoned tab away from being cancelled.
    if (online && !result.nothingToPay) {
      return Response.json({
        ok: true,
        orderId: result.order.id,
        orderNo: result.orderNo,
        requiresPayment: true,
        amount: result.grandMop,
      });
    }

    // Notifications happen after the transaction commits, so a failed
    // email/notification insert can never roll back a successful order.
    await createNotification(
      "order",
      "New order placed",
      `Order ${result.orderNo} by ${customer.name} (${customer.phone}) — ₹${result.grandMop.toLocaleString("en-IN")}, ${result.itemCount} item(s).`,
      `/admin/orders`
    );
    for (const alert of lowStockAlerts) {
      await createNotification(
        "lowstock",
        "Low stock alert",
        `${alert.name} (${alert.sku || "SKU " + alert.id}) dropped to ${alert.newStock} units (threshold ${alert.threshold}).`,
        "/admin/products"
      );
    }
    await sendCustomerEmail(
      customer.email,
      `Order confirmed — ${result.orderNo}`,
      `Hi ${customer.name},\n\nThanks for shopping with SMS Stores! Your order ${result.orderNo} has been placed successfully.\n\nOrder total: ₹${result.grandMop.toLocaleString("en-IN")}\nPayment method: ${result.order.paymentMethod}\nDelivery address: ${addressLine}, ${city} ${pincode}\n\nYou can view your invoice anytime from your account under Order History.\n\nWe'll notify you as your order moves to Packed, Shipped and Delivered.\n\n— SMS Stores`
    );

    return Response.json({ ok: true, orderId: result.order.id, orderNo: result.orderNo });
  } catch (e) {
    if (e instanceof OrderError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    // OrderError above is expected business rejection (out of stock, bad coupon).
    // Reaching here means something genuinely broke while taking money for an
    // order, which is the highest-value failure in the app to know about.
    reportError(e, "api/orders", { method: "POST" });
    return Response.json({ error: "Could not place order. Please try again." }, { status: 500 });
  }
}

// Thrown inside the db.transaction callback to distinguish an expected,
// user-facing validation failure (bad product, insufficient stock) from an
// unexpected server error — both roll back the transaction the same way,
// but only the former should be shown to the customer as their own mistake
// rather than a generic "please try again".
class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}