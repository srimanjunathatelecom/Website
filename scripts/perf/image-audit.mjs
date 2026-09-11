/**
 * Reports, for every <img> on a page, how big the file the browser downloaded
 * is compared with the box it is actually painted into.
 *
 * This is the only way to answer "are we loading huge source images into small
 * cards" with a number instead of an opinion. It also flags the two things that
 * make image loading *feel* slow rather than *be* slow: too many images marked
 * high priority (they compete with each other and with the document), and
 * images with no reserved space (they shift the layout when they land).
 *
 *   node scripts/perf/image-audit.mjs <url>
 */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://127.0.0.1:3002/";
// Priority hints only matter relative to the fold, so the viewport is a real
// variable here, not a constant: 9 "priority" cards are all above the fold on
// a 1440px desktop and mostly below it on a phone.
const VIEWPORT = process.argv[3] === "mobile"
  ? { width: 390, height: 844 }
  : { width: 1440, height: 900 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

// Record the bytes actually transferred per URL, which is the number that
// matters — not the size on disk, since next/image re-encodes on the fly.
const bytes = new Map();
page.on("response", async (res) => {
  const ct = res.headers()["content-type"] || "";
  if (!ct.startsWith("image/")) return;
  try {
    const len = Number(res.headers()["content-length"] || 0);
    bytes.set(res.url(), len || (await res.body()).length);
  } catch {
    /* body already gone; ignore */
  }
});

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
// Let lazy images below the fold stay unloaded: that is the point of them.
await page.waitForTimeout(2500);

const imgs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("img")).map((img) => {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return {
      src: img.currentSrc || img.src,
      natW: img.naturalWidth,
      natH: img.naturalHeight,
      cssW: Math.round(r.width),
      cssH: Math.round(r.height),
      inViewport: r.top < innerHeight && r.bottom > 0,
      loading: img.getAttribute("loading") || "(default eager)",
      fetchPriority: img.getAttribute("fetchpriority") || "-",
      decoding: img.getAttribute("decoding") || "(default sync-ish)",
      sizes: img.getAttribute("sizes") || "-",
      hasSrcset: !!img.getAttribute("srcset"),
      // Space reserved before the file arrives is what prevents layout shift.
      // next/image `fill` images are absolutely positioned inside a parent that
      // already has a size, so the parent is what reserves the space — checking
      // the <img> alone reported every one of them as unreserved, which was a
      // false positive against a page measuring CLS 0.
      reserved:
        cs.aspectRatio !== "auto" ||
        !!img.getAttribute("height") ||
        cs.position === "absolute" ||
        img.dataset.nimg === "fill",
      // Vector sources have no "natural size" worth comparing against a box.
      isVector: /\.svg(\?|$)/i.test(img.currentSrc || img.src) ||
        (img.currentSrc || img.src).startsWith("data:image/svg"),
    };
  });
});

const dpr = 1;
let totalBytes = 0;
let wastedBytes = 0;
const rows = [];

for (const i of imgs) {
  const b = bytes.get(i.src) || 0;
  totalBytes += b;
  // A source is "oversized" when its pixel width exceeds what the layout can
  // display at this device pixel ratio. 1.5x tolerance for DPR headroom.
  const ratio = i.cssW > 0 ? i.natW / (i.cssW * dpr) : 0;
  // An SVG scales for free, so "source bigger than box" costs nothing.
  const oversized = ratio > 1.5 && i.cssW > 0 && !i.isVector;
  if (oversized && b) wastedBytes += b * (1 - 1 / Math.max(ratio, 1));
  rows.push({ ...i, b, ratio, oversized });
}

const kb = (n) => (n / 1024).toFixed(0) + "kB";
const eager = rows.filter((r) => r.loading === "(default eager)" || r.fetchPriority === "high");
const offscreenEager = eager.filter((r) => !r.inViewport);
const noReserve = rows.filter((r) => !r.reserved && r.cssW > 0);

console.log(`\n=== IMAGE AUDIT  ${URL}   viewport ${VIEWPORT.width}x${VIEWPORT.height}`);
console.log(`    ${rows.length} <img> elements, ${kb(totalBytes)} of image bytes transferred`);
console.log(`    eager/high-priority: ${eager.length}  (of which OFFSCREEN: ${offscreenEager.length})`);
console.log(`    no reserved space:   ${noReserve.length}`);
console.log(`    est. bytes wasted on oversized sources: ${kb(wastedBytes)}\n`);

const worst = rows.filter((r) => r.oversized).sort((a, b) => b.b - a.b).slice(0, 12);
if (worst.length) {
  console.log("  OVERSIZED (source pixels >1.5x the painted box):");
  console.log("   nat px      painted    over    bytes   src");
  for (const r of worst) {
    console.log(
      `   ${String(r.natW + "x" + r.natH).padEnd(11)} ${String(r.cssW + "x" + r.cssH).padEnd(10)} ` +
        `${r.ratio.toFixed(1)}x  ${kb(r.b).padStart(7)}   ${r.src.replace(/^https?:\/\/[^/]+/, "").slice(0, 62)}`
    );
  }
}

if (offscreenEager.length) {
  console.log("\n  EAGER BUT OFFSCREEN (competing with images the visitor can see):");
  for (const r of offscreenEager.slice(0, 12)) {
    console.log(
      `   prio=${r.fetchPriority.padEnd(5)} loading=${r.loading.padEnd(15)} ${kb(r.b).padStart(7)}  ` +
        r.src.replace(/^https?:\/\/[^/]+/, "").slice(0, 58)
    );
  }
}

const syncDecode = rows.filter((r) => r.decoding === "(default sync-ish)").length;
console.log(`\n  without decoding="async": ${syncDecode}/${rows.length}`);

await browser.close();
