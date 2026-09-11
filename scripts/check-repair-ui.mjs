#!/usr/bin/env node
/**
 * Dev-only behavioural check for the visual repair flow. Not part of `npm test`.
 *
 * It deliberately drives a real browser against a real build rather than
 * asserting on rendered HTML. Everything interesting about these grids only
 * exists once CSS and hydration have run: how many columns actually win at a
 * given width, whether every card in a row ends up the same height, whether
 * typing filters anything. None of that is visible to a DOM-only assertion, and
 * two of the bugs this caught during the build — colliding model slugs showing
 * up as a missing card, and four taller cards making every row they touched
 * ragged — left the markup looking perfectly correct.
 *
 * Needs a running server and a seeded database:
 *   BASE=http://127.0.0.1:3000 node scripts/check-repair-ui.mjs
 */
import { chromium } from "playwright";

const base = process.env.BASE || "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const section = (name) => console.log(`\n── ${name}`);

/**
 * Console errors, minus the ones this script causes on purpose.
 *
 * Several checks below deliberately request something that must fail — an
 * unknown brand, an unknown model, a booking while logged out — and the browser
 * logs each as a console error. Counting those would mean the suite could never
 * reach zero, so `expectFailures` brackets the deliberate ones. Anything logged
 * outside those brackets is a real defect.
 */
const errors = [];
let expectingFailures = false;
const record = (text) => !expectingFailures && errors.push(text);
page.on("console", (m) => m.type() === "error" && record(m.text()));
page.on("pageerror", (e) => record(String(e)));

async function expectFailures(fn) {
  expectingFailures = true;
  try {
    return await fn();
  } finally {
    // Errors arrive slightly after the action that caused them.
    await page.waitForTimeout(400);
    expectingFailures = false;
  }
}

/**
 * Not `networkidle`: the production build never reaches it on these pages — some
 * long-lived request keeps the connection count above zero indefinitely, so the
 * wait times out even though the page has been ready for seconds. Wait for the
 * element under test and then for hydration, which is a better signal anyway.
 */
async function open(path, firstCardSelector) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.locator(firstCardSelector).first().waitFor();
  await page.waitForTimeout(700);
}

/**
 * Columns that actually won, read off rendered geometry rather than a class.
 *
 * Takes a selector because the service page has two lists in <main> — the popular
 * rail comes first in the DOM, so an unscoped "main ul" would measure the wrong
 * one and report a flex rail as having no columns.
 */
const columnCount = (selector = "main ul") =>
  page.evaluate((sel) => {
    const ul = document.querySelector(sel);
    const cols = getComputedStyle(ul).gridTemplateColumns;
    return cols.split(/\s+/).filter(Boolean).length;
  }, selector);

/** Distinct card heights — more than one means a ragged row. */
const cardHeights = (locator) =>
  locator.evaluateAll((els) => [
    ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height))),
  ]);

/** Images that finished loading but have no pixels, i.e. a broken src. */
const brokenImages = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("main img")]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.currentSrc || i.src)
  );

// ─────────────────────────────────────────────────────────── Step 1: brands
section("Step 1 — Select Brand");
await open("/repair", "ul li a[href^='/repair/']");

const brandCards = page.locator("ul li a[href^='/repair/']");
check("brand cards render from data", (await brandCards.count()) === 20, `${await brandCards.count()} cards`);
check("9 columns at 1280px", (await columnCount()) === 9, `${await columnCount()} columns`);

const brandHeights = await cardHeights(brandCards);
check("all brand cards the same height", brandHeights.length === 1, `heights: ${brandHeights.join(", ")}`);

const brandSearch = page.getByPlaceholder("Search your brand");
await brandSearch.fill("sam");
await page.waitForTimeout(150);
check("search narrows to Samsung", (await brandCards.count()) === 1, `${await brandCards.count()} shown`);

await brandSearch.fill("  one plus  ");
await page.waitForTimeout(150);
check('search ignores case and spacing ("one plus" finds OnePlus)', (await brandCards.count()) === 1);

