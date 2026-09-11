/**
 * Counts the DOM work a single interaction causes.
 *
 * INP on this app turned out to be too noisy to steer by: the same build
 * measured anywhere from 88ms to 208ms for the same keystroke, because handler
 * time is only 1-3ms and everything else is paint scheduling. DOM mutation
 * count is the stable proxy. If one keystroke in a search box mutates hundreds
 * of nodes, React is re-rendering far more than the field, and that is
 * "unnecessary component renders" in a form that can be proven rather than
 * inferred from a noisy timing number.
 *
 *   node scripts/perf/render-scope.mjs <base>
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:3002";

const OBSERVE = () => {
  window.__mut = { added: 0, removed: 0, attrs: 0, text: 0, records: 0, topTags: {} };
  const o = new MutationObserver((recs) => {
    for (const r of recs) {
      window.__mut.records++;
      window.__mut.added += r.addedNodes.length;
      window.__mut.removed += r.removedNodes.length;
      if (r.type === "attributes") {
        window.__mut.attrs++;
        const t = r.target.tagName;
        if (t) window.__mut.topTags[t] = (window.__mut.topTags[t] || 0) + 1;
      }
      if (r.type === "characterData") window.__mut.text++;
    }
  });
  o.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const reset = () => page.evaluate(() => {
  window.__mut = { added: 0, removed: 0, attrs: 0, text: 0, records: 0, topTags: {} };
});
const read = () => page.evaluate(() => ({
  ...window.__mut,
  topTags: Object.entries(window.__mut.topTags).sort((a, b) => b[1] - a[1]).slice(0, 4),
}));

const scenarios = [
  {
    name: "header search: keystroke -> settled dropdown (6 real results)",
    url: "/",
    run: async () => {
      const s = page.locator('header input[type="search"]').first();
      await s.click();
      await s.fill("galax");
      await s.press("y");
      await page.waitForTimeout(1400); // past the 180ms debounce, fetch resolved, rows painted
    },
  },
  {
    name: "header search: 5 keystrokes typed in a burst",
    url: "/",
    run: async () => {
      const s = page.locator('header input[type="search"]').first();
      await s.click();
      for (const ch of "galax") {
        await s.press(ch);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(1400);
    },
  },
  {
    name: "header search: one keystroke (network-backed)",
    url: "/",
    run: async () => {
      const s = page.locator('header input[type="search"]').first();
      await s.click();
      await s.press("p");
      await page.waitForTimeout(120); // before the debounced fetch resolves
    },
  },
  {
    name: "model search: one keystroke (local filter, 34 models)",
    url: "/repair/samsung",
    run: async () => {
      const s = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
      await s.click();
      await s.press("g");
      await page.waitForTimeout(120);
    },
  },
];

console.log(`\n=== RENDER SCOPE  ${BASE}  (DOM mutations per interaction, 4x CPU)\n`);

for (const sc of scenarios) {
  await page.goto(BASE + sc.url, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1800); // hydration + idle work settles
  await page.addScriptTag({ content: `(${OBSERVE.toString()})()` });
  await reset();
  await sc.run();
  const m = await read();
  console.log(`  ${sc.name}`);
  console.log(
    `      ${m.records} mutation records: +${m.added} nodes, -${m.removed} nodes, ` +
      `${m.attrs} attribute, ${m.text} text`
  );
  if (m.topTags.length) {
    console.log(`      attribute churn by tag: ${m.topTags.map(([t, c]) => `${t}=${c}`).join("  ")}`);
  }
  console.log("");
}

await browser.close();
