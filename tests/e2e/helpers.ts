import { Page, expect } from "@playwright/test";

/**
 * Shared helpers. Kept deliberately small — anything clever here tends to
 * hide the reason a test failed.
 */

/** A unique-per-run customer, so tests never collide on a real account. */
export function newCustomer() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    name: "E2E Shopper",
    email: `e2e${stamp}@test.local`,
    // Indian 10-digit format, which the register form validates.
    phone: `9${String(stamp).slice(-9)}`,
    password: "E2ePass@12345",
  };
}

/**
 * Register and sign in, leaving `page` authenticated as a fresh customer.
 *
 * Registration is done through the API rather than the form because the form
 * is covered by its own spec and re-driving it here would make every other
 * test depend on that markup. `page.request` is used (not a bare fetch or a
 * separate request context) because only that shares the page's cookie jar —
 * a standalone context gets a 401 on the next authenticated call.
 */
export async function apiPost(page: Page, path: string, body: unknown) {
  // Deliberately fetch() from inside the page rather than using
  // `page.request`: the two do not share a cookie jar in practice, so an
  // authenticated write issued through page.request comes back 401 even
  // after a successful login. Running in the page guarantees the session
  // cookie is attached.
  return page.evaluate(
    async ([p, b]) => {
      const r = await fetch(p as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      let json: unknown = null;
      try {
        json = await r.json();
      } catch {
        json = null;
      }
      return { status: r.status, ok: r.ok, body: json };
    },
    [path, body] as const,
  );
}

export async function signInAsNewCustomer(page: Page) {
  const c = newCustomer();
  // A page context is needed before fetching, so land on the homepage first.
  await page.goto("/");
  const res = await apiPost(page, "/api/auth/register", {
    name: c.name,
    email: c.email,
    phone: c.phone,
    password: c.password,
  });
  // /api/auth/register is capped at 5 per IP per hour. If a run trips that,
  // say so plainly instead of failing later with a confusing 401.
  if (res.status === 429) {
    throw new Error(
      "Registration rate limit hit (5/hour/IP). Wait, or run against a fresh IP.",
    );
  }
  expect(
    res.ok,
    `register failed: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBeTruthy();
  return c;
}

/** Sign in to the admin console through the real login form. */
export async function signInAsAdmin(page: Page) {
  const email = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
  // Read from the environment with no fallback on purpose. Hard-coding a
  // default password here would put a plausible-looking admin credential in
  // the repo: it trips secret scanners, and it is exactly the string someone
  // copies into a real .env because the tests seemed to want it. Failing
  // loudly is cheaper than that.
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD is not set, so the admin tests cannot sign in. " +
        "Set it in .env to the password of the seeded admin account."
    );
  }
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill(email);
  // getByLabel(/password/i) also matches the "Show password" toggle button
  // (aria-label), which trips strict mode — target the textbox role instead.
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  // The submit button reads "Enter the console", not "Sign in" - match the
  // form's only submit button rather than guessing at its wording.
  await page.locator('form button[type="submit"]').first().click();

  // Admin login is rate-limited to 8 attempts per 15 minutes per IP. Without
  // this check, tripping the limit surfaces as a bare URL-assertion timeout,
  // which looks like a broken login rather than a spent budget. Sign in as few
  // times as possible - the limit is a feature, not something to work around.
  const throttled = page.getByText(/too many attempts/i);
  if (await throttled.isVisible().catch(() => false)) {
    throw new Error(
      "Admin login is rate-limited (8 attempts / 15 min per IP) and the budget " +
        "is spent. Wait for the window to pass, or restart the server to clear " +
        "the in-memory limiter, then re-run."
    );
  }

  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 20_000 });
}

/**
 * Put a buyable product in the cart the way a shopper would, and return its
 * name so callers can assert it reaches the cart.
 *
 * More careful than it first looks, because the obvious version doesn't work:
 *
 * - The listing page has its own "Add to cart" buttons, so a page-wide
 *   case-insensitive match can resolve to a card button that is being torn down
 *   by the navigation. Scoped to the product detail region instead.
 * - On a product with variants, Add to Cart starts disabled and reads "Select a
 *   variant" until a RAM/storage and colour are chosen. That is correct
 *   behaviour, so the helper makes a selection rather than working around it.
 * - The first product on the page may simply be out of stock, which no
 *   selection fixes. So it walks the first few products and uses the first one
 *   that can actually be bought, and says so plainly if none can.
 */
export async function addFirstProductToCart(page: Page) {
  await page.goto("/products");
  const cards = page.locator("a[href^='/products/']");
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });

  const hrefs: string[] = [];
  for (const el of await cards.all()) {
    const href = await el.getAttribute("href");
    // Skip the listing's own links back to itself and keep the order stable.
    if (href && /^\/products\/[^/?#]+$/.test(href) && !hrefs.includes(href)) hrefs.push(href);
    if (hrefs.length >= 6) break;
  }
  expect(hrefs.length, "the products page should link to some products").toBeGreaterThan(0);

  const rejected: string[] = [];

  for (const href of hrefs) {
    await page.goto(href);
    const title = page.getByRole("heading", { level: 1 }).first();
    await expect(title).toBeVisible({ timeout: 20_000 });
    const name = (await title.innerText()).trim();

    // Choose a variant when the product has them, picking only from options the
    // picker leaves enabled — a disabled one is a combination the shop never
    // created.
    for (const group of ["RAM and storage", "Colour"]) {
      const radios = page.getByRole("radiogroup", { name: group }).getByRole("radio");
      if ((await radios.count()) === 0) continue;
      const enabled = radios.and(page.locator(":not([disabled])"));
      if ((await enabled.count()) > 0) await enabled.first().click();
    }

    const addBtn = page.getByRole("button", { name: /^add to cart$/i }).first();
    // Give the click handler a moment to settle after a variant selection
    // before deciding this product is unbuyable.
    const usable = await addBtn.isEnabled({ timeout: 5_000 }).catch(() => false);
    if (!usable) {
      rejected.push(name);
      continue;
    }

    await addBtn.click();
    // "Added to cart" replaces the label on success, which is the app confirming
    // the write rather than the test assuming it.
    await expect(page.getByText(/added to cart/i).first()).toBeVisible({ timeout: 10_000 });
    return name;
  }

  throw new Error(
    "No buyable product found on the first page of /products. Tried: " +
      rejected.join(", ") +
      ". Seed the database with an in-stock product."
  );
}

/**
 * Assert nothing on the current page pokes out sideways.
 *
 * Compares the document's scrollable width to the viewport, with 1px of slack
 * for sub-pixel rounding in the layout engine.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
  expect(
    overflow.scroll,
    `page scrolls horizontally: ${overflow.scroll}px content in a ${overflow.client}px viewport`,
  ).toBeLessThanOrEqual(overflow.client + 1);
}
