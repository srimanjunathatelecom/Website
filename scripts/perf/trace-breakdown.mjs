/**
 * Records a DevTools performance trace during a scroll and sums renderer time by
 * event type, so "the page is slow" turns into "the page spends N ms in paint".
 *
 * The CPU profile said 60% of scroll time was `(program)` — browser-internal
 * work, not JavaScript. That rules memoisation out and points at style, layout,
 * paint or compositing, but it does not say which. This does.
 *
 *   node scripts/perf/trace-breakdown.mjs <url> [label]
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:3002/";
const LABEL = process.argv[3] || URL;
/**
 * Optional CSS injected after load. This exists to bisect a rendering
 * regression without a rebuild between every hypothesis: each candidate rule
 * can be toggled back on in isolation and re-measured in seconds.
 */
const EXTRA_CSS = process.argv[4] || "";

const INTERESTING = new Set([
  "ParseHTML",
  "EvaluateScript",
  "FunctionCall",
  "TimerFire",
  "UpdateLayoutTree", // style recalculation
  "Layout",
  "PrePaint",
  "Paint",
  "PaintImage",
  "Rasterize",
  "RasterTask",
  "CompositeLayers",
  "Commit",
  "ImageDecodeTask",
  "Decode Image",
  "DecodeImage",
  "GPUTask",
  "ScrollDocumentUpdate",
  "HitTest",
  "MajorGC",
  "MinorGC",
]);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto(URL, { waitUntil: "load", timeout: 60000 });
if (EXTRA_CSS) await page.addStyleTag({ content: EXTRA_CSS });
await page.waitForTimeout(1200);

const events = [];
cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));

await cdp.send("Tracing.start", {
  traceConfig: {
    includedCategories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "blink.user_timing",
    ],
  },
  transferMode: "ReportEvents",
});

await page.mouse.move(720, 500);
for (let i = 0; i < 60; i++) {
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 720,
    y: 500,
    deltaX: 0,
    deltaY: 100,
    pointerType: "mouse",
  });
  await page.waitForTimeout(16);
}
await page.waitForTimeout(400);

const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
await cdp.send("Tracing.end");
await done;

const totals = new Map();
let frames = 0;
for (const e of events) {
  if (e.name === "DrawFrame" || e.name === "DrawFrames") frames++;
  if (e.ph !== "X" && e.ph !== "C") continue;
  if (typeof e.dur !== "number") continue;
  if (!INTERESTING.has(e.name)) continue;
  const cur = totals.get(e.name) || { ms: 0, n: 0 };
  cur.ms += e.dur / 1000;
  cur.n++;
  totals.set(e.name, cur);
}

const rows = [...totals.entries()].sort((a, b) => b[1].ms - a[1].ms);
const grand = rows.reduce((a, [, v]) => a + v.ms, 0);

console.log(`\n=== TRACE BREAKDOWN during scroll — ${LABEL}`);
console.log(`    ${events.length} trace events, 4x CPU throttle\n`);
console.log("   total ms    count   share   event");
for (const [name, v] of rows) {
  console.log(
    `  ${v.ms.toFixed(1).padStart(9)}  ${String(v.n).padStart(7)}  ${((v.ms / grand) * 100).toFixed(1).padStart(5)}%   ${name}`
  );
}
console.log(`  ${grand.toFixed(1).padStart(9)}                     TOTAL accounted`);

await browser.close();