await brandSearch.fill("zzzz");
await page.waitForTimeout(150);
check("no-results state shown", await page.getByText(/no brands/i).isVisible());

await brandSearch.fill("");
await page.waitForTimeout(150);
check("clearing restores all brands", (await brandCards.count()) === 20);

check("first brand links to its own page", (await brandCards.first().getAttribute("href")) === "/repair/apple");
check("every brand logo loaded", (await brokenImages()).length === 0);

// ─────────────────────────────────────────────────────────── Step 2: models
section("Step 2 — Select Model");
await open("/repair/samsung", "ul li a[href^='/repair/samsung/']");

const modelCards = page.locator("ul li a[href^='/repair/samsung/']");
const modelCount = await modelCards.count();
check("model cards render from data", modelCount > 20, `${modelCount} models`);
check("7 columns at 1280px", (await columnCount()) === 7, `${await columnCount()} columns`);

const modelHeights = await cardHeights(modelCards);
check("all model cards the same height", modelHeights.length === 1, `heights: ${modelHeights.join(", ")}`);

// The bug that made this check exist: slugify() collapsed "+" so "Galaxy S23+"
// and "Galaxy S23" produced one slug and the unique index dropped one of them.
const slugs = await modelCards.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
check("no duplicate model links", new Set(slugs).size === slugs.length);
check("plain and plus models both exist", slugs.includes("/repair/samsung/galaxy-s23") && slugs.includes("/repair/samsung/galaxy-s23-plus"));

const names = await modelCards.evaluateAll((els) => els.map((e) => e.getAttribute("title")));
check("S23 and S23+ are distinct cards", names.includes("Galaxy S23") && names.includes("Galaxy S23+"));

const modelSearch = page.getByPlaceholder("Search your model");
await modelSearch.fill("s23ultra");
await page.waitForTimeout(150);
check('unspaced search finds it ("s23ultra" -> Galaxy S23 Ultra)', (await modelCards.count()) === 1, `${await modelCards.count()} shown`);

await modelSearch.fill("fold");
await page.waitForTimeout(150);
check("partial search matches several folds", (await modelCards.count()) >= 2, `${await modelCards.count()} shown`);

await modelSearch.fill("nokia 3310");
await page.waitForTimeout(150);
check("no-results state shown", await page.getByText(/no models/i).isVisible());

await modelSearch.fill("");
await page.waitForTimeout(150);
check("clearing restores all models", (await modelCards.count()) === modelCount);

const crumbs = await page.locator("nav[aria-label='Breadcrumb'] li").allInnerTexts();
check("breadcrumb reads Home / Samsung / Models", crumbs.join("/").toLowerCase().includes("samsung"), crumbs.join(" / "));

check("every model image loaded", (await brokenImages()).length === 0);

// Unknown brands must 404 rather than render an empty grid.
const missing = await expectFailures(() => page.goto(`${base}/repair/not-a-real-brand`));
check("unknown brand 404s", missing.status() === 404, `status ${missing.status()}`);

// ─────────────────────────────────────────────────────── Step 3: services
section("Step 3 — Select Service");
await open("/repair/samsung/galaxy-s23", "ul[aria-label='All repairs'] li");

// Scoped to the full grid by label: the popular rail is also a <ul> of repair
// cards inside <main>, and counting both would make every assertion here wrong.
const grid = "ul[aria-label='All repairs']";
const serviceCards = page.locator(`${grid} li`);
const serviceCount = await serviceCards.count();
check("service cards render from data", serviceCount > 10, `${serviceCount} repairs`);
check("3 columns at 1280px", (await columnCount(grid)) === 3, `${await columnCount(grid)} columns`);

// The ragged-row failure mode again: any repair the owner names long enough to
// wrap must not leave its neighbours shorter.
const serviceHeights = await cardHeights(serviceCards);
check("all service cards the same height", serviceHeights.length === 1, `heights: ${serviceHeights.join(", ")}`);

check("device summary names the chosen phone", await page.getByText("Galaxy S23", { exact: true }).first().isVisible());

