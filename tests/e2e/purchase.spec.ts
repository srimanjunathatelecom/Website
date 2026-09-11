import { test, expect, type Page } from "@playwright/test";
import { addFirstProductToCart, signInAsNewCustomer } from "./helpers";

/**
 * The purchase flow, driven through the browser the way a customer drives it:
 * product page → cart → checkout → order placed → invoice.
 *
 * Every part of this was already covered by API tests, which is not the same
 * thing. An API test proves the server would accept a well-formed order; it
 * cannot tell you the Add to Cart button is wired up, that the cart survives a
 * page navigation, that the address form's values reach the request, or that the
 * total on screen is the total charged. Those are precisely the failures that
 * cost sales, and they only show up when something actually clicks the buttons.
 *
 * Registration budget: this file signs in one customer per device project, so a
 * full-suite run spends 2 of the 5-per-hour-per-IP registrations. If a run trips
 * that limit, restart the server -- the limiter is in-memory.
 *
 * Runs against a production build. The admin bundle is large enough that
 * on-demand compilation under dev makes these time out for reasons that have
 * nothing to do with the code under test.
 */

/** Money as the UI writes it, so assertions can match the rendered string. */
function inr(n: number) {
  return `\u20b9${n.toLocaleString("en-IN")}`;
}

// Serial, sharing one browser context and one customer for the whole file.
// /api/auth/register is capped at 5 per IP per hour, and a test-per-customer
// spec across two device projects spends that budget on nothing: these tests
// are about the purchase flow, not about registration, which has its own spec.
test.describe.configure({ mode: "serial" });

