import { db } from "@/db";
import { coupons, orders } from "@/db/schema";
import { desc, isNotNull, sql } from "drizzle-orm";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { couponLimitsFromBody, evaluateCoupon } from "@/lib/coupon";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    // Public preview used by the checkout "Apply" button. It runs the same
    // eligibility rules as the order transaction (expiry, redemption caps,
    // per-customer limit) so the customer can't be shown a discount that
    // checkout will then reject. `subtotal` is optional — when the client
    // sends the cart total we can also validate the minimum-order rule and
    // return the exact amount off.
    const subtotalParam = url.searchParams.get("subtotal");
    const subtotal = subtotalParam != null && subtotalParam !== "" ? Number(subtotalParam) : undefined;
    const customer = await getCurrentCustomer();
    const check = await evaluateCoupon(code, {
      subtotal: Number.isFinite(subtotal as number) ? (subtotal as number) : undefined,
      customerId: customer?.id ?? null,
    });
    if (!check.ok) return Response.json({ coupon: null, error: check.reason });
    return Response.json({ coupon: check.coupon, discount: check.discount });
  }
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(coupons).orderBy(desc(coupons.id));
  // Surface real redemption counts so the owner can see how far a code has
  // been used against its cap without exporting a CSV.
  const used = await db
    .select({ code: orders.couponCode, n: sql<number>`count(*)::int` })
    .from(orders)
    .where(isNotNull(orders.couponCode))
    .groupBy(orders.couponCode);
  const usedMap = new Map(used.map((u) => [u.code, u.n]));
  return Response.json({
    items: rows.map((r) => ({ ...r, redemptions: usedMap.get(r.code) ?? 0 })),
  });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const code = String(b.code || "").trim().toUpperCase();
  if (!code) return Response.json({ error: "Coupon code required." }, { status: 400 });

  const type = b.type === "fixed" ? "fixed" : "percent";
  const value = Number(b.value);
  const minOrder = Number(b.minOrder || 0);

  // Checkout already clamps a discount to the cart total, so a bad coupon can
  // never produce a negative bill. It can still give the shop's stock away: a
  // percentage typed as 500 instead of 50 makes every qualifying order free,
  // and nothing about that looks wrong in the coupon list until the orders
  // start arriving. Catching it here means catching it at the moment the typo
  // is made, which is the only point where anyone can tell it was a typo.
  if (!Number.isFinite(value) || value <= 0) {
    return Response.json({ error: "Discount must be a positive number.", field: "value" }, { status: 400 });
  }
  if (type === "percent" && value > 100) {
    return Response.json({ error: "A percentage discount can't be more than 100%.", field: "value" }, { status: 400 });
  }
  if (!Number.isFinite(minOrder) || minOrder < 0) {
    return Response.json({ error: "Minimum order value can't be negative.", field: "minOrder" }, { status: 400 });
  }

  const [c] = await db
    .insert(coupons)
    .values({
      code,
      type,
      value: String(value),
      minOrder: String(minOrder),
      active: b.active !== false,
      ...couponLimitsFromBody(b),
    })
    .returning();
  return Response.json({ ok: true, coupon: c });
}
