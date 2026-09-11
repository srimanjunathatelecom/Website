import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers";

/**
 * The admin console is the largest single component in the app and the only way
 * the owner changes anything customers see, yet nothing else in this suite
 * touches it.
 *
 * A note on how it is gated, because it is easy to test the wrong thing here:
 * /admin is a client component that returns 200 to anyone. That 200 is an empty
 * "Verifying session…" shell - it calls /api/auth/me and only mounts the
 * dashboard once an admin session comes back, otherwise it redirects to the
 * login form. So asserting on the status code of /admin proves nothing either
 * way. The real boundary is the API layer, and that is what these tests assert
 * on: an anonymous caller must not be able to read or write admin data,
 * regardless of what HTML the shell happens to serve.
 */

/**
 * On narrow viewports the console collapses its tab list behind a "Menu"
 * button, so a tab that is present in the DOM is not necessarily reachable.
 * Opens the nav when it is collapsed and returns the tab locator.
 */
async function adminTab(page: import("@playwright/test").Page, name: RegExp) {
  const tab = page.getByRole("button", { name }).first();
  if (!(await tab.isVisible().catch(() => false))) {
    const menu = page.getByRole("button", { name: /^menu$/i }).first();
    if (await menu.isVisible().catch(() => false)) await menu.click();
  }
  return tab;
}

// Endpoints that expose business data and must never answer an anonymous read.
const PRIVATE_READS = [
  "/api/orders",
  "/api/customers",
  "/api/coupons",
  "/api/variants",
  "/api/promo-offers",
  "/api/bookings",
  "/api/claims",
];

// Endpoints whose GET is deliberately public because the storefront renders
// from them, but whose writes must still require an admin.
const PUBLIC_READ_PRIVATE_WRITE = [
  "/api/products",
  "/api/banners",
  "/api/services",
  "/api/brands",
  "/api/promo-cards",
  "/api/content",
  "/api/settings",
  "/api/outlets",
];

test.describe("admin authorization", () => {
  test("an anonymous visitor is sent to the login form, and never sees the dashboard", async ({
    page,
  }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });

    // The gate runs client-side, so the redirect happens after hydration.
    await page.waitForURL(/\/admin\/login/, { timeout: 20_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // The shell must not have rendered dashboard content on the way past. The
    // tab list is the dashboard's own chrome and only exists once it mounts.
    await expect(page.getByRole("button", { name: /products & stock/i })).toHaveCount(0);
  });

  test("admin data endpoints reject anonymous reads", async ({ request }) => {
    const leaked: string[] = [];
    for (const path of PRIVATE_READS) {
      const res = await request.get(path);
      if (res.status() < 400) leaked.push(`${path} -> ${res.status()}`);
    }
    expect(
      leaked,
      `these endpoints answered an unauthenticated read:\n${leaked.join("\n")}`
    ).toEqual([]);
  });

  test("content endpoints reject anonymous writes", async ({ request }) => {
    const writable: string[] = [];
    const payload = { id: 1, name: "unauthorized", title: "unauthorized", slug: "about", body: "x" };

    for (const path of PUBLIC_READ_PRIVATE_WRITE) {
      for (const method of ["post", "put", "delete"] as const) {
        const res =
          method === "delete"
            ? await request.delete(`${path}?id=1`)
            : await request[method](path, { data: payload });

        // 405 is fine - the method simply isn't implemented. Anything that
        // succeeds means the catalogue is editable by the public.
        if (res.status() < 400) {
          writable.push(`${method.toUpperCase()} ${path} -> ${res.status()}`);
        }
      }
    }

    expect(
      writable,
      `these writes succeeded without an admin session:\n${writable.join("\n")}`
    ).toEqual([]);
  });

  test("the public settings payload carries no credentials", async ({ request }) => {
    // The storefront reads settings, so this one is public by design. That makes
    // it the most likely place for an SMTP password or key to leak by accident.
    const res = await request.get("/api/settings");
    expect(res.ok()).toBeTruthy();
    const body = JSON.stringify(await res.json()).toLowerCase();

    for (const secret of ["smtp_pass", "smtppass", "seed_key", "seedkey", "database_url", "passwordhash"]) {
      expect(body, `public settings response contains "${secret}"`).not.toContain(secret);
    }
  });
});

/**
 * Deliberately one test with one sign-in, not several.
 *
 * Admin login is rate-limited to 8 attempts per 15 minutes per IP. Two projects
 * (mobile + desktop) times one login each leaves plenty of headroom for repeated
 * local runs; splitting these assertions into separate tests would double that
 * for no extra coverage and make the suite trip its own brute-force protection.
 */
test.describe("admin console", () => {
  test("the dashboard loads and still exposes the coupon limit controls", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await signInAsAdmin(page);
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Wait for the dashboard itself, not just the shell. Nav labels carry a
    // numbered prefix and a newline, so match on the visible words.
    const stock = await adminTab(page, /products & stock/i);
    await expect(stock).toBeVisible({ timeout: 20_000 });

    // A React crash on mount leaves the page technically "loaded" but blank.
    expect(errors, `admin dashboard threw on mount:\n${errors.join("\n")}`).toEqual([]);

    const coupons = await adminTab(page, /coupons/i);
    await expect(coupons).toBeVisible({ timeout: 20_000 });
    await coupons.click();

    // The list view proves the read side: the redemption count is rendered per
    // coupon rather than only stored. Match "<n> used" and not "used of <cap>" -
    // the "of" half only renders when a coupon carries a total-uses cap, so
    // asserting on it made this test depend on the seed data happening to
    // include a capped coupon. It didn't, and the failure read as a broken
    // console rather than an over-specific assertion.
    await expect(page.getByText(/\d+\s+used/i).first()).toBeVisible({ timeout: 15_000 });

    // The inputs live in the editor, not the list, so open it. The three limits
    // are only useful if the owner can actually set them - shipping them
    // server-side only is a failure no API test would catch.
    await page.getByRole("button", { name: /\+ Add Coupon/i }).click();

    for (const label of ["Expires On", "Total Uses Allowed", "Uses Per Customer"]) {
      await expect(
        page.getByText(label, { exact: false }),
        `the "${label}" control is missing from the coupon editor`
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
