/**
 * Measures how long real interactions take to show a result on screen.
 *
 * This is the metric the brief is actually about: "there must not be a
 * dead-feeling pause", "did my click actually work?". It is not render *count* —
 * a component can re-render fifty times and feel instant, or once and stall.
 * So rather than counting renders, this measures the browser's own `event`
 * timing entries, which span from the input event to the next paint that
 * reflects it. That is INP, and it is what the visitor feels.
 *
 * Each scenario reports the worst interaction, because one 300ms stall in a
 * burst of typing is what gets noticed, not the average.
 *
 *   node scripts/perf/interaction-latency.mjs <base> [label]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:3002";
const LABEL = process.argv[3] || "run";
// Optional CSS injected after load, so a hypothesis about *why* an interaction
// is slow can be tested in seconds instead of via a two-minute rebuild.
const EXTRA_CSS = process.argv[4] || "";
const CPU_THROTTLE = 4;

const browser = await chromium.launch();

/** Installs an observer that records every interaction's latency. */
const INSTRUMENT = () => {
  window.__events = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (!e.interactionId) continue; // ignore non-interaction events
      window.__events.push({
        name: e.name,
        duration: e.duration,
        // Time spent before the handler even started: a busy main thread.
        delay: e.processingStart - e.startTime,
        processing: e.processingEnd - e.processingStart,
      });
    }
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
};

const scenarios = [
  {
    name: "Type in model search (34 models, local filter)",
    path: "/repair/samsung",
    async run(page) {
      const box = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
      await box.waitFor({ timeout: 15000 });
      await box.click();
      for (const ch of "galaxy s2") {
        await box.press(ch === " " ? "Space" : ch);
        await page.waitForTimeout(90);
      }
    },
  },
  {
    name: "Click a model card (navigation)",
    path: "/repair/samsung",
    async run(page) {
      const card = page.locator('a[href^="/repair/samsung/"]').first();
      await card.waitFor({ timeout: 15000 });
      await card.click();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "Click a brand card (navigation)",
    path: "/repair",
    async run(page) {
      const card = page.locator('a[href^="/repair/"]').first();
      await card.waitFor({ timeout: 15000 });
      await card.click();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "Type in header search (network-backed)",
    path: "/",
    async run(page) {
      const box = page.locator('header input').first();
      await box.waitFor({ timeout: 15000 });
      await box.click();
      for (const ch of "phone") {
        await box.press(ch);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "Products page: open first product",
    path: "/products",
    async run(page) {
      const card = page.locator('a[href^="/products/"]').first();
      if (!(await card.count())) return;
      await card.click();
      await page.waitForTimeout(2500);
    },
  },
];

const results = [];

for (const s of scenarios) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.addInitScript(INSTRUMENT);
  await page.goto(BASE + s.path, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1200); // let hydration finish
  if (EXTRA_CSS) await page.addStyleTag({ content: EXTRA_CSS });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  let error = null;
  try {
    await s.run(page);
  } catch (e) {
    error = e.message.split("\n")[0];
  }

  // Interactions may have happened after a navigation, so read from whatever
  // document is current.
  const events = await page.evaluate(() => window.__events || []).catch(() => []);
  results.push({ name: s.name, events, error });
  await context.close();
}

console.log(`\n=== INTERACTION LATENCY  ${LABEL}  ${BASE}  (${CPU_THROTTLE}x CPU throttle)\n`);
for (const r of results) {
  if (r.error) {
    console.log(`  ${r.name}\n      SKIPPED: ${r.error}\n`);
    continue;
  }
  if (!r.events.length) {
    console.log(`  ${r.name}\n      no interaction over 16ms recorded (good)\n`);
    continue;
  }
  const sorted = [...r.events].sort((a, b) => b.duration - a.duration);
  const worst = sorted[0];
  const p = (n) => Math.round(n) + "ms";
  console.log(`  ${r.name}`);
  console.log(
    `      worst ${p(worst.duration)} (${worst.name}) = ${p(worst.delay)} waiting + ${p(worst.processing)} handler`
  );
  console.log(
    `      ${r.events.length} interactions >16ms; over 200ms: ${
      r.events.filter((e) => e.duration > 200).length
    }`
  );
  console.log(
    `      all: ${sorted.slice(0, 8).map((e) => Math.round(e.duration)).join(", ")}\n`
  );
}

await browser.close();
