/**
 * Unit tests for the catalogue health classifier (src/lib/catalogue/classify)
 * — the pure logic that decides what is wrong with a product, how good an
 * image candidate match is, and which SKU a bulk-uploaded file belongs to.
 *
 * Every case here guards a safety rule from the automation spec: a good
 * image must classify as OK (so it is KEPT), a placeholder must be caught, a
 * case/cover accessory must never match the phone itself, a wrong-colour
 * candidate must be capped below auto-approve, and generated text must only
 * ever be derived from real stored fields.
 *
 * Usage:  node tests/catalogue-classify.mjs
 * (compiles src/lib/catalogue/classify.ts to tests/.build with tsc)
 */

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const buildDir = join(here, ".build");

rmSync(buildDir, { recursive: true, force: true });
execSync(
  `npx tsc src/lib/catalogue/classify.ts ` +
    `--outDir tests/.build --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node --declaration false --noEmit false`,
  { cwd: root, stdio: "inherit" }
);

const require = createRequire(import.meta.url);
const {
  classifyImageRef, productImageStatus, scoreProduct, missingFields,
  findDuplicateGroups, matchTokens, scoreImageCandidate,
  buildAltText, buildSeoTitle, buildSpecifications, buildDescription,
  publishBlockers, mapFilenamesToSkus,
} = require(join(buildDir, "classify.js"));

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const product = (over = {}) => ({
  id: 1, name: "Galaxy S25", brand: "Samsung", sku: "SAM-S25", barcode: "",
  categoryId: 2, subcategory: "", description: "", specifications: "",
  warranty: "1 year", seoTitle: "", metaDescription: "",
  mrp: 80000, mop: 74999, stock: 5, status: "active", imageSource: "",
  images: [], variants: [], ...over,
});
const img = (over = {}) => ({ id: 10, dataUrl: "https://cdn.example.com/a.webp", alt: "", sortOrder: 0, variantColor: "", mediaType: "image", ...over });

console.log("\nimage reference classification");
{
  check("SVG data URL is a placeholder", classifyImageRef("data:image/svg+xml;base64,PHN2Zz4=") === "placeholder");
  check("tiny raster data URL is a placeholder", classifyImageRef(`data:image/png;base64,${"A".repeat(500)}`) === "placeholder");
  check("large raster data URL is OK", classifyImageRef(`data:image/webp;base64,${"A".repeat(60000)}`) === "ok");
  check("placeholder-named URL caught", classifyImageRef("https://x.com/img/placeholder-phone.png") === "placeholder");
  check("normal https URL needs a network check", classifyImageRef("https://cdn.brand.com/real.jpg") === "needs_check");
  check("empty ref counts as missing", classifyImageRef("") === "missing");
  check("garbage ref is suspect", classifyImageRef("not-a-url-at-all") === "suspect_broken");
}

