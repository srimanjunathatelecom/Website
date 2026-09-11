import { test, expect } from "@playwright/test";

/**
 * The header bar is `overflow-hidden`, which means anything pushed past the
 * right edge is silently clipped instead of widening the page. A
 * horizontal-overflow assertion therefore cannot see it: the document stays
 * exactly viewport-width while the cart button sits off screen, unreachable.
 *
 * That is how the cart icon was invisible on every phone from 320px to 390px
 * without a single test failing. These tests assert on element geometry
 * instead, so a regression is caught by the thing that actually matters:
 * can a customer on a phone tap the cart.
 */

const PHONE_WIDTHS = [320, 360, 375, 390, 414];

// Controls a shopper must be able to reach on any phone. Compare is excluded
// deliberately: below 360px it moves into the mobile menu, which is covered
// by its own test.
const ESSENTIAL = ["Cart", "Wishlist"];

test.describe("header fits on every phone width", () => {
  for (const width of PHONE_WIDTHS) {
    test(`no header control is clipped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.locator("header").first().waitFor();

      const clipped = await page.evaluate((vw) => {
        const header = document.querySelector("header");
        if (!header) throw new Error("no <header> on the page");
        return Array.from(header.querySelectorAll("a,button"))
          .map((el) => {
            const r = el.getBoundingClientRect();
            const label =
              el.getAttribute("aria-label") ||
              (el as HTMLElement).innerText.trim().split("\n")[0] ||
              el.tagName;
            return { label, left: Math.round(r.left), right: Math.round(r.right), w: r.width };
          })
          // Zero-size elements are hidden (menu contents, responsive variants)
          // and cannot be clipped.
          .filter((c) => c.w > 0)
          .filter((c) => c.right > vw + 0.5 || c.left < -0.5);
      }, width);

      expect(
        clipped,
        `header controls hang outside the ${width}px viewport and are clipped by overflow-hidden:\n` +
          clipped.map((c) => `  ${c.label}: ${c.left} → ${c.right}`).join("\n")
      ).toEqual([]);
    });

    test(`cart and wishlist are tappable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      for (const label of ESSENTIAL) {
        const control = page.locator(`header a[aria-label="${label}"]`).first();
        await expect(control, `${label} is missing from the header at ${width}px`).toBeVisible();

        const box = await control.boundingBox();
        expect(box, `${label} has no layout box at ${width}px`).not.toBeNull();
        // Fully inside the viewport, not merely present in the DOM.
        expect(box!.x, `${label} starts off the left edge at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(
          box!.x + box!.width,
          `${label} extends past the right edge at ${width}px`
        ).toBeLessThanOrEqual(width);
        expect(box!.width, `${label} is too narrow to tap at ${width}px`).toBeGreaterThanOrEqual(24);
        expect(box!.height, `${label} is too short to tap at ${width}px`).toBeGreaterThanOrEqual(24);
      }
    });
  }

  test("the search box stays usable once it has its own row", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const search = page.locator('header input[aria-label="Search products"]');
    await expect(search).toBeVisible();
    const box = (await search.boundingBox())!;
    // Wrapping to a second row is only an improvement if the field actually
    // gets the width; a 20px sliver would pass a visibility check.
    expect(box.width, "search field collapsed instead of taking the full row").toBeGreaterThan(200);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });

  test("compare is reachable from the mobile menu on the narrowest phones", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Hidden from the top bar at this width, by design.
    await expect(page.locator('header a[aria-label="Compare"]')).toBeHidden();

    await page.locator("header button[aria-controls='mobile-nav-panel']").click();
    const link = page.locator("#mobile-nav-panel a[href='/compare']");
    await expect(link, "compare vanished entirely at 320px").toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/compare$/);
  });
});
