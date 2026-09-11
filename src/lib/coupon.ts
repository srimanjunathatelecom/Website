import { db } from "@/db";
import { coupons, orders } from "@/db/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

/**
 * Coupon eligibility, in one place.
 *
 * There are two callers that must never disagree: the checkout preview
 * (`GET /api/coupons?code=`) and the authoritative check inside the order
 * transaction. If the preview is more permissive, a customer sees "₹500 off
 * applied" and then gets an error on submit; if it is stricter, a legitimate
 * discount looks broken. Both call `evaluateCoupon` so there is exactly one
 * definition of "valid".
 */

export type CouponRow = typeof coupons.$inferSelect;

export type CouponCheck =
  | { ok: true; coupon: CouponRow; discount: number }
  | { ok: false; reason: string };

/** Discount in rupees for a given subtotal, never more than the subtotal. */
export function couponDiscount(coupon: CouponRow, subtotal: number): number {
  const value = Number(coupon.value || 0);
  const raw = coupon.type === "fixed" ? value : (subtotal * value) / 100;
  // Guard both ends: a bad percent value shouldn't produce a negative total,
  // and a fixed discount larger than the cart shouldn't pay the customer.
  return Math.max(0, Math.min(Math.round(raw * 100) / 100, subtotal));
}

/**
 * Count how many times a code has actually been redeemed. Redemptions are
 * derived from `orders.coupon_code` rather than a separate counter column,
 * which keeps the count honest — it can't drift out of sync with the orders
 * it's supposed to describe.
 *
 * `tx` accepts a transaction handle so the order route can count inside the
 * same transaction that inserts the order.
 */
export async function countRedemptions(
  code: string,
  opts: { customerId?: number | null; tx?: typeof db } = {},
) {
  const conn = opts.tx ?? db;
  const where =
    opts.customerId != null
      ? and(eq(orders.couponCode, code), eq(orders.customerId, opts.customerId))
      : eq(orders.couponCode, code);
  const [row] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);
  return row?.n ?? 0;
}

/**
 * Look up a code and decide whether it may be applied.
 *
 * `subtotal` is optional: expiry and redemption caps don't depend on cart
 * value, so the homepage strip and the "is this code real" preview can call
 * this without one. When it is supplied, the minimum-order rule is enforced
 * and a discount amount comes back.
 */
export async function evaluateCoupon(
  rawCode: string,
  opts: { subtotal?: number; customerId?: number | null; tx?: typeof db } = {},
): Promise<CouponCheck> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, reason: "Enter a coupon code." };

  const conn = opts.tx ?? db;
  const [coupon] = await conn.select().from(coupons).where(eq(coupons.code, code));

  // Deliberately the same message for "no such code" and "switched off in
  // Admin": a distinct "this code exists but is disabled" reply would let
  // anyone probe for real codes to try later.
  if (!coupon || !coupon.active) {
    return { ok: false, reason: "This coupon code isn't valid." };
  }

  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "This coupon has expired." };
  }

  if (coupon.maxRedemptions != null) {
    const used = await countRedemptions(code, { tx: opts.tx });
    if (used >= coupon.maxRedemptions) {
      return { ok: false, reason: "This coupon has been fully claimed." };
    }
  }

  if (coupon.perCustomerLimit != null && opts.customerId != null) {
    const mine = await countRedemptions(code, {
      customerId: opts.customerId,
      tx: opts.tx,
    });
    if (mine >= coupon.perCustomerLimit) {
      return { ok: false, reason: "You've already used this coupon." };
    }
  }

  if (opts.subtotal != null) {
    const min = Number(coupon.minOrder || 0);
    if (opts.subtotal < min) {
      return {
        ok: false,
        reason: `Add ₹${(min - opts.subtotal).toLocaleString("en-IN")} more to use this coupon.`,
      };
    }
  }

  return {
    ok: true,
    coupon,
    discount: opts.subtotal != null ? couponDiscount(coupon, opts.subtotal) : 0,
  };
}

/**
 * SQL condition for "publicly displayable coupon" — used by the homepage
 * scratch strip so expired codes stop being advertised on their own, without
 * the owner having to remember to untick Active.
 *
 * Note this intentionally does not filter fully-claimed codes: that needs a
 * per-code count and the strip is a cached, static-ish render. A claimed code
 * still fails cleanly at checkout with a clear reason.
 */
export const displayableCoupon = and(
  eq(coupons.active, true),
  or(isNull(coupons.expiresAt), gt(coupons.expiresAt, sql`now()`)),
);

/**
 * Normalise the three limit fields coming from the Admin coupon form.
 *
 * The form sends empty strings for "no limit", which would otherwise become
 * 0 (a coupon nobody can ever use) or Invalid Date. Anything blank, zero or
 * unparseable becomes null, which the rules above read as unlimited.
 */
export function couponLimitsFromBody(b: Record<string, unknown>) {
  const int = (v: unknown) => {
    const n = Number(v);
    return v === "" || v == null || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n);
  };
  const when = (v: unknown) => {
    if (v === "" || v == null) return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    expiresAt: when(b.expiresAt),
    maxRedemptions: int(b.maxRedemptions),
    perCustomerLimit: int(b.perCustomerLimit),
  };
}