test.describe("purchase flow", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInAsNewCustomer(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  /** Leave no items behind for the next test in the file. */
  async function emptyCart() {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("sms_cart"));
  }

  test("a customer can buy something end to end", async () => {
    await emptyCart();
    const name = await addFirstProductToCart(page);

    // The cart page, reached the way a shopper reaches it, to prove the item
    // survived the navigation rather than only existing in the click handler.
    await page.goto("/cart");
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    await page.goto("/checkout");
    // Checkout re-prices the cart against the database on load, so wait for it
    // to settle before reading the total.
    await expect(page.getByRole("heading", { name: /order summary/i })).toBeVisible({
      timeout: 20_000,
    });

    // A fresh customer has no saved address, so the new-address form is already
    // showing. Fill it in the same fields a shopper would.
    await page.getByPlaceholder("Full address").fill("12 Test Lane, Indiranagar");
    await page.getByPlaceholder("City").fill("Bengaluru");
    await page.getByPlaceholder("Pincode").fill("560038");

    // Cash on delivery: the online option hands off to Razorpay's hosted sheet,
    // which is a third party's iframe and not something to automate. COD
    // exercises the same order-creation path and ends on a real invoice.
    await page.getByRole("radio", { name: /cash on delivery/i }).check();

    // The button states the amount, which is the number that must match what
    // the order is actually created for.
    const placeBtn = page.getByRole("button", { name: /place order/i });
    await expect(placeBtn).toBeEnabled();
    const shownTotal = (await placeBtn.innerText()).trim();

    await placeBtn.click();

    // Landing on the invoice is the confirmation. Anything less and the shopper
    // is left not knowing whether they bought something.
    await expect(page).toHaveURL(/\/invoice\/\d+/, { timeout: 30_000 });
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    // The amount on the invoice must be the amount the button promised. This is
    // the assertion that would have caught a checkout showing one figure and
    // charging another.
    const amount = shownTotal.split("\u00b7").pop()?.trim();
    expect(amount, "Place Order button should state the total").toBeTruthy();
    await expect(page.getByText(amount!, { exact: false }).first()).toBeVisible();

    // And the order is now the customer's own, visible in their history.
    await page.goto("/account");
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    // A cart that still holds the items after they were bought is how people
    // accidentally buy the same phone twice.
    await page.goto("/cart");
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
  });

  test("checkout says so when a price changed after add-to-cart", async ({ request }) => {
    // The cart is localStorage, so its price is frozen at add-to-cart time while
    // the order endpoint charges the current one. This test repriced a product
    // out from under a live cart, which used to mean being shown the old total
    // and charged the new one in silence.
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error(
        "INITIAL_ADMIN_PASSWORD is not set, so this test cannot reprice a product."
      );
    }

    await emptyCart();
    await addFirstProductToCart(page);

    // Read back which product landed in the cart, and at what price, rather than
    // assuming the products page ordering.
    const line = await page.evaluate(() => {
      const raw = localStorage.getItem("sms_cart");
      const items = raw ? JSON.parse(raw) : [];
      return items[0] ?? null;
    });
    expect(line, "a product should be in the cart").toBeTruthy();

    // Admin work goes through a separate request context on purpose: the admin
    // and customer sessions use the same cookie name, so signing in as admin in
    // this page would sign the shopper out mid-checkout.
    const login = await request.post("/api/admin/login", {
      data: { email: adminEmail, password: adminPassword },
    });
    const token = (await login.json()).token as string | undefined;
    expect(token, "admin login should return a token").toBeTruthy();
    const authed = { Authorization: `Bearer ${token}` };

    const before = await (await request.get(`/api/products/${line.productId}`)).json();
    const product = before.product ?? before;
    const originalMop = Number(product.mop);
    // Stay at or below MRP: a selling price above the maximum retail price is
    // rejected by product validation, and rightly so.
    const newMop = Math.min(Number(product.mrp), originalMop + 500);
    expect(newMop, "the test needs headroom under MRP to reprice into").not.toBe(originalMop);

    try {
      const put = await request.put(`/api/products/${line.productId}`, {
        headers: authed,
        data: { mop: newMop },
      });
      expect(put.ok(), "admin should be able to reprice").toBeTruthy();

      await page.goto("/checkout");

      // The shopper must be told, in words, before they can pay.
      await expect(page.getByText(/price.*(has|have) changed/i)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(new RegExp(`was\\s*${inr(originalMop).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"))).toBeVisible();

      // And the total they are asked to approve is the new one, not the frozen
      // one from the cart. Select cash on delivery first: the submit button's
      // label follows the payment method ("Place Order · ₹x" versus
      // "Pay ₹x securely"), and this test is about the figure, not the wording.
      await page.getByRole("radio", { name: /cash on delivery/i }).check();
      const placeBtn = page.getByRole("button", { name: /place order/i });
      await expect(placeBtn).toContainText(inr(newMop * Number(line.qty)));

      // The corrected price is written back, so the cart page agrees too.
      const after = await page.evaluate(() => {
        const raw = localStorage.getItem("sms_cart");
        return raw ? JSON.parse(raw)[0] : null;
      });
      expect(Number(after.mop)).toBe(newMop);
    } finally {
      // Restore, or every later test in the run is asserting against a price
      // this one moved.
      await request.put(`/api/products/${line.productId}`, {
        headers: authed,
        data: { mop: originalMop },
      });
    }
  });

  test("a withdrawn product is removed from the cart with a reason", async ({ request }) => {
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error(
        "INITIAL_ADMIN_PASSWORD is not set, so this test cannot unpublish a product."
      );
    }

    await emptyCart();
    await addFirstProductToCart(page);
    const line = await page.evaluate(() => {
      const raw = localStorage.getItem("sms_cart");
      return raw ? JSON.parse(raw)[0] : null;
    });
    expect(line).toBeTruthy();

    const login = await request.post("/api/admin/login", {
      data: { email: adminEmail, password: adminPassword },
    });
    const token = (await login.json()).token as string | undefined;
    expect(token).toBeTruthy();
    const authed = { Authorization: `Bearer ${token}` };

    try {
      const put = await request.put(`/api/products/${line.productId}`, {
        headers: authed,
        data: { status: "draft" },
      });
      expect(put.ok(), "admin should be able to unpublish").toBeTruthy();

      await page.goto("/checkout");

      // Withdrawing the item empties this cart, and an empty cart with no
      // explanation reads as "the website lost my things".
      await expect(page.getByText(/removed from your cart/i)).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await request.put(`/api/products/${line.productId}`, {
        headers: authed,
        data: { status: "active" },
      });
    }
  });
});
