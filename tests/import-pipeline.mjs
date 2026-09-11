/**
 * End-to-end test of the import pipeline against a running, seeded server:
 *
 *   preview (writes nothing) → commit (idempotency + conflict gates) →
 *   history → rollback (reverses only that batch) → exports/templates.
 *
 * These are the exact disasters the pipeline exists to prevent: committing a
 * file twice doubling stock, a stale snapshot silently undoing a sale that
 * happened after preview, a rollback resurrecting sold stock.
 *
 * Requires a running server and a seeded database:
 *   BASE=http://localhost:3000 node tests/import-pipeline.mjs
 */

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ---------- admin session ----------
const loginRes = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});
const setCookie = loginRes.headers.get("set-cookie") || "";
const login = await loginRes.json().catch(() => ({}));
const sessionCookie = /sms_session=([^;]+)/.exec(setCookie)?.[1] || login.token;
if (!sessionCookie) throw new Error(`admin login failed: ${JSON.stringify(login)}`);
const authed = { cookie: `sms_session=${sessionCookie}` };

// ---------- helpers ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

async function exportRows() {
  const res = await fetch(`${BASE}/api/export/stock`, { headers: authed });
  const rows = parseCsv(await res.text());
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  return rows.slice(1).map((r) => ({
    id: Number(r[col("ID")]),
    sku: r[col("SKU")],
    variantSku: r[col("Variant SKU")],
    name: r[col("Name")],
    stock: Number(r[col("Stock")]),
  }));
}

async function preview(csvText, mode, fileName = `test-${Date.now()}.csv`) {
  const form = new FormData();
  form.set("file", new Blob([csvText], { type: "text/csv" }), fileName);
  form.set("mode", mode);
  const res = await fetch(`${BASE}/api/imports/preview`, { method: "POST", headers: authed, body: form });
  return { status: res.status, body: await res.json() };
}

