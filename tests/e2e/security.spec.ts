import { test, expect } from "@playwright/test";
import { addFirstProductToCart } from "./helpers";

/**
 * Security invariants.
 *
 * Each of these was a real hole at some point. They're cheap to assert and
 * expensive to rediscover, so they're locked down here rather than left to a
 * future manual audit.
 */

test.describe("security headers", () => {
  test("every response carries the hardening headers", async ({ page }) => {
    const res = await page.goto("/");
    expect(res).not.toBeNull();
    const h = res!.headers();

    // Without this the admin console can be framed by any site and clicked
    // through on a live session.
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    // Full URLs, including invoice paths, must not leak cross-origin.
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    // Don't advertise the framework version.
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

test.describe("authorization", () => {
  test("the admin console is not reachable without signing in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 });
  });

  test("admin APIs reject an unauthenticated caller", async ({ page }) => {
    await page.goto("/");
    for (const path of ["/api/coupons", "/api/admin/stats", "/api/export/orders"]) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} should require auth`).toBe(401);
    }
  });

  test("placing an order requires a signed-in customer", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/orders", { data: { items: [] } });
    expect(res.status()).toBe(401);
  });
});

test.describe("order tracking", () => {
  test("a tracking number alone does not reveal an order", async ({ page }) => {
    await page.goto("/");
    // Even a real number must not return order contents without the phone
    // check — that check is the only thing stopping enumeration of the
    // ~1.7M possible daily suffixes.
    const res = await page.request.get("/api/track?no=SMS0101260000ABCD");
    // 429 is also an acceptable refusal: the rate-limit spec below may have
    // already spent this IP's budget, and being throttled is still a refusal
    // to hand over the order. What must never happen is a 200 with contents.
    expect([401, 404, 429]).toContain(res.status());
    const body = await res.text();
    expect(body).not.toMatch(/addressLine|customerPhone/);
  });

  test("repeated tracking lookups are rate limited", async ({ page }) => {
    await page.goto("/");
    let sawLimit = false;
    // The cap is 20 per 10 minutes; 30 attempts must trip it. Without this,
    // the 4-digit phone check is only 10,000 guesses wide.
    for (let i = 0; i < 30; i++) {
      const res = await page.request.get(`/api/track?no=SMS0101260000ABC${i}&phone=0000`);
      if (res.status() === 429) {
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit, "tracking lookups were never rate limited").toBeTruthy();
  });
});

test.describe("seed endpoint", () => {
  test("cannot be triggered without the seed key", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.get("/api/seed");
    // Must refuse outright rather than reseeding or wiping data.
    expect(res.ok()).toBeFalsy();
  });
});

test.describe("content security policy", () => {
  /**
   * A CSP mistake fails in the browser, quietly. The server returns 200, the
   * HTML is intact, and the page is simply dead because every script was
   * refused. Server-side tests cannot see that, so these run a real browser and
   * listen for the violation messages the console emits.
   */
  const violationsOf = (page: import("@playwright/test").Page) => {
    const found: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/content security policy|refused to (?:load|execute|apply)/i.test(text)) found.push(text);
    });
    page.on("pageerror", (err) => {
      if (/content security policy/i.test(err.message)) found.push(err.message);
    });
    return found;
  };

  test("script-src is enforced with a nonce, not a static allowlist", async ({ page }) => {
    const res = await page.goto("/");
    const csp = res!.headers()["content-security-policy"] ?? "";

    // A script-src is the directive that actually stops injected script from
    // running; the policy was missing it entirely before.
    expect(csp).toContain("script-src");
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]{20,}'/);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    // 'unsafe-inline' in script-src would make the nonce pointless, and
    // 'unsafe-eval' must never ship in a production build.
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp.split("script-src")[1].split(";")[0]).not.toContain("'unsafe-inline'");
  });

  test("the nonce changes on every response", async ({ page }) => {
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const res = await page.goto("/?n=" + i);
      const csp = res!.headers()["content-security-policy"] ?? "";
      seen.add(csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1] ?? "");
    }
    // A reused nonce is no better than 'unsafe-inline': an attacker who can read
    // one page can embed the token in the script they inject into the next.
    expect(seen.size).toBe(3);
  });

  test("every server-rendered script carries the current nonce", async ({ page }) => {
    const res = await page.goto("/");
    const nonce = (res!.headers()["content-security-policy"] ?? "").match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    expect(nonce).toBeTruthy();

    // Asserted against the HTML the server sent, not the live DOM. Scripts the
    // page injects at runtime — the analytics tag, the Razorpay SDK — correctly
    // have no nonce and are allowed by 'strict-dynamic' instead; including them
    // would make this fail as soon as a GA id is configured. What must carry the
    // nonce is everything the parser sees, because that is what gets refused.
    const html = await res!.text();
    const tags = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    const missing = tags.filter((t) => !t.includes(`nonce="${nonce}"`));
    expect(missing, `inline script tags without the nonce:\n${missing.join("\n")}`).toEqual([]);
  });

  test("the pre-paint theme script survives the policy", async ({ page }) => {
    // This one runs before first paint to stop a flash of the wrong theme, and
    // it is inline, so it is precisely what a script-src refuses. If it were
    // blocked nothing would error — the page would just flash white on every
    // navigation for dark-mode users, which no header assertion would notice.
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")), { timeout: 10_000 })
      .toBe(true);
    await page.evaluate(() => localStorage.removeItem("theme"));
  });

  test("structured data survives the policy", async ({ page }) => {
    await page.goto("/");
    // JSON-LD is hand-written rather than framework-emitted, so it's the tag most
    // likely to be forgotten when a nonce is introduced. Losing it costs search
    // visibility, with nothing visibly broken to warn you.
    const ld = await page.locator('script[type="application/ld+json"]').count();
    expect(ld).toBeGreaterThan(0);
  });

  test("the storefront runs clean under the policy", async ({ page }) => {
    const violations = violationsOf(page);

    for (const path of ["/", "/products", "/cart", "/checkout", "/account", "/admin"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
    }

    expect(violations, `CSP violations:\n${violations.join("\n")}`).toEqual([]);
  });

  test("a product page runs clean, and stays interactive", async ({ page }) => {
    const violations = violationsOf(page);

    // Reuses the purchase-flow helper rather than hand-rolling a click: it
    // already handles variant selection and the mobile sticky bar. The point
    // here is not to re-test add-to-cart, it's that hydration happened at all —
    // if the nonce hadn't reached Next's bootstrap the page would render and
    // then do nothing, which no header check would catch.
    await addFirstProductToCart(page);
    await expect(page.locator('[data-testid="cart-count"], header').first()).toBeVisible();

    expect(violations, `CSP violations:\n${violations.join("\n")}`).toEqual([]);
  });
});

/**
 * The payment SDK is the one script the CSP could break in a way that only
 * shows up in production. It is injected at runtime by
 * src/lib/payments/checkoutScript.ts, so it carries no nonce of its own and is
 * allowed solely by 'strict-dynamic' — and if that reasoning is wrong, the
 * failure is a checkout button that silently does nothing for every customer,
 * with a healthy server log. Worth an assertion rather than an argument.
 *
 * This does not need valid Razorpay credentials: the SDK is served from a CDN
 * to anyone, and whether the browser executes it is a policy question, not an
 * authentication one.
 */
test.describe("content security policy and the payment SDK", () => {
  test("the Razorpay SDK still loads and initialises under the policy", async ({ page }) => {
    const refusals: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) refusals.push(m.text());
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const result = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          // Mirrors checkoutScript.ts: appended by already-trusted page script.
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve("loaded");
          s.onerror = () => resolve("blocked");
          document.body.appendChild(s);
          setTimeout(() => resolve("timeout"), 20000);
        })
    );

    expect(result).toBe("loaded");
    // Loading isn't enough — a CSP-blocked script can still fire onload in some
    // browsers. This confirms it actually executed and defined its global.
    expect(await page.evaluate(() => typeof (window as unknown as { Razorpay?: unknown }).Razorpay)).toBe("function");
    expect(refusals, `CSP refused something: ${refusals.join(" | ")}`).toEqual([]);
  });
});

test.describe("cross-origin writes", () => {
  test("a mutating API call with a foreign Origin is rejected", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/contact", {
      headers: { Origin: "https://evil.example.com" },
      data: { name: "x", phone: "x", message: "cross-origin probe" },
    });
    expect(res.status()).toBe(403);
  });

  test("a same-origin write is unaffected by the origin check", async ({ page, baseURL }) => {
    await page.goto("/");
    const res = await page.request.post("/api/contact", {
      headers: { Origin: new URL(baseURL!).origin },
      data: { name: "spec", phone: "0000000000", message: "same-origin check from the security spec" },
    });
    // 200 is the pass; 429 means the contact limiter already spent this IP's
    // budget, which is still not a cross-origin rejection.
    expect([200, 429]).toContain(res.status());
  });
});
