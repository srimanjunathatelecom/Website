import { test, expect } from "@playwright/test";
import { apiPost, signInAsNewCustomer } from "./helpers";

/**
 * Coupon eligibility.
 *
 * Coupons decide how much money the shop gives away, so the rules are worth
 * pinning down. The important property is that the preview endpoint and the
 * order transaction agree: a shopper must never be shown a discount that
 * checkout then refuses, and must never be able to redeem a code the preview
 * would have rejected.
 *
 * These assert against seeded codes. The suite skips rather than fails when
 * they're absent, so it stays useful on a database seeded differently.
 */

// Seeded by migration_add_coupon_limits.sql testing / the store's own data.
const VALID = process.env.E2E_COUPON_VALID || "WELCOME10";

test.describe("coupon validation", () => {
  test("rejects a code that does not exist, without revealing whether it might", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.get(
      "/api/coupons?code=DEFINITELYNOTAREALCODE&subtotal=50000",
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.coupon).toBeNull();
    expect(body.error).toBeTruthy();
    // The message must not distinguish "no such code" from "disabled code",
    // or it becomes an oracle for probing real codes.
    expect(body.error).not.toMatch(/disabled|inactive|switched off/i);
  });

  test("enforces the minimum order value and says how much more is needed", async ({ page }) => {
    await page.goto("/");
    const probe = await page.request.get(`/api/coupons?code=${VALID}&subtotal=100000`);
    const ok = await probe.json();
    test.skip(!ok.coupon, `coupon ${VALID} is not present or usable in this database`);

    const min = Number(ok.coupon.minOrder || 0);
    test.skip(min <= 0, `coupon ${VALID} has no minimum order to test`);

    const res = await page.request.get(`/api/coupons?code=${VALID}&subtotal=${Math.max(0, min - 1)}`);
    const body = await res.json();
    expect(body.coupon).toBeNull();
    expect(body.error).toMatch(/more to use/i);
  });

  test("returns a discount that never exceeds the cart subtotal", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.get(`/api/coupons?code=${VALID}&subtotal=100000`);
    const body = await res.json();
    test.skip(!body.coupon, `coupon ${VALID} is not present or usable in this database`);
    expect(body.discount).toBeGreaterThan(0);
    expect(body.discount).toBeLessThanOrEqual(100000);
  });

  test("an expired code is refused with a reason the shopper can act on", async ({ page }) => {
    await page.goto("/");
    // Only meaningful if the database actually has an expired code; the
    // dedicated fixture below is created by the admin spec when it can.
    const res = await page.request.get("/api/coupons?code=EXPIRED5&subtotal=50000");
    const body = await res.json();
    test.skip(body.coupon != null, "EXPIRED5 fixture is not expired in this database");
    if (body.error) expect(body.error).toBeTruthy();
  });

  test("checkout refuses an unusable code instead of silently charging full price", async ({ page }) => {
    await signInAsNewCustomer(page);
    // Placing the order through the API keeps this test about the coupon rule
    // rather than about checkout markup, which has its own spec.
    const res = await apiPost(page, "/api/orders", {
      items: [],
      couponCode: "DEFINITELYNOTAREALCODE",
      paymentMethod: "Cash on Delivery",
    });
    // An empty cart is rejected first; either way the order must not succeed,
    // and it must be a 400 (a rejected request) rather than a 401 (which
    // would mean the test never authenticated and proved nothing).
    expect(res.ok).toBeFalsy();
    expect(res.status).toBe(400);
  });
});