const serviceCrumbs = await page.locator("nav[aria-label='Breadcrumb'] li").allInnerTexts();
check(
  "breadcrumb reads Home / Samsung / Galaxy S23 / Services",
  serviceCrumbs.length === 4 && /galaxy s23/i.test(serviceCrumbs[2]) && /services/i.test(serviceCrumbs[3]),
  serviceCrumbs.join(" / ")
);

const serviceSearch = page.getByPlaceholder("Search repairs");
await serviceSearch.fill("battery");
await page.waitForTimeout(150);
check("search narrows the repair list", (await serviceCards.count()) < serviceCount, `${await serviceCards.count()} shown`);
await serviceSearch.fill("");
await page.waitForTimeout(150);

check("every service image loaded", (await brokenImages()).length === 0);

// Selecting a repair must reveal the confirm panel without navigating away —
// losing the grid here would mean re-choosing the phone to change your mind.
const before = page.url();
await page.getByRole("button", { name: "Select Screen Replacement" }).click();
await page.waitForTimeout(400);
check("selecting a repair stays on the page", page.url() === before);
check("confirm panel appears", await page.getByRole("button", { name: /confirm booking/i }).isVisible());
check("outlet picker offered", await page.locator("#repair-outlet").isVisible());
check("fault notes offered", await page.locator("#repair-issue").isVisible());
check("chosen card marks itself selected", await page.getByRole("button", { name: "Select Screen Replacement" }).innerText() === "Selected");

// ──────────────────────────────────── Popular repairs rail
// Behaviour that only exists at runtime, so it is checked in a real browser:
// whether it moves by itself, whether it stops when a human is involved, and
// whether it still lets a card be clicked.
section("Popular Repaired Services rail");

const rail = page.locator("ul[aria-label='Popular repairs']");
const railScroll = () => rail.evaluate((e) => e.scrollLeft);
const railGeom = () =>
  rail.evaluate((e) => ({
    scrollWidth: e.scrollWidth,
    clientWidth: e.clientWidth,
    scrollbarWidth: getComputedStyle(e).scrollbarWidth,
    barHeight: e.offsetHeight - e.clientHeight,
  }));

// Reset: the grid checks above left a repair selected and the pointer parked.
await open("/repair/samsung/galaxy-s23", "ul[aria-label='Popular repairs'] li");
await page.mouse.move(5, 5);

const railCards = rail.locator("li");
const railCount = await railCards.count();
check("rail renders owner-flagged repairs", railCount > 0, `${railCount} cards`);

// The rail is a shortcut, so the full grid must still be on the page.
check(
  "rail does not replace the main grid",
  (await page.locator("main ul").count()) >= 2 && (await serviceCards.count()) > railCount
);

const rg = await railGeom();
check("scrollbar hidden", rg.scrollbarWidth === "none" && rg.barHeight === 0, `scrollbar-width: ${rg.scrollbarWidth}`);

