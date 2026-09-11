/**
 * The admin console's 24 data panels all read through one hook, useApi. That
 * hook's fetching effect depends on the loader function, so if the loader is
 * ever rebuilt on each render the effect refetches on each render too — a loop
 * that doesn't crash, doesn't fail a typecheck, and doesn't show up in a
 * screenshot. It just hammers the database for as long as the tab is open.
 *
 * These tests exist because that hook was changed to make its dependencies
 * honest, and "the page still renders" is not evidence that it was done
 * correctly. They count requests over time instead.
 */

import { test, expect } from "@playwright/test";
import { signInAsAdmin } from "./helpers";

test.describe("admin panels", () => {
  test("panels fetch once rather than refetching on every render", async ({ page }) => {
    await signInAsAdmin(page);

    // Count requests per endpoint rather than in total, so a single noisy panel
    // is identifiable instead of hidden in an aggregate.
    const counts = new Map<string, number>();
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (!url.pathname.startsWith("/api/")) return;
      counts.set(url.pathname, (counts.get(url.pathname) ?? 0) + 1);
    });

    // Banners and Content are the two panels whose derived arrays were rebuilt
    // every render, so they are the ones most likely to regress.
    for (const panel of ["banners", "content"]) {
      await page.goto(`/admin?section=${panel}`);
      await page.waitForLoadState("networkidle");
    }

    // Sit still. Nothing is interacting with the page, so a well-behaved panel
    // issues no further requests; only the dashboard's deliberate 10s poll may.
    await page.waitForTimeout(6000);

    const noisy = [...counts.entries()].filter(([path, n]) => n > 4 && !path.includes("/admin/stats"));
    expect(noisy, `endpoints fetched more than 4 times: ${JSON.stringify(noisy)}`).toEqual([]);
  });

  test("the content editor selects a page on load, and keeps the choice", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin?section=content");

    // The effect that seeds this form from freshly-arrived data is the one whose
    // dependencies changed. If it now re-runs when it shouldn't, it would
    // overwrite what the admin typed with the first page's stored body.
    const body = page.locator("textarea").first();
    await expect(body).not.toHaveValue("", { timeout: 15000 });

    const typed = "Edited by the panel regression test.";
    await body.fill(typed);
    // Long enough for any stray re-run of the seeding effect to land.
    await page.waitForTimeout(3000);
    await expect(body).toHaveValue(typed);
  });
});
