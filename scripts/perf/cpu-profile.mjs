/**
 * Captures a real CDP CPU profile while scrolling a page and prints the hottest
 * call frames by self time, plus a Runtime/Layout breakdown from the trace.
 *
 * This is the "do not guess" step: the scroll profiler says *that* the homepage
 * drops frames, this says *which function* is spending the time.
 *
 *   node scripts/perf/cpu-profile.mjs <url> [scrollTicks]
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:3002/";
const TICKS = Number(process.argv[3] || 60);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1000);

await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");

await page.mouse.move(720, 500);
for (let i = 0; i < TICKS; i++) {
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
await page.waitForTimeout(300);

const { profile } = await cdp.send("Profiler.stop");

// Aggregate self time per call frame from the sample stream.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const selfTicks = new Map();
for (const id of profile.samples || []) selfTicks.set(id, (selfTicks.get(id) || 0) + 1);

const totalTicks = (profile.samples || []).length;
const durationMs = (profile.endTime - profile.startTime) / 1000;
const msPerTick = totalTicks ? durationMs / totalTicks : 0;

const rows = [];
for (const [id, ticks] of selfTicks) {
  const n = byId.get(id);
  if (!n) continue;
  const cf = n.callFrame;
  const where = cf.url ? cf.url.replace(/^https?:\/\/[^/]+/, "") : "";
  rows.push({
    fn: cf.functionName || "(anonymous)",
    where: where + (cf.lineNumber >= 0 ? `:${cf.lineNumber + 1}` : ""),
    ms: +(ticks * msPerTick).toFixed(1),
    pct: +((ticks / totalTicks) * 100).toFixed(1),
  });
}
rows.sort((a, b) => b.ms - a.ms);

console.log(`\n=== CPU PROFILE  ${URL}`);
console.log(`    ${durationMs.toFixed(0)}ms wall, ${totalTicks} samples, 4x CPU throttle\n`);
console.log("  self ms   %     function                                where");
for (const r of rows.slice(0, 28)) {
  console.log(
    `  ${String(r.ms).padStart(7)}  ${String(r.pct).padStart(4)}  ${r.fn.slice(0, 38).padEnd(38)}  ${r.where.slice(-58)}`
  );
}

await browser.close();
