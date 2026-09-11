import { db } from "@/db";
import { products, orders, bookings, productQuestions, stockAlerts } from "@/db/schema";
import { eq, sql, isNull } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const allProducts = await db.select().from(products);
  const live = allProducts.filter((p) => p.status === "active");
  const hidden = allProducts.filter((p) => p.status !== "active");
  const unitsInStock = allProducts.reduce((s, p) => s + (p.stock || 0), 0);
  const inventoryValue = allProducts.reduce((s, p) => s + (p.stock || 0) * Number(p.mop || 0), 0);
  const lowStock = allProducts.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold);
  const outOfStock = allProducts.filter((p) => p.stock <= 0);

  const allOrders = await db.select().from(orders);
  const pendingStatuses = ["Placed", "Packed", "Shipped", "Out for Delivery"];
  const pendingOrders = allOrders.filter((o) => pendingStatuses.includes(o.status));

  // Orders whose online payment never completed. They are neither revenue nor
  // work to be done, but they are holding stock, so they are counted and shown
  // rather than quietly filtered out of every number on the overview.
  const awaitingPayment = allOrders.filter((o) => o.status === "Awaiting Payment");

  // Revenue counts money the shop can actually expect. Excluding cancelled
  // orders was already correct; excluding orders that are still waiting on an
  // online payment matters just as much, because a customer who reached the
  // bank page and gave up previously added their full basket to the revenue
  // figure. Cash on Delivery is included, as before — those are real orders
  // that will be collected on delivery.
  const revenue = allOrders
    .filter((o) => o.status !== "Cancelled" && o.status !== "Awaiting Payment")
    .reduce((s, o) => s + Number(o.totalMop || 0), 0);

  // Money actually received through the gateway, as distinct from expected
  // revenue. Reconciling the two is how the shop notices a problem.
  const collectedOnline = allOrders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((s, o) => s + Number(o.totalMop || 0), 0);

  const [{ c: bookingsCount }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(bookings);

  // Shopper questions still waiting on the store. Surfaced on the overview
  // because a question sitting unanswered in the moderation queue is invisible
  // to customers and costs a sale.
  const [{ c: pendingQuestions }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(productQuestions)
    .where(eq(productQuestions.status, "pending"));

  // Customers waiting on a back-in-stock email — demand the shop can't see
  // anywhere else, surfaced next to the stock numbers it explains.
  const [{ c: stockAlertsPending }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(stockAlerts)
    .where(isNull(stockAlerts.notifiedAt));

  // Daily sales for the last 30 days, oldest first. Same revenue rules as the
  // headline number (no cancelled, no abandoned payments) so the chart and the
  // stat card never disagree. Days are bucketed in the server's timezone; an
  // empty day is an explicit zero so the chart shows the gap rather than
  // silently compressing time.
  const trendDays = 30;
  const dayKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const buckets = new Map<string, { revenue: number; orders: number }>();
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    buckets.set(dayKey(d), { revenue: 0, orders: 0 });
  }
  for (const o of allOrders) {
    if (o.status === "Cancelled" || o.status === "Awaiting Payment") continue;
    const key = dayKey(new Date(o.createdAt));
    const b = buckets.get(key);
    if (!b) continue; // older than the window
    b.revenue += Number(o.totalMop || 0);
    b.orders += 1;
  }
  const salesTrend = [...buckets.entries()].map(([day, v]) => ({ day, ...v }));

  return Response.json({
    stats: {
      totalProducts: allProducts.length,
      liveProducts: live.length,
      hiddenProducts: hidden.length,
      unitsInStock,
      inventoryValue,
      lowStockCount: lowStock.length,
      lowStock,
      outOfStockCount: outOfStock.length,
      outOfStock,
      pendingOrders: pendingOrders.length,
      // Abandoned payment attempts are excluded from the headline order count
      // so it reflects orders the shop actually has.
      totalOrders: allOrders.length - awaitingPayment.length,
      awaitingPaymentCount: awaitingPayment.length,
      revenue,
      collectedOnline,
      salesTrend,
      stockAlertsPending: Number(stockAlertsPending ?? 0),
      bookings: Number(bookingsCount ?? 0),
      pendingQuestions: Number(pendingQuestions ?? 0),
    },
  });
}
