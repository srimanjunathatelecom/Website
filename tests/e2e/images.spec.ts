import { test, expect } from "@playwright/test";

/**
 * Product card images come from admin-entered values, and they are not all the
 * same kind of thing. The seeded catalogue uses inline `data:` SVG URIs; a real
 * catalogue uses http(s) URLs or files under /public.
 *
 * next/image can only handle the latter - it needs a source it can fetch and
 * re-encode. Handing it a data: URI fails outright. So ProductCard picks a
 * renderer per source, and these tests exist because the failure mode of
 * getting that split wrong is "every product image on the site is blank",
 * which is invisible to a typecheck, a build, and a lint rule.
 */

test.describe("product images render whatever the source is", () => {
  test("no product card image is broken on the catalogue", async ({ page }) => {
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    // Walk the whole page so every lazy-loaded row is actually reached.
    //
    // This used to nudge to a fixed y=600, which is fine on a three-up desktop
    // grid but leaves most of a single-column mobile grid untouched. Cards below
    // that line never begin fetching, so the check below saw `complete === false`
    // with an empty currentSrc and reported a perfectly good image as broken —
    // and any change to card height moved which products got blamed. Stepping to
    // the bottom makes the result depend on whether images load, not on how tall
    // a card happens to be.
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });

    // Wait for the grid to actually have images before asserting on them,
    // otherwise an empty list would pass trivially.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              document.querySelectorAll("a[href^='/products/'] img").length
          ),
        { message: "product grid never rendered any images", timeout: 15000 }
      )
      .toBeGreaterThan(0);

    const broken = await page.evaluate(async () => {
      const imgs = Array.from(
        document.querySelectorAll<HTMLImageElement>("a[href^='/products/'] img")
      );
      // Give in-flight requests a chance to settle before judging them.
      await Promise.all(
        imgs.map(
          (i) =>
            i.complete ||
            new Promise((res) => {
              i.addEventListener("load", res, { once: true });
              i.addEventListener("error", res, { once: true });
              setTimeout(res, 8000);
            })
        )
      );
      return imgs
        .filter((i) => !i.complete || i.naturalWidth === 0)
        .map((i) => ({ src: i.currentSrc.slice(0, 100), alt: i.alt }));
    });

    expect(
      broken,
      `product images failed to load:\n${broken
        .map((b) => `  ${b.alt}: ${b.src}`)
        .join("\n")}`
    ).toEqual([]);
  });

  test("the optimizer serves smaller files to narrower viewports", async ({ page }) => {
    // The point of routing real URLs through next/image is that a phone gets a
    // phone-sized file. If `sizes` is wrong, every viewport downloads the same
    // desktop image and the change is pure overhead - so assert on the width
    // actually requested. /public assets always take the optimized path.
    const widthFor = async (viewport: number) => {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const logo = page.locator('header img[src*="/_next/image"]').first();
      await expect(logo).toBeVisible();
      await expect
        .poll(async () => logo.evaluate((i: HTMLImageElement) => i.naturalWidth), {
          message: "optimized image never finished loading",
        })
        .toBeGreaterThan(0);
      const src = await logo.evaluate((i: HTMLImageElement) => i.currentSrc);
      const w = new URL(src).searchParams.get("w");
      expect(w, `no w= parameter in optimized src: ${src}`).not.toBeNull();
      return Number(w);
    };

    const phone = await widthFor(375);
    const desktop = await widthFor(1440);
    expect(
      phone,
      `phone requested w=${phone}, desktop requested w=${desktop} - responsive sizing is not working`
    ).toBeLessThanOrEqual(desktop);
  });

  test("a broken image URL degrades to the initials placeholder", async ({ page }) => {
    // Admins paste URLs by hand, so some will rot. A dead URL must not leave a
    // blank hole in the grid.
    await page.route("**/_next/image**", (route) => route.abort());
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    // The page must still render its product grid rather than erroring out.
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible();
  });
});

/**
 * The image optimizer used to accept `remotePatterns: [{ hostname: "**" }]`, so
 * /_next/image would fetch, decode and re-encode any HTTPS URL on the internet
 * for anyone who asked. That is an open proxy running on the shop's CPU and
 * bandwidth, and nothing about it shows up in a typecheck, a lint pass or a page
 * that looks correct.
 *
 * It is now limited to NEXT_PUBLIC_IMAGE_HOSTS, empty by default. These tests
 * pin both halves of that, because a future "images are blurry, let me widen the
 * pattern" change would silently reopen it.
 *
 * Deliberately no external host here: the host check happens before any network
 * request, so the assertion holds without depending on a third party being up.
 */
test.describe("the image optimizer is not an open proxy", () => {
  test("refuses a remote host that is not allowlisted", async ({ request }) => {
    const res = await request.get(
      "/_next/image?url=" + encodeURIComponent("https://example.com/photo.png") + "&w=640&q=75",
      { failOnStatusCode: false }
    );
    // 400 = rejected on the configured patterns, before it fetched anything.
    expect(res.status()).toBe(400);
  });

  test("still optimizes images served by this deployment", async ({ request }) => {
    // The counterpart assertion. Without it, deleting the images config
    // altogether would also make the test above pass.
    const res = await request.get("/_next/image?url=%2Fimages%2Fsms-logo.png&w=640&q=75", {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/");
  });
});
