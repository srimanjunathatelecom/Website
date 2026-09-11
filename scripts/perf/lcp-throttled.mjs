/**
 * Measures LCP and image load timing over a throttled connection.
 *
 * Image priority decisions are invisible on a fast local network: everything
 * arrives at once, so preloading nine things looks free. On a real mobile
 * connection bandwidth is the scarce resource and every high-priority image
 * competes with the ones the visitor can actually see. This throttles to
 * roughly Fast 3G so those tradeoffs become measurable.
 *
 *   node scripts/perf/lcp-throttled.mjs <url> [runs] [mobile|desktop]
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:3002/repair/samsung";
const RUNS = Number(process.argv[3] || 3);
const VIEWPORT =
  process.argv[4] === "desktop"
    ? { width: 1440, height: 900 }
    : { width: 390, height: 844 };

// Fast 3G: 1.6 Mbit down, 750 kbit up, 150ms RTT.
const NET = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

const browser = await chromium.launch();
const out = [];

for (let run = 0; run < RUNS; run++) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  let imgBytes = 0;
  let imgCount = 0;
  page.on("response", (res) => {
    if ((res.headers()["content-type"] || "").startsWith("image/")) {
      imgCount++;
      imgBytes += Number(res.headers()["content-length"] || 0);
    }
  });

  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page.goto(URL, { waitUntil: "load", timeout: 120000 });
  // LCP is only final once the page stops changing; give it room.
  await page.waitForTimeout(4000);

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    // `initiatorType === "img"` misses everything the preload scanner or a
    // <link rel=preload> fetched, which is exactly the set that `priority`
    // creates — so match on the URL instead.
    const imgs = performance
      .getEntriesByType("resource")
      .filter((r) =>
        /\/_next\/image|\.(jpe?g|png|webp|avif|svg|gif)(\?|$)/i.test(r.name)
      );
    return {
      lcp: Math.round(window.__lcp),
      fcp: Math.round(
        (performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0
      ),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
      // When the last image finishes is what "images feel slow" actually means.
      lastImageEnd: Math.round(Math.max(0, ...imgs.map((r) => r.responseEnd))),
      imgRequests: imgs.length,
    };
  });

  out.push({ ...m, imgBytes, imgCount });
  await context.close();
}

const med = (k) => {
  const v = out.map((o) => o[k]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};

console.log(`\n=== LCP @ Fast3G + 4x CPU  ${URL}`);
console.log(`    ${VIEWPORT.width}x${VIEWPORT.height}, ${RUNS} runs (median)\n`);
console.log(`    FCP              ${med("fcp")} ms`);
console.log(`    LCP              ${med("lcp")} ms`);
console.log(`    last image done  ${med("lastImageEnd")} ms`);
console.log(`    image requests   ${med("imgRequests")}`);
console.log(`    image bytes      ${(med("imgBytes") / 1024).toFixed(0)} kB`);
console.log(`\n    all runs LCP: ${out.map((o) => o.lcp).join(", ")} ms`);
console.log(`    all runs last image: ${out.map((o) => o.lastImageEnd).join(", ")} ms`);

await browser.close();
