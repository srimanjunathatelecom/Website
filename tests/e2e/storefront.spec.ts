import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

/**
 * Storefront rendering and accessibility invariants.
 *
 * These run on both the mobile and desktop projects. The layout rules below
 * (one h1, labelled inputs, no sideways scroll, no console errors) were all
 * fixed by hand at some point; this suite is what stops them regressing
 * quietly on the next content change.
 */

const ROUTES = [
  "/",
  "/products",
  "/services",
  "/about",
  "/contact",
  "/faq",
  "/track",
  "/cart",
  "/compare",
  "/wishlist",
  "/login",
  "/register",
  "/policy/privacy-policy",
  "/policy/terms-and-conditions",
  "/policy/warranty-policy",
  "/policy/shipping-policy",
];

for (const route of ROUTES) {
  test.describe(`${route}`, () => {
    test("renders with no console errors and no sideways scroll", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));

      const res = await page.goto(route);
      expect(res?.status(), `${route} should render`).toBeLessThan(400);
      // Wait for the app shell rather than networkidle: this app polls and
      // revalidates, so the network never goes fully quiet.
      await expect(page.locator("footer, main").first()).toBeVisible({ timeout: 20_000 });

      await expectNoHorizontalOverflow(page);
      expect(errors, `console errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
    });

    test("has exactly one h1", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main, footer").first()).toBeVisible({ timeout: 20_000 });
      // More than one h1 breaks the document outline screen readers rely on
      // to answer "what page am I on".
      await expect(page.locator("h1")).toHaveCount(1);
    });

    test("every form field has an accessible name", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main, footer").first()).toBeVisible({ timeout: 20_000 });

      const unlabelled = await page.evaluate(() => {
        const fields = Array.from(
          document.querySelectorAll<HTMLElement>("input, select, textarea"),
        );
        return fields
          .filter((el) => {
            if (el.getAttribute("type") === "hidden") return false;
            if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return false;
            if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
            if (el.closest("label")) return false;
            // A submit-style input carries its own name via its value.
            if (["submit", "button", "image"].includes(el.getAttribute("type") || "")) return false;
            return true;
          })
          .map((el) => el.outerHTML.slice(0, 120));
      });

      expect(unlabelled, `unlabelled fields on ${route}:\n${unlabelled.join("\n")}`).toEqual([]);
    });

    test("interactive controls are large enough to tap", async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main, footer").first()).toBeVisible({ timeout: 20_000 });

      const tooSmall = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>("button, a[href], [role='button']"),
        );
        return els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            // Skip anything not actually rendered.
            if (r.width === 0 || r.height === 0) return false;
            const cs = getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none") return false;
            // Inline text links inside a paragraph are read, not tapped as
            // targets, and hold to the line height of their text.
            if (el.tagName === "A" && el.closest("p")) return false;
            // A ::after pill is a legitimate way to enlarge a small dot's hit
            // area, and it isn't visible to getBoundingClientRect, so allow
            // anything that opts in with this attribute.
            if (el.hasAttribute("data-tap-expanded")) return false;

            // Screen-reader-only controls — the skip link chiefly — are clipped
            // to 1x1 until focused, so measuring them at rest reported a 1x1
            // "tap target" on every single route. They are not pointer targets
            // in that state. Rather than excluding them outright, measure them
            // focused, which is the only moment they can be tapped: a skip link
            // that stays tiny when focused is a genuine defect worth failing on.
            const clipped = cs.clipPath !== "none" || cs.clip !== "auto";
            if (clipped && r.width <= 1 && r.height <= 1) {
              el.focus();
              const fr = el.getBoundingClientRect();
              el.blur();
              return fr.width < 24 || fr.height < 24;
            }

            return r.width < 24 || r.height < 24;
          })
          .map((el) => {
            // Report the focused size for clipped controls, so the message
            // matches the size the assertion actually judged.
            const cs = getComputedStyle(el);
            const clipped = cs.clipPath !== "none" || cs.clip !== "auto";
            let r = el.getBoundingClientRect();
            if (clipped && r.width <= 1 && r.height <= 1) {
              el.focus();
              r = el.getBoundingClientRect();
              el.blur();
            }
            return `${el.tagName}.${el.className}`.slice(0, 80) +
              ` ${Math.round(r.width)}x${Math.round(r.height)}`;
          });
      });

      expect(tooSmall, `sub-24px tap targets on ${route}:\n${tooSmall.join("\n")}`).toEqual([]);
    });
  });
}

test.describe("404 handling", () => {
  test("an unknown product returns a real 404, not a friendly 200", async ({ page }) => {
    // A soft 404 gets the page indexed as real content and hides broken links
    // from every crawler and monitor.
    const res = await page.goto("/products/no-such-product-slug-12345");
    expect(res?.status()).toBe(404);
  });

  test("an unknown policy page returns a real 404", async ({ page }) => {
    const res = await page.goto("/policy/no-such-policy-12345");
    expect(res?.status()).toBe(404);
  });
});
