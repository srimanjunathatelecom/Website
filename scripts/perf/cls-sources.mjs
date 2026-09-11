/**
 * Reports layout shifts with the elements responsible.
 *
 * A CLS number on its own is not actionable. `sources` on a layout-shift entry
 * names the nodes that moved and by how much, which turns the score into a
 * specific element and a specific fix.
 *
 *   node scripts/perf/cls-sources.mjs <url>
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:3002/repair/samsung";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__shifts.push({
        value: e.value,
        hadRecentInput: e.hadRecentInput,
        at: Math.round(e.startTime),
        sources: (e.sources || []).map((s) => {
          const n = s.node;
          let desc = "(detached)";
          if (n && n.nodeType === 1) {
            desc =
              n.tagName.toLowerCase() +
              (n.id ? "#" + n.id : "") +
              (typeof n.className === "string" && n.className
                ? "." + n.className.trim().split(/\s+/).slice(0, 4).join(".")
                : "");
          }
          return {
            node: desc,
            from: s.previousRect ? `${Math.round(s.previousRect.y)}` : "?",
            to: s.currentRect ? `${Math.round(s.currentRect.y)}` : "?",
            h: s.currentRect ? Math.round(s.currentRect.height) : 0,
          };
        }),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
});

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(3500);

const shifts = await page.evaluate(() => window.__shifts);
const total = shifts.reduce((a, s) => a + (s.hadRecentInput ? 0 : s.value), 0);

console.log(`\n=== LAYOUT SHIFTS  ${URL}`);
console.log(`    CLS ${total.toFixed(4)} across ${shifts.length} shift entries\n`);
for (const s of shifts.sort((a, b) => b.value - a.value).slice(0, 10)) {
  console.log(`  +${s.value.toFixed(4)} at ${s.at}ms`);
  for (const src of s.sources.slice(0, 4)) {
    console.log(`      y ${src.from} -> ${src.to} (h${src.h})  ${src.node.slice(0, 84)}`);
  }
}

await browser.close();
