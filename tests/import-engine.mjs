/**
 * Unit tests for the import engine (src/lib/importing) — the pure logic that
 * decides what an uploaded stock/product sheet is allowed to do.
 *
 * Every case here is a real way a spreadsheet import can silently destroy an
 * inventory: doubling stock by re-importing, updating the Black variant when
 * the sheet said Blue, wiping fields the sheet never mentioned, applying a
 * ₹74,999 → ₹7,499 typo. The engine is pure (no DB), so these run in
 * milliseconds with no server.
 *
 * Usage:  node tests/import-engine.mjs
 * (compiles src/lib/importing to tests/.build with tsc on first run)
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const buildDir = join(here, ".build");

rmSync(buildDir, { recursive: true, force: true });
execSync(
  `npx tsc src/lib/importing/parse.ts src/lib/importing/mapping.ts src/lib/importing/engine.ts ` +
    `--outDir tests/.build --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node --declaration false --noEmit false`,
  { cwd: root, stdio: "inherit" }
);

const require = createRequire(import.meta.url);
const { parseCsv, detectHeaderRow } = require(join(buildDir, "parse.js"));
const { autoMap, headerSignature, looksLikeKnownHeader } = require(join(buildDir, "mapping.js"));
const { planImport, parseMoney, parseQty } = require(join(buildDir, "engine.js"));

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ---------- fixture catalogue ----------
const catalog = {
  categories: [
    { id: 1, name: "Smartphones" },
    { id: 2, name: "Accessories" },
  ],
  products: [
    {
      id: 10, name: "Samsung Galaxy S25", brand: "Samsung", categoryId: 1,
      sku: "SGS25", barcode: "890111", mrp: 89999, mop: 74999, stock: 12,
      status: "active", stockUpdatedAt: new Date("2026-08-20T10:00:00Z"),
      variants: [
        { id: 101, productId: 10, sku: "SGS25-BLU-256", barcode: "", color: "Blue", ram: "8GB", storage: "256GB", mrp: 89999, mop: 74999, stock: 7, stockUpdatedAt: new Date("2026-08-20T10:00:00Z") },
        { id: 102, productId: 10, sku: "SGS25-BLK-256", barcode: "", color: "Black", ram: "8GB", storage: "256GB", mrp: 89999, mop: 74999, stock: 5, stockUpdatedAt: null },
      ],
    },
    {
      id: 20, name: "boAt Airdopes 141", brand: "boAt", categoryId: 2,
      sku: "BOAT141", barcode: "890222", mrp: 4490, mop: 1299, stock: 40,
      status: "active", stockUpdatedAt: null, variants: [],
    },
    {
      id: 30, name: "Redmi Note 13", brand: "Xiaomi", categoryId: 1,
      sku: "", barcode: "", mrp: 19999, mop: 16999, stock: 3,
      status: "active", stockUpdatedAt: null, variants: [],
    },
  ],
};

function grid(csv) { return parseCsv(csv); }
function plan(csv, mode, opts = {}) {
  const g = grid(csv);
  const header = detectHeaderRow(g, looksLikeKnownHeader);
  const mapping = autoMap(g[header]);
  return planImport(g, header, mapping, mode, catalog, opts);
}

// ---------- CSV parsing ----------
console.log("\nCSV parsing");
{
  const g = parseCsv('SKU,Name,Stock\nBOAT141,"boAt Airdopes 141, TWS",25\n');
  check("quoted comma stays inside one cell", g[1][1] === "boAt Airdopes 141, TWS", JSON.stringify(g[1]));
  const g2 = parseCsv('a,b\n"he said ""hi""",2');
  check("doubled quotes unescape", g2[1][0] === 'he said "hi"');
  const g3 = parseCsv("\ufeffSKU,Stock\nX,1");
  check("BOM stripped from first header", g3[0][0] === "SKU");
}

// ---------- mapping ----------
console.log("\nColumn mapping");
{
  const m = autoMap(["Product ID", "Item Code", "Qty", "Selling Price", "Colour", "MRP (incl GST)"]);
  const fields = Object.values(m);
  check("ID/SKU/stock/mop/color/mrp recognised", ["id", "sku", "stock", "mop", "color", "mrp"].every((f) => fields.includes(f)), JSON.stringify(m));
  check("header signature is stable across case", headerSignature(["Qty ", "SKU"]) === headerSignature(["qty", "sku"]));
  const g = grid("SMS Stores stock sheet\n\nSKU,Qty\nBOAT141,5");
  check("header row detected past title line", detectHeaderRow(g, looksLikeKnownHeader) === 1);
}

// ---------- value parsing ----------
console.log("\nValue parsing");
check("₹89,999 parses", parseMoney("₹89,999") === 89999);
check("empty means not provided", parseMoney("") === null && parseQty("") === null);
check("junk is NaN, not 0", Number.isNaN(parseMoney("abc")) && Number.isNaN(parseQty("1.5")));

// ---------- stock modes ----------
console.log("\nStock modes");
{
  const r = plan("SKU,Stock\nBOAT141,15", "snapshot").rows[0];
  check("snapshot: set 15 (was 40)", r.action === "update" && r.stock.next === 15 && r.stock.current === 40, JSON.stringify(r.stock));
  const r2 = plan("SKU,Stock\nBOAT141,10", "receipt").rows[0];
  check("receipt: 40 + 10 = 50", r2.stock.next === 50);
  const r3 = plan("SKU,Stock\nBOAT141,-2", "adjust").rows[0];
  check("adjust: 40 - 2 = 38", r3.stock.next === 38);
  const r4 = plan("SKU,Stock\nBOAT141,-100", "adjust").rows[0];
  check("adjust below zero rejected", r4.action === "error" && /below zero/.test(r4.error));
  const r5 = plan("SKU,Stock\nBOAT141,-5", "receipt").rows[0];
  check("negative receipt rejected", r5.action === "error");
  const r6 = plan("SKU,Stock\nBOAT141,-5", "snapshot").rows[0];
  check("negative snapshot rejected", r6.action === "error");
}

// ---------- duplicate rows in one file ----------
console.log("\nDuplicate rows");
{
  const rs = plan("SKU,Stock\nBOAT141,10\nBOAT141,10", "receipt").rows;
  check("second row for same item rejected (no double add)", rs[0].action === "update" && rs[1].action === "error" && /row 2/.test(rs[1].error), rs[1].error);
}

// ---------- variant isolation ----------
console.log("\nVariant safety");
{
  const r = plan("SKU,Colour,Storage,Stock\nSGS25,Blue,256GB,9", "snapshot").rows[0];
  check("Blue 256GB matches variant 101 only", r.variantId === 101 && r.stock.next === 9, JSON.stringify(r));
  const r2 = plan("SKU,Colour,Storage,Stock\nSGS25,Red,256GB,9", "snapshot").rows[0];
  check("unknown colour is an error, not a guess", r2.action === "error" && /no Red/i.test(r2.error), r2.error);
  const r3 = plan("Variant SKU,Stock\nSGS25-BLK-256,11", "snapshot").rows[0];
  check("variant SKU matches Black directly", r3.variantId === 102 && r3.stock.next === 11);
  const r4 = plan("SKU,Stock\nSGS25,99", "snapshot").rows[0];
  check("product-level stock on a variant product is blocked", r4.action === "error" && /variants/.test(r4.error), r4.error);
}

// ---------- identity & name matching ----------
console.log("\nMatching");
{
  const r = plan("ID,Stock\n10,extra", "snapshot").rows[0];
  check("bad stock value on valid ID errors", r.action === "error");
  const r2 = plan("SKU,Stock\nNOSUCH,5", "snapshot").rows[0];
  check("unknown SKU is an error, never a create", r2.action === "error" && /No product found/.test(r2.error));
  const r3 = plan("Name,MRP,Selling Price\nboat airdopes 141,4490,1199", "product").rows[0];
  check("name-only match is a conflict suggestion, not an update", r3.action === "conflict" && /already exists/.test(r3.warnings[0]), JSON.stringify(r3));
  const r4 = plan("Name,MRP,Selling Price,Stock\nboat airdopes 141,4490,1199,40", "product", { allowNameMatch: true }).rows[0];
  check("allowNameMatch applies it with a warning", r4.action === "update" && r4.warnings.some((w) => /name only/.test(w)));
  const r5 = plan("Variant SKU,ID,Stock\nSGS25-BLU-256,20,5", "snapshot").rows[0];
  check("mixed identities (ID vs variant SKU) rejected", r5.action === "error" && /mixes identities/.test(r5.error));
}

// ---------- price safety ----------
console.log("\nPrice safety");
{
  const r = plan("SKU,MRP,Selling Price\nBOAT141,4490,4999", "price").rows[0];
  check("selling > MRP rejected", r.action === "error" && /higher than MRP/.test(r.error));
  const r2 = plan("SKU,Selling Price\nBOAT141,129", "price").rows[0];
  check("90% price drop warns", r2.action === "update" && r2.warnings.some((w) => /90%/.test(w)), JSON.stringify(r2.warnings));
  const r3 = plan("SKU,Selling Price\nBOAT141,-5", "price").rows[0];
  check("negative price rejected", r3.action === "error");
  const r4 = plan("SKU,Selling Price,Stock\nBOAT141,1199,999", "price").rows[0];
  check("price mode never touches stock", r4.changes.every((c) => c.field !== "stock"), JSON.stringify(r4.changes));
}

// ---------- partial update safety ----------
console.log("\nPartial update safety");
{
  const r = plan("SKU,Selling Price\nBOAT141,1199", "product").rows[0];
  const touched = r.changes.map((c) => c.field);
  check("only selling price in changes; name/brand/images untouched", touched.length === 1 && touched[0] === "mop", JSON.stringify(touched));
  const r2 = plan("SKU,Stock\nBOAT141,40", "snapshot").rows[0];
  check("same stock = skip (no-op import changes nothing)", r2.action === "skip");
}

// ---------- reconcile ----------
console.log("\nReconcile");
{
  const res = plan("SKU,Stock\nBOAT141,40", "reconcile");
  const names = res.summary.missing.map((m) => m.name);
  check("missing list includes both S25 variants and Redmi, never deletes", res.summary.missing.length === 3 && names.some((n) => /Redmi/.test(n)), JSON.stringify(names));
}

// ---------- stale sheet ----------
console.log("\nStale detection");
{
  const res = plan("Variant SKU,Stock,Exported At\nSGS25-BLU-256,7,2026-08-19T00:00:00Z", "snapshot", { exportedAt: new Date("2026-08-19T00:00:00Z") });
  check("sheet older than last stock change warns", res.summary.staleRows === 1, JSON.stringify(res.rows[0].warnings));
}

// ---------- summary arithmetic ----------
console.log("\nSummary");
{
  const res = plan("SKU,Stock\nBOAT141,45\nSGS25-BLU-256,8", "snapshot");
  check("stock before/after totals", res.summary.stockBefore === 47 && res.summary.stockAfter === 53, JSON.stringify(res.summary));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
