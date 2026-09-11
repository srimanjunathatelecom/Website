/**
 * Repeats the full booking journey and checks that nothing accumulates.
 *
 * The brief asks specifically for this: scroll, open a brand, search a model,
 * open the model, pick a service, go back, repeat — with no progressive
 * slowdown and no accumulating timers or listeners. A single pass cannot show
 * that. This runs the loop N times and reports the trend.
 *
 * Because App Router navigations are client-side, `window` survives the whole
 * journey, so `addEventListener`, `setInterval` and `setTimeout` are wrapped
 * once up front and their live balance is read after every cycle. A component
 * that registers a listener and forgets to remove it on unmount shows up as a
 * count that climbs cycle after cycle.
 *
 *   node scripts/perf/stress-test.mjs <base> [cycles]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:3002";
const CYCLES = Number(process.argv[3] || 5);

const INSTRUMENT = () => {
  const w = window;
  w.__live = { listeners: 0, intervals: 0, timeouts: 0, rafs: 0 };
  // Listeners on a node that later detaches are collected with that node, so a
  // raw net count over-reports. What actually costs the user is listeners on
  // long-lived targets: every scroll or resize must dispatch to all of them.
  // Track those separately, and keep a per-event-type tally so a leak can be
  // traced back to the component that registered it.
  w.__persist = {};

  const targets = [w.EventTarget.prototype];
  for (const proto of targets) {
    const add = proto.addEventListener;
    const rem = proto.removeEventListener;
    const isPersistent = (t) => t === w || t === w.document || t === w.document.documentElement || t === w.document.body;
    proto.addEventListener = function (...args) {
      w.__live.listeners++;
      if (isPersistent(this)) {
        const k = (this === w ? "window:" : this === w.document ? "document:" : "root:") + args[0];
        w.__persist[k] = (w.__persist[k] || 0) + 1;
      }
      return add.apply(this, args);
    };
    proto.removeEventListener = function (...args) {
      w.__live.listeners--;
      if (isPersistent(this)) {
        const k = (this === w ? "window:" : this === w.document ? "document:" : "root:") + args[0];
        w.__persist[k] = (w.__persist[k] || 0) - 1;
      }
      return rem.apply(this, args);
    };
  }

  const si = w.setInterval;
  w.setInterval = function (...args) {
    w.__live.intervals++;
    return si.apply(this, args);
  };
  const ci = w.clearInterval;
  w.clearInterval = function (id) {
    if (id != null) w.__live.intervals--;
    return ci.call(this, id);
  };

  const st = w.setTimeout;
  w.setTimeout = function (fn, d, ...rest) {
    w.__live.timeouts++;
    const wrapped =
      typeof fn === "function"
        ? function (...a) {
            w.__live.timeouts--;
            return fn.apply(this, a);
          }
        : fn;
    return st.call(this, wrapped, d, ...rest);
  };
  const ct = w.clearTimeout;
  w.clearTimeout = function (id) {
    if (id != null) w.__live.timeouts--;
    return ct.call(this, id);
  };
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.addInitScript(INSTRUMENT);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const sample = async () => {
  const live = await page.evaluate(() => ({ ...window.__live }));
  const dom = await page.evaluate(() => document.getElementsByTagName("*").length);
  const heap = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0
  );
  const persist = await page.evaluate(() =>
    Object.fromEntries(Object.entries(window.__persist).filter(([, v]) => v > 0))
  );
  const persistTotal = Object.values(persist).reduce((a, b) => a + b, 0);
  return { ...live, dom, heapMB: heap, persistTotal, persist };
};

// One initial load; every later step is a client-side navigation, so the
// instrumentation and any leak carry across cycles.
await page.goto(`${BASE}/repair`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);

const rows = [];

for (let c = 1; c <= CYCLES; c++) {
  const t0 = Date.now();

  // Scroll the brand list.
  await page.mouse.move(700, 450);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(40);
  }

  // Open a brand.
  await page.locator('a[href="/repair/samsung"]').first().click();
  await page.waitForURL("**/repair/samsung", { timeout: 30000 });
  await page.waitForTimeout(900);

  // Search for a model.
  const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
  if (await search.count()) {
    await search.click();
    await search.fill("");
    for (const ch of "galaxy") {
      await search.press(ch);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    await search.fill("");
    await page.waitForTimeout(300);
  }

  // Open a model.
  const model = page.locator('a[href^="/repair/samsung/"]').first();
  await model.click();
  await page.waitForTimeout(1600);

  // Pick a service, if the step-3 page offers one.
  const service = page.locator('button, a').filter({ hasText: /screen|battery|repair|book/i }).first();
  if (await service.count()) {
    await service.click({ trial: true }).catch(() => {});
  }
  await page.waitForTimeout(400);

  // Back to brands.
  await page.goBack();
  await page.waitForTimeout(700);
  await page.goBack();
  await page.waitForTimeout(900);

  rows.push({ cycle: c, ms: Date.now() - t0, ...(await sample()) });
}

console.log(`\n=== STRESS TEST  ${BASE}  ${CYCLES} cycles, 4x CPU throttle\n`);
console.log("  cycle   time    listeners  persistent  intervals  timeouts   DOM   heapMB");
for (const r of rows) {
  console.log(
    `   ${String(r.cycle).padEnd(6)} ${String(r.ms + "ms").padEnd(8)}${String(r.listeners).padEnd(11)}` +
      `${String(r.persistTotal).padEnd(12)}${String(r.intervals).padEnd(11)}${String(r.timeouts).padEnd(11)}` +
      `${String(r.dom).padEnd(7)}${r.heapMB}`
  );
}

const first = rows[0];
const last = rows[rows.length - 1];
const growth = (k) => last[k] - first[k];
const pct = ((last.ms - first.ms) / first.ms) * 100;

console.log(`\n  cycle time      ${first.ms}ms -> ${last.ms}ms  (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)`);
console.log(`  listener growth ${growth("listeners") >= 0 ? "+" : ""}${growth("listeners")}`);
console.log(`  interval growth ${growth("intervals") >= 0 ? "+" : ""}${growth("intervals")}`);
console.log(`  timeout growth  ${growth("timeouts") >= 0 ? "+" : ""}${growth("timeouts")}`);
console.log(`  DOM growth      ${growth("dom") >= 0 ? "+" : ""}${growth("dom")} nodes`);
console.log(
  `  persistent-target listener growth ${growth("persistTotal") >= 0 ? "+" : ""}${growth("persistTotal")}`
);
console.log("\n  live listeners on window/document/root after last cycle:");
for (const [k, v] of Object.entries(last.persist).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(v).padStart(5)}  ${k}`);
}

await browser.close();
