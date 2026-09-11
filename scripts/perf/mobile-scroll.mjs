/**
 * Mobile touch-scroll profile.
 *
 * The brief asks for mobile touch scrolling to be verified specifically, not
 * inferred from a narrow desktop window, because touch scrolling goes down a
 * different path in the browser than wheel scrolling.
 *
 * Two harness traps are worth recording, because both produce a test that looks
 * like it passes while measuring nothing:
 *
 *  - Dragging with the mouse API does not scroll a touch page. It reports
 *    perfect frame times because the page never moved.
 *  - `Input.synthesizeScrollGesture` with `gestureSourceType: "touch"` also
 *    left `scrollY` at 0 here.
 *
 * Raw `Input.dispatchTouchEvent` sequences do work, so that is what this uses.
 * Any run reporting `scrolled=0px` is a broken measurement, not a fast page.
 *
 *   node scripts/perf/mobile-scroll.mjs <base> [swipes]
 */
import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:3002";
const SWIPES = Number(process.argv[3] || 8);

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"], hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60000 });
await page.evaluate(() => {
  window.__cls = 0;
  window.__f = [];
  let last = performance.now();
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  (function tick() {
    const n = performance.now();
    window.__f.push(n - last);
    last = n;
    requestAnimationFrame(tick);
  })();
});
await page.waitForTimeout(1500);
// Discard load-time frames; only scrolling is under test.
await page.evaluate(() => {
  window.__f.length = 0;
});

async function swipe() {
  let y = 700;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y }] });
  for (let i = 0; i < 10; i++) {
    y -= 55;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

for (let i = 0; i < SWIPES; i++) {
  await swipe();
  await page.waitForTimeout(180);
}

const r = await page.evaluate(() => {
  const f = window.__f.filter((x) => x > 0).sort((a, b) => a - b);
  const at = (q) => f[Math.floor(f.length * q)] || 0;
  return {
    y: Math.round(window.scrollY),
    cls: window.__cls,
    n: f.length,
    med: at(0.5),
    p95: at(0.95),
    worst: f[f.length - 1] || 0,
    over33: f.filter((x) => x > 33).length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

console.log(`\n=== MOBILE TOUCH SCROLL  ${BASE}  390x844, 4x CPU, ${SWIPES} swipes\n`);
console.log(`  scrolled        ${r.y}px${r.y === 0 ? "   <-- BROKEN MEASUREMENT, gesture did not land" : ""}`);
console.log(`  CLS             ${r.cls.toFixed(4)}`);
console.log(`  horiz overflow  ${r.overflow}px`);
console.log(`  JS errors       ${errors.length}${errors.length ? " :: " + errors[0] : ""}`);
console.log(
  `  frames          n=${r.n}  median=${r.med.toFixed(1)}ms  p95=${r.p95.toFixed(1)}ms  ` +
    `worst=${r.worst.toFixed(1)}ms  over33ms=${r.over33} (${((r.over33 / r.n) * 100).toFixed(0)}%)`
);
console.log("");

await browser.close();