console.log("\nproduct image status (KEEP-good-images rule)");
{
  const good = product({ images: [img({ dataUrl: `data:image/webp;base64,${"A".repeat(60000)}` })] });
  check("real image → ok (never replaced)", productImageStatus(good).status === "ok");
  const placeholderOnly = product({ images: [img({ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" })] });
  const st = productImageStatus(placeholderOnly);
  check("placeholder-only gallery → placeholder", st.status === "placeholder");
  check("placeholder ids reported for safe replacement", st.badImageIds.length === 1 && st.badImageIds[0] === 10);
  check("no images → missing", productImageStatus(product()).status === "missing");
  const mixed = product({ images: [img({ dataUrl: `data:image/webp;base64,${"A".repeat(60000)}` }), img({ id: 11, dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" })] });
  check("one real image among placeholders → NOT treated as imageless", productImageStatus(mixed).status !== "placeholder" && productImageStatus(mixed).status !== "missing");
}

console.log("\nquality score & classification");
{
  const bare = product({ mop: 0, images: [] });
  check("bare product scores low", scoreProduct(bare).score < 50, `got ${scoreProduct(bare).score}`);
  const full = product({
    description: "A phone with a big screen and a long battery life for daily use.",
    specifications: "Display: 6.2\nBattery: 4000mAh",
    seoTitle: "Samsung Galaxy S25", metaDescription: "Buy the Galaxy S25.",
    images: [img({ dataUrl: `data:image/webp;base64,${"A".repeat(60000)}`, alt: "Samsung Galaxy S25" })],
  });
  const q = scoreProduct(full);
  check("complete product scores high", q.score >= 90, `got ${q.score}`);
  check("complete product classified complete", q.classification === "complete", q.classification);
  check("missing price is critical missing data", missingFields(product({ mop: 0 })).join(",").includes("price"));
  check("broken image flag downgrades", scoreProduct(full, { imageBroken: true }).classification !== "complete");
}

console.log("\nduplicate detection");
{
  const items = [
    product({ id: 1, name: "Galaxy S25 5G", sku: "A1" }),
    product({ id: 2, name: "galaxy  s25 5g", sku: "A2" }),
    product({ id: 3, name: "Pixel 9", sku: "A1" }),
  ];
  const groups = findDuplicateGroups(items);
  check("same normalized name grouped", groups.some((g) => g.reason === "name" && g.ids.includes(1) && g.ids.includes(2)));
  check("same SKU grouped", groups.some((g) => g.reason === "sku" && g.ids.includes(1) && g.ids.includes(3)));
}

console.log("\nimage candidate scoring (§8/§16 matching rules)");
{
  const p = product();
  const v = { id: 5, color: "Blue", storage: "256GB", ram: "8GB", mrp: 0, mop: 0, stock: 1, sku: "S25-BLU-256", image: "", available: true };
  const t = matchTokens(p, v);
  const official = { url: "https://images.samsung.com/galaxy-s25-blue-256gb.jpg", sourceUrl: "https://www.samsung.com/in/smartphones/galaxy-s25/", title: "Galaxy S25 256GB Blue", sourceDomain: "samsung.com", officialDomain: true, width: 1200, height: 1200 };
  const officialScore = scoreImageCandidate(official, t);
  check("official exact match scores at auto-approve level", officialScore >= 90, `got ${officialScore}`);

  const accessory = { ...official, title: "Case for Galaxy S25 Blue - silicone cover", url: "https://images.samsung.com/case-s25.jpg" };
  check("accessory (case/cover) heavily penalized", scoreImageCandidate(accessory, t) <= officialScore - 40, `got ${scoreImageCandidate(accessory, t)}`);

  const wrongColor = { ...official, title: "Galaxy S25 256GB Black", url: "https://images.samsung.com/galaxy-s25-black.jpg", sourceUrl: "https://www.samsung.com/in/galaxy-s25-black/" };
  check("wrong colour capped below auto-approve", scoreImageCandidate(wrongColor, t) < 90, `got ${scoreImageCandidate(wrongColor, t)}`);

  const random = { ...official, sourceDomain: "randomshop.biz", officialDomain: false };
  check("non-official source capped below auto-approve", scoreImageCandidate(random, t) < 90, `got ${scoreImageCandidate(random, t)}`);

  const wrongModel = { ...official, title: "Galaxy A16 kids tablet", url: "https://images.samsung.com/galaxy-a16.jpg", sourceUrl: "https://www.samsung.com/in/galaxy-a16/" };
  check("different model scores as unusable", scoreImageCandidate(wrongModel, t) <= 50, `got ${scoreImageCandidate(wrongModel, t)}`);
}

console.log("\ngenerated text uses only real fields (§24 no-invention rule)");
{
  const p = product({ variants: [{ id: 5, color: "Blue", storage: "256GB", ram: "8GB", mrp: 0, mop: 0, stock: 1, sku: "", image: "", available: true }] });
  const alt = buildAltText(p);
  check("alt text = brand + name, nothing invented", alt.includes("Samsung") && alt.includes("Galaxy S25"));
  const specs = buildSpecifications(p);
  check("specs built only from stored variant fields", specs.includes("8GB") && specs.includes("256GB") && !/camera|battery|display/i.test(specs), specs);
  const desc = buildDescription(p, "Smartphones");
  check("description never invents numbers", !/\d+ ?mah|\d+ ?mp|amoled/i.test(desc), desc);
  check("seo title from real fields", buildSeoTitle(p, "Smartphones").includes("Galaxy S25"));
  const noFacts = product({ specifications: "", brand: "", warranty: "", variants: [] });
  check("no known facts → empty specs (queued for review, not invented)", buildSpecifications(noFacts).trim() === "");
}

console.log("\npublish guard (§23)");
{
  const required = ["name", "categoryId", "mop", "image"];
  check("missing image blocks publishing", publishBlockers(product(), required).length > 0);
  const ok = product({ images: [img({ dataUrl: `data:image/webp;base64,${"A".repeat(60000)}` })] });
  check("complete product publishable", publishBlockers(ok, required).length === 0);
  check("zero price blocks publishing", publishBlockers(product({ mop: 0, images: [img({ dataUrl: `data:image/webp;base64,${"A".repeat(60000)}` })] }), required).length > 0);
}

console.log("\nbulk file → SKU mapping (§11)");
{
  const items = [
    { id: 1, name: "Galaxy S25", sku: "SAM-S25", variants: [{ id: 5, sku: "S25-BLU-256", color: "Blue", storage: "256GB", ram: "" }] },
    { id: 2, name: "Redmi Note 14 Pro", sku: "RED-N14P", variants: [] },
  ];
  const m = mapFilenamesToSkus(["S25-BLU-256-01.jpg", "s25_blu_256-02.png", "RED-N14P.webp", "IMG_4021.jpg", "redmi note 14 pro.jpg"], items);
  check("variant SKU with -01 index → variant match at 98", m[0].variantId === 5 && m[0].confidence === 98);
  check("case/separator-insensitive variant match", m[1].variantId === 5);
  check("product SKU match at 95", m[2].productId === 2 && m[2].confidence === 95);
  check("random camera filename → no match (never guessed)", m[3].productId === null);
  check("name match is low-confidence suggestion only", m[4].productId === 2 && m[4].confidence < 90);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