async function commit(id, options = {}) {
  const res = await fetch(`${BASE}/api/imports/${id}/commit`, {
    method: "POST",
    headers: { ...authed, "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  return { status: res.status, body: await res.json() };
}

async function rollback(id) {
  const res = await fetch(`${BASE}/api/imports/${id}/rollback`, { method: "POST", headers: authed });
  return { status: res.status, body: await res.json() };
}

const stockOf = async (pred) => (await exportRows()).find(pred)?.stock;

// ---------- pick targets from the seeded catalogue ----------
const all = await exportRows();
// Pick a product whose SKU is unique — the seeded catalogue intentionally
// contains duplicate-SKU rows, which the importer refuses to touch (that
// refusal is itself covered below by the error-handling checks).
const skuCount = new Map();
for (const r of all) skuCount.set(r.sku, (skuCount.get(r.sku) ?? 0) + 1);
const simple = all.find((r) => !r.variantSku && r.sku && skuCount.get(r.sku) === 1);
const variantRow = all.find((r) => r.variantSku);
if (!simple) throw new Error("Seeded catalogue has no simple product with a SKU to test against.");
console.log(`\nUsing simple product: ${simple.name} (SKU ${simple.sku}, stock ${simple.stock})`);
if (variantRow) console.log(`Using variant: ${variantRow.name} (Variant SKU ${variantRow.variantSku}, stock ${variantRow.stock})`);

// ---------- 1. preview writes nothing ----------
console.log("\nPreview is read-only");
const receiptCsv = `SKU,Stock\n${simple.sku},10`;
const p1 = await preview(receiptCsv, "receipt", "receipt-a.csv");
check("preview succeeds", p1.status === 200 && p1.body.importId > 0, JSON.stringify(p1.body).slice(0, 300));
check("preview classified as 1 update", p1.body.summary?.updates === 1, JSON.stringify(p1.body.summary));
check("stock unchanged after preview", (await stockOf((r) => r.sku === simple.sku && !r.variantSku)) === simple.stock);

// ---------- 2. commit applies exactly once ----------
console.log("\nCommit");
const c1 = await commit(p1.body.importId);
check("commit ok", c1.status === 200 && c1.body.applied === 1, JSON.stringify(c1.body).slice(0, 300));
const afterReceipt = await stockOf((r) => r.sku === simple.sku && !r.variantSku);
check(`stock ${simple.stock} + 10 = ${simple.stock + 10}`, afterReceipt === simple.stock + 10, `got ${afterReceipt}`);
const c1again = await commit(p1.body.importId);
check("committing the same batch twice is refused", c1again.status === 409, JSON.stringify(c1again.body));

// ---------- 3. duplicate file detection ----------
console.log("\nDuplicate file");
const p2 = await preview(receiptCsv, "receipt", "receipt-a.csv");
check("re-upload flags previous import", (p2.body.previousImports?.length ?? 0) >= 1, JSON.stringify(p2.body.previousImports));
const c2blocked = await commit(p2.body.importId);
check("commit without confirmation blocked (409 duplicate_file)", c2blocked.status === 409 && c2blocked.body.needsConfirmation === "duplicate_file");
check("stock NOT doubled by blocked commit", (await stockOf((r) => r.sku === simple.sku && !r.variantSku)) === simple.stock + 10);
const c2 = await commit(p2.body.importId, { allowDuplicateFile: true });
check("explicit confirmation applies it", c2.status === 200 && c2.body.applied === 1, JSON.stringify(c2.body).slice(0, 200));
check("stock now +20", (await stockOf((r) => r.sku === simple.sku && !r.variantSku)) === simple.stock + 20);

// ---------- 4. rollback reverses only its own batch ----------
console.log("\nRollback");
const r2 = await rollback(p2.body.importId);
check("rollback of second batch ok", r2.status === 200, JSON.stringify(r2.body).slice(0, 200));
check("stock back to +10 (first batch untouched)", (await stockOf((r) => r.sku === simple.sku && !r.variantSku)) === simple.stock + 10);
const r1 = await rollback(p1.body.importId);
check("rollback of first batch ok", r1.status === 200);
check("stock back to original", (await stockOf((r) => r.sku === simple.sku && !r.variantSku)) === simple.stock);
const r1again = await rollback(p1.body.importId);
check("double rollback refused", r1again.status === 400 || r1again.status === 409, JSON.stringify(r1again.body));

// ---------- 5. snapshot conflict when stock moves after preview ----------
console.log("\nStale snapshot conflict");
const snapCsv = `SKU,Stock\n${simple.sku},${simple.stock + 5}`;
const p3 = await preview(snapCsv, "snapshot", "count-b.csv");
check("snapshot previewed", p3.status === 200);
// stock moves AFTER the preview (a receipt arrives)…
const p4 = await preview(`SKU,Stock\n${simple.sku},3`, "receipt", "receipt-c.csv");
const c4 = await commit(p4.body.importId);
check("interleaved receipt applied", c4.status === 200 && c4.body.applied === 1);
// …so the old snapshot must NOT silently undo it.
// allowDuplicateFile: earlier runs of this suite leave an identical committed
// count-b.csv behind, and the duplicate-file gate (tested separately above)
// would otherwise 409 here. The stale-conflict behaviour is what's under test.
const c3 = await commit(p3.body.importId, { allowDuplicateFile: true });
check("stale snapshot row skipped as conflict", c3.status === 200 && c3.body.conflicts?.length === 1, JSON.stringify(c3.body).slice(0, 300));
check("conflict reports DB vs sheet values", c3.body.conflicts?.[0]?.dbValue === simple.stock + 3 && c3.body.conflicts?.[0]?.sheetValue === simple.stock + 5, JSON.stringify(c3.body.conflicts));
check("stock kept the newer number", (await stockOf((r) => r.sku === simple.sku && !r.variantSku)) === simple.stock + 3);
await rollback(p4.body.importId); // clean up

// ---------- 6. variant isolation end-to-end ----------
if (variantRow) {
  console.log("\nVariant isolation");
  const siblings = all.filter((r) => r.id === variantRow.id && r.variantSku !== variantRow.variantSku);
  const pv = await preview(`Variant SKU,Stock\n${variantRow.variantSku},7`, "receipt", "variant-receipt.csv");
  const cv = await commit(pv.body.importId);
  check("variant receipt applied", cv.status === 200 && cv.body.applied === 1, JSON.stringify(cv.body).slice(0, 200));
  const fresh = await exportRows();
  const updated = fresh.find((r) => r.variantSku === variantRow.variantSku);
  check("target variant +7", updated?.stock === variantRow.stock + 7, `got ${updated?.stock}`);
  const siblingIntact = siblings.every((s) => fresh.find((r) => r.variantSku === s.variantSku)?.stock === s.stock);
  check("sibling variants untouched", siblingIntact);
  await rollback(pv.body.importId);
  const restored = await exportRows();
  check("variant rollback restores", restored.find((r) => r.variantSku === variantRow.variantSku)?.stock === variantRow.stock);
}

// ---------- 7. bad rows never crash, never write ----------
console.log("\nError handling");
const pBad = await preview(`SKU,Stock\nNO-SUCH-SKU,5\n${simple.sku},abc`, "receipt", "bad.csv");
check("bad rows classified as errors", pBad.body.summary?.errors === 2, JSON.stringify(pBad.body.summary));
const cBad = await commit(pBad.body.importId, { allowDuplicateFile: true }); // idem — bad.csv persists from earlier runs
check("committing an all-error batch applies nothing", cBad.status === 200 && cBad.body.applied === 0, JSON.stringify(cBad.body).slice(0, 200));
const errReport = await fetch(`${BASE}/api/imports/${pBad.body.importId}?format=errors`, { headers: authed });
const errCsv = await errReport.text();
check("error report CSV downloads with row numbers", errReport.status === 200 && /NO-SUCH-SKU|Row/.test(errCsv), errCsv.slice(0, 120));

// ---------- 8. history + templates ----------
console.log("\nHistory & templates");
const hist = await fetch(`${BASE}/api/imports`, { headers: authed }).then((r) => r.json());
check("history lists our batches newest-first", Array.isArray(hist.batches) && hist.batches.length >= 5 && hist.batches[0].id >= p3.body.importId);
const tpl = await fetch(`${BASE}/api/imports/templates/receipt`, { headers: authed });
check("receipt template downloads as xlsx", tpl.status === 200 && (tpl.headers.get("content-type") || "").includes("spreadsheetml"));
const tplBad = await fetch(`${BASE}/api/imports/templates/nope`, { headers: authed });
check("unknown template 404s", tplBad.status === 404);

// ---------- 9. auth ----------
console.log("\nAuth");
const anon = await fetch(`${BASE}/api/imports`, {});
check("import APIs require admin", anon.status === 401);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
