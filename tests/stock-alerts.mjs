/**
 * Back-in-stock alerts, end to end against a running, seeded server:
 * public subscribe guards (honeypot, validation, already-in-stock, rate
 * limit) → admin visibility → the restock hook on product and variant edits.
 *
 * These cover the regressions the feature could ship silently: a bot
 * stuffing the alerts table, an alert accepted for an in-stock item (it
 * would never fire), the admin list being world-readable, and a restock
 * that never triggers the notifier.
 *
 * Alert consumption semantics: without SMTP configured (the test
 * environment), matched alerts stay pending — that is deliberate, so a shop
 * that configures SMTP later still delivers the backlog. The hook's effect
 * is observable in the PUT response's `stockAlerts` counts.
 *
 * Requires a running server and a seeded database:
 *   BASE=http://localhost:3000 node tests/stock-alerts.mjs
 * The variant-restock section needs DATABASE_URL (to reset the public
 * limiter's budget mid-suite) and is skipped without it.
 */
import { execFileSync } from "child_process";

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";
const DB = process.env.DATABASE_URL || "";
const RUN = Date.now();

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name) { console.log(`\n${name}`); }

async function jfetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, json };
}

async function adminToken() {
  const r = await jfetch(`/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.json?.token) throw new Error("admin login failed: " + JSON.stringify(r.json));
  return r.json.token;
}
const auth = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

function subscribe(body) {
  return jfetch(`/api/stock-alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Pending alerts for one product, as the admin list endpoint reports them. */
async function pendingFor(token, productId) {
  const r = await jfetch(`/api/stock-alerts`, { headers: auth(token) });
  return (r.json?.pending || []).filter((a) => a.productId === productId);
}

const admin = await adminToken();

// A throwaway product with zero stock and no variants, so the suite never
// depends on (or mutates) the seeded catalogue.
const cats = await jfetch(`/api/categories`);
const categoryId = cats.json?.items?.[0]?.id;
if (!categoryId) throw new Error("no categories — is the database seeded?");
const created = await jfetch(`/api/products`, {
  method: "POST",
  headers: auth(admin),
  body: JSON.stringify({
    name: `Alert QA ${RUN}`,
    brand: "QA",
    categoryId,
    mrp: 1000,
    mop: 900,
    stock: 0,
    sku: `ALERTQA-${RUN}`,
  }),
});
const product = { id: created.json?.id };
if (!product.id) throw new Error("could not create test product: " + JSON.stringify(created.json));

section("admin list is not world-readable");
{
  const anon = await jfetch(`/api/stock-alerts`);
  check("GET /api/stock-alerts requires admin", anon.status === 401, `got ${anon.status}`);
}

// The public POST budget is 5 per IP per 10 minutes; every POST below spends
// from it, and the sixth is the rate-limit assertion itself.
section("public subscribe guards");
{
  const bot = await subscribe({ productId: product.id, email: `bot${RUN}@test.local`, website: "https://spam.example" });
  check("honeypot answers success", bot.status === 200 && bot.json?.ok, JSON.stringify(bot.json));
  const afterBot = await pendingFor(admin, product.id);
  check("honeypot stores nothing", afterBot.length === 0, `${afterBot.length} rows`);

  const badEmail = await subscribe({ productId: product.id, email: "not-an-email" });
  check("junk email is refused", badEmail.status === 400, `got ${badEmail.status}`);

  const okSub = await subscribe({ productId: product.id, email: `shopper${RUN}@test.local` });
  check("out-of-stock subscribe accepted", okSub.status === 200 && okSub.json?.ok, JSON.stringify(okSub.json));

  const dup = await subscribe({ productId: product.id, email: `SHOPPER${RUN}@test.local` });
  check("duplicate (case-insensitive) is a silent no-op", dup.status === 200 && dup.json?.ok, JSON.stringify(dup.json));
  const afterDup = await pendingFor(admin, product.id);
  check("exactly one pending alert stored", afterDup.length === 1, `${afterDup.length} rows`);
  check("admin list names the product", afterDup[0]?.productName === `Alert QA ${RUN}`, JSON.stringify(afterDup[0]));

  // The seeded catalogue always has something purchasable.
  const prods = await jfetch(`/api/products`);
  const inStock = (prods.json?.items || []).find((p) => Number(p.stock) > 0);
  if (inStock) {
    const r = await subscribe({ productId: inStock.id, email: `instock${RUN}@test.local` });
    check("subscribe on an in-stock product is refused", r.status === 409, `got ${r.status}`);
  } else {
    check("subscribe on an in-stock product is refused", false, "no in-stock product in seed");
  }

  const sixth = await subscribe({ productId: product.id, email: `sixth${RUN}@test.local` });
  check("sixth request in the window is rate-limited", sixth.status === 429, `got ${sixth.status}`);
}

section("restocking the product triggers the notifier");
{
  const put = await jfetch(`/api/products/${product.id}`, {
    method: "PUT",
    headers: auth(admin),
    body: JSON.stringify({ stock: 4 }),
  });
  check("restock edit succeeds", put.status === 200 && put.json?.ok, JSON.stringify(put.json));
  check("hook matched the pending alert", put.json?.stockAlerts?.matched === 1, JSON.stringify(put.json?.stockAlerts));
  check("no email sent without SMTP", put.json?.stockAlerts?.sent === 0, JSON.stringify(put.json?.stockAlerts));
  const still = await pendingFor(admin, product.id);
  check("unsent alert stays pending for retry", still.length === 1, `${still.length} rows`);

  // A second restock (stock already > 0) must not re-run the hook.
  const again = await jfetch(`/api/products/${product.id}`, {
    method: "PUT",
    headers: auth(admin),
    body: JSON.stringify({ stock: 6 }),
  });
  check("non-transition edit skips the hook", again.status === 200 && again.json?.stockAlerts === undefined, JSON.stringify(again.json));
}

if (DB) {
  section("variant restock path (needs DATABASE_URL)");
  // Fresh budget for one more public POST.
  execFileSync("psql", [DB, "-tAc", "delete from rate_limits where key like 'stock-alert:%'"], { encoding: "utf8" });

  const vProd = await jfetch(`/api/products`, {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({
      name: `Alert QA V ${RUN}`, brand: "QA", categoryId,
      mrp: 2000, mop: 1800, stock: 0, sku: `ALERTQAV-${RUN}`,
    }),
  });
  const vp = { id: vProd.json?.id };
  const variant = await jfetch(`/api/variants`, {
    method: "POST",
    headers: auth(admin),
    body: JSON.stringify({ productId: vp.id, color: "Black", storage: "128GB", mrp: 2000, mop: 1800, stock: 0, sku: `ALERTQAV-${RUN}-BLK` }),
  });
  const v = variant.json?.item;
  check("variant created out of stock", !!v?.id, JSON.stringify(variant.json));

  const sub = await subscribe({ productId: vp.id, variantId: v.id, email: `variantfan${RUN}@test.local` });
  check("variant subscribe accepted", sub.status === 200 && sub.json?.ok, JSON.stringify(sub.json));

  const put = await jfetch(`/api/variants/${v.id}`, {
    method: "PUT",
    headers: auth(admin),
    body: JSON.stringify({ stock: 3 }),
  });
  check("variant restock runs the hook", put.json?.stockAlerts?.matched === 1, JSON.stringify(put.json));

  // Tidy up: hide both QA products so they never surface on the storefront.
  await jfetch(`/api/products/${vp.id}`, { method: "PUT", headers: auth(admin), body: JSON.stringify({ status: "hidden" }) });
} else {
  console.log("\nvariant restock path skipped (set DATABASE_URL to enable)");
}

section("admin can remove a pending request");
{
  // The product-restock alert earlier in the suite stayed pending (no SMTP),
  // so it is exactly the row the admin's Remove button would target.
  const noAuth = await jfetch(`/api/stock-alerts?id=1`, { method: "DELETE" });
  check("delete without auth is refused", noAuth.status === 401, `got ${noAuth.status}`);

  const list = await jfetch("/api/stock-alerts", { headers: auth(admin) });
  const mine = (list.json?.pending || []).find((a) => a.productId === product.id);
  check("pending request visible to admin", !!mine, JSON.stringify(list.json?.pendingCount));

  if (mine) {
    const del = await jfetch(`/api/stock-alerts?id=${mine.id}`, { method: "DELETE", headers: auth(admin) });
    check("admin delete succeeds", del.status === 200 && del.json?.ok, JSON.stringify(del.json));

    const again = await jfetch(`/api/stock-alerts?id=${mine.id}`, { method: "DELETE", headers: auth(admin) });
    check("second delete of the same row is 404", again.status === 404, `got ${again.status}`);
  } else {
    check("admin delete succeeds", false, "pending row not found");
    check("second delete of the same row is 404", false, "pending row not found");
  }

  const junk = await jfetch(`/api/stock-alerts?id=abc`, { method: "DELETE", headers: auth(admin) });
  check("non-numeric id is rejected", junk.status === 400, `got ${junk.status}`);
}

await jfetch(`/api/products/${product.id}`, { method: "PUT", headers: auth(admin), body: JSON.stringify({ status: "hidden" }) });

console.log(`\n${passed + failed} checks, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
