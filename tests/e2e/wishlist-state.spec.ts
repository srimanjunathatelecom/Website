import { test, expect, Page } from "@playwright/test";
import { signInAsNewCustomer } from "./helpers";

/**
 * Guards the bug these tests were written for: a product card's heart was
 * initialised to "not saved" on every mount and never reconciled with the
 * server, so a logged-in shopper saw an empty heart on something they had
 * already saved — and because the card believed nothing was saved, the next
 * click removed the item instead of adding it.
 *
 * Assertions go through aria-pressed rather than colour, so they survive
 * restyling and would fail again if a card stopped reading the shared state in
 * lib/wishlist.
 *
 * The saved-state checks are deliberately one test rather than several.
 * /api/auth/register is capped at 5 per IP per hour and the suite runs across
 * two viewports, so a test-per-assertion would spend the whole budget and start
 * failing for a reason that has nothing to do with wishlists.
 */

/**
 * Reads the wishlist from inside the page. `page.request` has its own cookie
 * jar and answers 401 even when the page is signed in — the same trap
 * helpers.ts documents for writes.
 */
async function wishlistCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const r = await fetch("/api/wishlist");
    if (!r.ok) return -1;
    const b = await r.json();
    return Array.isArray(b.items) ? b.items.length : -1;
  });
}

test.describe("wishlist state", () => {
  test("a saved product stays saved across a reload, and unsaves on a second click", async ({ page }) => {
    // Registering signs the session in, so no separate login step is needed.
    await signInAsNewCustomer(page);

    await page.goto("/");
    const add = page.getByRole("button", { name: /add to wishlist/i }).first();
    await add.scrollIntoViewIfNeeded();
    await expect(add).toHaveAttribute("aria-pressed", "false");

    await add.click();
    await expect(page.getByRole("button", { name: /remove from wishlist/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    // Confirm it actually persisted rather than only flipping optimistically.
    await expect.poll(() => wishlistCount(page), { timeout: 10_000 }).toBe(1);

    // The regression itself: a full reload used to reset every heart to empty.
    await page.reload();
    const saved = page.getByRole("button", { name: /remove from wishlist/i }).first();
    await expect(saved).toBeVisible({ timeout: 15_000 });
    await expect(saved).toHaveAttribute("aria-pressed", "true");

    // And because the card now knows it is saved, the next click removes it
    // instead of re-adding — which is what silently deleted items before.
    await saved.scrollIntoViewIfNeeded();
    await saved.click();
    await expect.poll(() => wishlistCount(page), { timeout: 10_000 }).toBe(0);
  });

  test("a guest sees unsaved hearts and is sent to login", async ({ page }) => {
    await page.goto("/");
    const heart = page.getByRole("button", { name: /add to wishlist/i }).first();
    await heart.scrollIntoViewIfNeeded();
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await heart.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