// Everything below only means anything if the rail actually overflows. With few
// enough featured repairs to fit on screen there is nothing to advance through,
// and the component deliberately does nothing in that case.
const overflows = rg.scrollWidth > rg.clientWidth + 2;
if (!overflows) {
  console.log(`  skip  auto-advance checks — only ${railCount} featured repairs, rail does not overflow`);
} else {
  const a0 = await railScroll();
  await page.waitForTimeout(4200);
  const a1 = await railScroll();
  check("auto-advances on its own", a1 > a0, `${a0} -> ${a1}`);

  await rail.hover();
  const h0 = await railScroll();
  await page.waitForTimeout(4200);
  check("pauses while hovered", (await railScroll()) === h0, `stayed at ${h0}`);

  await page.mouse.move(5, 5);
  await page.waitForTimeout(4200);
  check("resumes once the pointer leaves", (await railScroll()) > h0);

  const n0 = await railScroll();
  await page.getByRole("button", { name: /next popular/i }).click();
  await page.waitForTimeout(800);
  check("next arrow advances the rail", (await railScroll()) > n0);

  // An arrow click is an interaction, so auto-advance must hold off afterwards.
  const i0 = await railScroll();
  await page.waitForTimeout(3400);
  check("interaction suppresses auto-advance", Math.abs((await railScroll()) - i0) <= 2, `${i0} -> ${await railScroll()}`);

  // Resume waits 6s, and only then does the 3s interval begin.
  await page.waitForTimeout(7000);
  check("auto-advance returns after the quiet period", (await railScroll()) !== i0);

  // Continuous loop. The rail sets scroll-behavior: smooth in CSS, so a
  // programmatic scroll animates too and has to be waited out — clicking
  // mid-animation reads a scrollLeft that is not yet at the end.
  await rail.evaluate((e) => e.scrollTo({ left: e.scrollWidth }));
  await page
    .waitForFunction(
      () => {
        const e = document.querySelector("ul[aria-label='Popular repairs']");
        return e.scrollLeft + e.clientWidth >= e.scrollWidth - 2;
      },
      null,
      { timeout: 4000 }
    )
    .catch(() => {});
  await page.getByRole("button", { name: /next popular/i }).click();
  await page.waitForTimeout(900);
  check("loops to the start from the end", (await railScroll()) <= 2, `scrollLeft ${await railScroll()}`);

  await page.getByRole("button", { name: /previous popular/i }).click();
  await page.waitForTimeout(1200);
  check("wraps to the end from the start", (await railScroll()) > 2, `scrollLeft ${await railScroll()}`);
}

// The whole point of a rail of repairs is that you can pick one from it.
await page.mouse.move(5, 5);
await rail.evaluate((e) => e.scrollTo({ left: 0 }));
await page.waitForTimeout(900);
const railName = await railCards.first().locator("button").getAttribute("title");
await railCards.first().locator("button").click();
await page.waitForTimeout(600);
check("clicking a rail card opens the confirm panel", await page.getByRole("button", { name: /confirm booking/i }).isVisible());
const panelName = await page.locator("form[aria-label*='Confirm'] p").first().innerText();
check("it selects the repair that was clicked", panelName.trim() === railName.trim(), `${panelName} vs ${railName}`);

// A rail that slides on its own is exactly what prefers-reduced-motion asks us
// not to do, so it must never start.
const reduced = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
await reduced.goto(`${base}/repair/samsung/galaxy-s23`, { waitUntil: "domcontentloaded" });
const reducedRail = reduced.locator("ul[aria-label='Popular repairs']");
await reducedRail.waitFor();
await reduced.mouse.move(5, 5);
await reduced.waitForTimeout(700);
const r0 = await reducedRail.evaluate((e) => e.scrollLeft);
await reduced.waitForTimeout(4500);
const r1 = await reducedRail.evaluate((e) => e.scrollLeft);
check("respects prefers-reduced-motion (never auto-advances)", r0 === r1, `${r0} -> ${r1}`);
await reduced.close();

// Back to the service page for the remaining checks.
await open("/repair/samsung/galaxy-s23", `${grid} li`);
await page.getByRole("button", { name: "Select Screen Replacement" }).click();
await page.waitForTimeout(400);

// Not logged in, so the existing endpoint's 401 must route to login and come
// back here rather than dumping the customer at /services.
await expectFailures(async () => {
  await page.getByRole("button", { name: /confirm booking/i }).click();
  await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {});
});
check(
  "unauthenticated booking redirects to login and returns here",
  page.url().includes("/login") && page.url().includes("redirect=/repair/samsung/galaxy-s23"),
  page.url()
);

const missingModel = await expectFailures(() =>
  page.goto(`${base}/repair/samsung/not-a-real-model`)
);
check("unknown model 404s", missingModel.status() === 404, `status ${missingModel.status()}`);

section("Console");
check(
  "no unexpected console errors across the flow",
  errors.length === 0,
  errors.slice(0, 3).join(" | ")
);

await browser.close();
console.log(failures === 0 ? "\nAll repair UI checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
