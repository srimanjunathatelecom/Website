/**
 * Enumerates every element on a page carrying a filter, backdrop-filter or an
 * infinite animation, with its rendered area, and groups them by the CSS class
 * responsible.
 *
 * Area matters more than count: blur cost scales with the number of pixels
 * being blurred, so one full-bleed blurred layer can outweigh forty blurred
 * badges. Sorting by total area is what turns "there are blurs on this page"
 * into a work list in priority order.
 *
 *   node scripts/perf/audit-filters.mjs <url>
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:3002/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const filters = [];
  const anims = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const area = Math.round(r.width * r.height);
    const key =
      el.tagName.toLowerCase() +
      (typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "");

    if ((cs.filter && cs.filter !== "none") || (cs.backdropFilter && cs.backdropFilter !== "none")) {
      filters.push({
        key,
        area,
        filter: cs.filter !== "none" ? cs.filter : "",
        backdrop: cs.backdropFilter !== "none" ? cs.backdropFilter : "",
      });
    }
    if (cs.animationIterationCount.split(",").some((v) => v.trim() === "infinite")) {
      anims.push({ key, area, name: cs.animationName });
    }
  }
  return { filters, anims, total: document.querySelectorAll("*").length };
});

function group(list, extra) {
  const m = new Map();
  for (const x of list) {
    const k = extra(x);
    const cur = m.get(k) || { n: 0, area: 0 };
    cur.n++;
    cur.area += x.area;
    m.set(k, cur);
  }
  return [...m.entries()].sort((a, b) => b[1].area - a[1].area);
}

console.log(`\n=== ${URL}  (${report.total} elements)`);

console.log(`\n--- FILTERS / BACKDROP-FILTERS (${report.filters.length} elements) ---`);
console.log("  count    total px area   effect");
for (const [k, v] of group(report.filters, (x) => `${x.filter}${x.backdrop ? " backdrop:" + x.backdrop : ""}`)) {
  console.log(`  ${String(v.n).padStart(5)}  ${v.area.toLocaleString().padStart(15)}   ${k}`);
}
console.log("\n  largest individual blurred elements:");
for (const f of report.filters.sort((a, b) => b.area - a.area).slice(0, 12)) {
  console.log(
    `   ${f.area.toLocaleString().padStart(12)} px  ${(f.filter || "backdrop " + f.backdrop).padEnd(22)} ${f.key.slice(0, 60)}`
  );
}

console.log(`\n--- INFINITE ANIMATIONS (${report.anims.length} elements) ---`);
console.log("  count    total px area   animation");
for (const [k, v] of group(report.anims, (x) => x.name)) {
  console.log(`  ${String(v.n).padStart(5)}  ${v.area.toLocaleString().padStart(15)}   ${k}`);
}

await browser.close();
