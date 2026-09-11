/**
 * Real-browser scroll profiler.
 *
 * Drives Chromium over CDP and reports the numbers that correspond to what the
 * complaint actually was — "stuttering", "janky", "not fluid":
 *
 *  - frame intervals during a continuous scroll, sampled with rAF, so we can
 *    count dropped frames against both a 60 Hz and a 120 Hz budget
 *  - long tasks (>50 ms) blocking the main thread
 *  - layout-shift score accumulated while scrolling
 *  - composited layer count and total layer memory, from CDP LayerTree, which
 *    is how you see backdrop-filter and will-change costs rather than guess
 *
 * Scrolling is driven with Input.dispatchMouseEvent wheel ticks rather than
 * window.scrollTo, because scrollTo skips the compositor path that is the thing
 * under test.
 *
 *   node scripts/perf/scroll-profile.mjs <baseUrl> <label>
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:3002";
const LABEL = process.argv[3] || "run";

const ALL_PAGES = [
  ["/", "Home"],
  ["/repair", "Repair — brands"],
  ["/repair/samsung", "Repair — models"],
  ["/products", "Products grid"],
];

// Optional 4th arg filters to one route, e.g. `... "label" /`.
// Frame-time medians on a heavy page sit right on the 16.7/33.4ms boundary and
// flip between runs, so a single run cannot tell a real change from noise.
// Being able to hammer one route repeatedly is what makes the comparison honest.
const ONLY = process.argv[4];
const PAGES = ONLY ? ALL_PAGES.filter(([p]) => p === ONLY) : ALL_PAGES;

/** 4x CPU throttle: a desktop dev box hides jank a mid-range phone shows. */
const CPU_THROTTLE = 4;

const browser = await chromium.launch({
  args: ["--enable-gpu-rasterization", "--force-device-scale-factor=1"],
});

const results = [];

for (const [path, name] of PAGES) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  await cdp.send("LayerTree.enable");

  const layerSnapshot = new Promise((resolve) => {
    cdp.on("LayerTree.layerTreeDidChange", ({ layers }) => {
      if (layers) resolve(layers);
    });
    setTimeout(() => resolve([]), 8000);
  });

  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });

  // Install observers before scrolling so nothing is missed.
  await page.evaluate(() => {
    window.__perf = { longTasks: [], cls: 0, frames: [] };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__perf.longTasks.push(e.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });

  await page.waitForTimeout(600);
  const layers = await layerSnapshot;

  // Start rAF frame sampling, then drive a continuous wheel scroll.
  await page.evaluate(() => {
    window.__perf.frames = [];
    let last = performance.now();
    window.__perf.sampling = true;
    const tick = (t) => {
      window.__perf.frames.push(t - last);
      last = t;
      if (window.__perf.sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.mouse.move(720, 500);
  for (let i = 0; i < 45; i++) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 720,
      y: 500,
      deltaX: 0,
      deltaY: 120,
      pointerType: "mouse",
    });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);

  const perf = await page.evaluate(() => {
    window.__perf.sampling = false;
    const f = window.__perf.frames.filter((x) => x > 0).slice(2);
    return {
      frames: f,
      longTasks: window.__perf.longTasks,
      cls: window.__perf.cls,
      scrolled: window.scrollY,
    };
  });

  const f = perf.frames.sort((a, b) => a - b);
  const pct = (p) => (f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : 0);

  results.push({
    name,
    path,
    scrolledPx: Math.round(perf.scrolled),
    frameCount: f.length,
    medianFrameMs: +pct(0.5).toFixed(2),
    p95FrameMs: +pct(0.95).toFixed(2),
    worstFrameMs: +(f[f.length - 1] || 0).toFixed(2),
    over16ms: f.filter((x) => x > 16.7).length,
    over33ms: f.filter((x) => x > 33.4).length,
    longTasks: perf.longTasks.length,
    longTaskTotalMs: +perf.longTasks.reduce((a, b) => a + b, 0).toFixed(1),
    cls: +perf.cls.toFixed(4),
    compositedLayers: layers.length,
    layerMemMB: +(
      layers.reduce((a, l) => a + (l.width || 0) * (l.height || 0) * 4, 0) /
      1048576
    ).toFixed(1),
  });

  await context.close();
}

await browser.close();

console.log(`\n===== SCROLL PROFILE: ${LABEL} (4x CPU throttle, 1440x900) =====`);
for (const r of results) {
  console.log(
    `\n${r.name}  (${r.path})  scrolled ${r.scrolledPx}px over ${r.frameCount} frames`
  );
  console.log(
    `   frame ms: median ${r.medianFrameMs}  p95 ${r.p95FrameMs}  worst ${r.worstFrameMs}`
  );
  console.log(
    `   dropped:  >16.7ms ${r.over16ms}/${r.frameCount}   >33.4ms ${r.over33ms}/${r.frameCount}`
  );
  console.log(
    `   long tasks: ${r.longTasks} (${r.longTaskTotalMs}ms)   CLS while scrolling: ${r.cls}`
  );
  console.log(`   composited layers: ${r.compositedLayers}  (~${r.layerMemMB} MB)`);
}
console.log("\nJSON " + JSON.stringify(results));
