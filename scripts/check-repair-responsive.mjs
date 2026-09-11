#!/usr/bin/env node
/**
 * Dev-only responsive check for the repair flow. Not part of `npm test`.
 *
 * Walks all three steps at every width in the brief and asserts what the design
 * actually promises: how many columns win, that no row is ragged, that nothing
 * overflows sideways, and that no card is too small to tap. Column counts are
 * read off computed geometry rather than class names, because a class only says
 * what was intended.
 *
 * Needs a running server and a seeded database:
 *   BASE=http://127.0.0.1:3000 node scripts/check-repair-responsive.mjs
 */
import { chromium } from "playwright";

const base = process.env.BASE || "http://127.0.0.1:3000";

/** Ranges come from the brief; `expect` is what this build actually targets. */
const WIDTHS = [
  { w: 1440, band: "desktop" },
  { w: 1280, band: "desktop" },
  { w: 1024, band: "tablet" },
  { w: 768, band: "tablet" },
  { w: 480, band: "mobile" },
  { w: 375, band: "mobile" },
];

const STEPS = [
  {
    name: "Brands",
    path: "/repair",
    grid: "main ul",
    // Brief: 7-9 desktop, 4-6 tablet, 2-3 mobile.
    expect: { 1440: 9, 1280: 9, 1024: 6, 768: 5, 480: 3, 375: 2 },
    allowed: { desktop: [7, 9], tablet: [4, 6], mobile: [2, 3] },
  },
  {
    name: "Models",
    path: "/repair/samsung",
    grid: "main ul",
    // Brief: 6-7 desktop, 3-5 tablet, 2 mobile.
    expect: { 1440: 7, 1280: 7, 1024: 5, 768: 4, 480: 2, 375: 2 },
    allowed: { desktop: [6, 7], tablet: [3, 5], mobile: [2, 2] },
  },
  {
    name: "Services",
    path: "/repair/samsung/galaxy-s23",
    grid: "ul[aria-label='All repairs']",
    // Brief: 3 desktop, 2 tablet, 1-2 mobile.
    expect: { 1440: 3, 1280: 3, 1024: 2, 768: 2, 480: 1, 375: 1 },
    allowed: { desktop: [3, 3], tablet: [2, 2], mobile: [1, 2] },
  },
];

const browser = await chromium.launch();
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

for (const step of STEPS) {
  console.log(`\n── ${step.name}  ${step.path}`);

  for (const { w, band } of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(base + step.path, { waitUntil: "domcontentloaded" });
    await page.locator(`${step.grid} li`).first().waitFor();
    // Let fonts and images settle, or heights are measured mid-load.
    await page.waitForTimeout(600);

    const m = await page.evaluate((sel) => {
      const ul = document.querySelector(sel);
      const cards = [...ul.querySelectorAll(":scope > li")];
      const cols = getComputedStyle(ul)
        .gridTemplateColumns.split(/\s+/)
        .filter(Boolean).length;

      // Group cards into visual rows by their top edge, then look for a row
      // whose cards are not all the same height.
      const rows = new Map();
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        const key = Math.round(r.top);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(Math.round(r.height));
      }
      const ragged = [...rows.entries()]
        .filter(([, hs]) => new Set(hs).size > 1)
        .map(([top, hs]) => `row@${top}: ${[...new Set(hs)].join("/")}`);

      const widths = cards.map((c) => Math.round(c.getBoundingClientRect().width));
      const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));

      return {
        cols,
        count: cards.length,
        ragged,
        minCardWidth: Math.min(...widths),
        minCardHeight: Math.min(...heights),
        // Sideways overflow: the classic responsive failure, and invisible in a
        // screenshot taken at the same width that caused it.
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        brokenImages: [...ul.querySelectorAll("img")].filter(
          (i) => i.complete && i.naturalWidth === 0
        ).length,
      };
    }, step.grid);

    const [lo, hi] = step.allowed[band];
    const inBand = m.cols >= lo && m.cols <= hi;
    const asTargeted = m.cols === step.expect[w];

    check(
      `${String(w).padStart(4)}px  ${m.cols} cols`,
      inBand && asTargeted,
      `${band} allows ${lo}-${hi}, targeted ${step.expect[w]}`
    );
    check(`${String(w).padStart(4)}px  rows not ragged`, m.ragged.length === 0, m.ragged.join("; "));
    check(`${String(w).padStart(4)}px  no sideways overflow`, m.docOverflow <= 1, `${m.docOverflow}px`);
    // 44px is the usual floor for a comfortable touch target.
    check(
      `${String(w).padStart(4)}px  cards big enough to tap`,
      m.minCardWidth >= 44 && m.minCardHeight >= 44,
      `smallest ${m.minCardWidth}x${m.minCardHeight}`
    );
    check(`${String(w).padStart(4)}px  all images loaded`, m.brokenImages === 0, `${m.brokenImages} broken`);

    await page.close();
  }
}

await browser.close();
console.log(
  failures === 0 ? "\nAll responsive checks passed." : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
