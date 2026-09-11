/**
 * Reviews with photos, end to end against a running, seeded server:
 * anonymous submit refused → customer posts a review with photo references →
 * junk image entries are dropped while real ones survive → the PDP payload
 * carries the photos → resubmit updates in place instead of duplicating →
 * the admin moderation list is gated and joined with product names → admin
 * delete removes the review → customer photo uploads respect the
 * images-only rule.
 *
 * These cover the regressions the feature could ship silently: a stored
 * javascript: "photo" served to every visitor, review counts inflated by
 * duplicate submits, the store-wide moderation list being world-readable,
 * and the customer upload path accepting a video.
 *
 * Requires a running server and a seeded database:
 *   BASE=http://localhost:3000 node tests/reviews.mjs
 */

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";
const RUN = Date.now();

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

async function jfetch(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON body; status is still meaningful.
  }
  return { status: res.status, json, headers: res.headers };
}

async function adminLogin() {
  const r = await jfetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.json?.token) throw new Error("admin login failed");
  return { Authorization: `Bearer ${r.json.token}` };
}

async function registerCustomer() {
  const email = `reviewer${RUN}@test.local`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Review Probe",
      email,
      // Registration is rate limited per IP, so this suite deliberately
      // creates exactly one customer and reuses it for every case.
      phone: `8${String(RUN).slice(-9)}`,
      password: "Reviewer#12345",
    }),
  });
  if (!res.ok) throw new Error(`could not register test customer: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("register returned no session cookie");
  return { cookie, email };
}

async function pickProduct() {
  const res = await fetch(`${BASE}/api/products?limit=50`);
  const body = await res.json();
  const p = (body.items || [])[0];
  if (!p) throw new Error("no seeded product available");
  return p;
}

// A real 1x1 PNG, so the photo reference in the review is an actual image.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const admin = await adminLogin();
const { cookie } = await registerCustomer();
const product = await pickProduct();
const customerHeaders = { "Content-Type": "application/json", cookie };

section("posting a review with photos");
{
  const anon = await jfetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: product.id, rating: 5, body: "anon" }),
  });
  check("anonymous review is refused", anon.status === 401, `got ${anon.status}`);

  const post = await jfetch("/api/reviews", {
    method: "POST",
    headers: customerHeaders,
    body: JSON.stringify({
      productId: product.id,
      rating: 4,
      title: "Solid phone for the price",
      body: "Battery easily lasts a day. Photos attached.",
      // Two real references and two that must be dropped by the server.
      images: [PNG_DATA_URL, "/images/banner-hero-1.jpg", "javascript:alert(1)", "not a url"],
    }),
  });
  check("customer review accepted", post.status === 200 && post.json?.ok, JSON.stringify(post.json));

  const list = await jfetch(`/api/reviews?productId=${product.id}`);
  const mine = (list.json?.items || []).find((r) => r.customerName === "Review Probe");
  check("review appears on the product", !!mine, `items=${list.json?.items?.length}`);

  const photos = mine ? JSON.parse(mine.images || "[]") : [];
  check("real photo references survive", photos.length === 2, JSON.stringify(photos.map((u) => u.slice(0, 24))));
  check(
    "junk image entries are dropped",
    photos.every((u) => /^(https?:\/\/|\/(?!\/)|data:image\/)/.test(u)),
    JSON.stringify(photos.map((u) => u.slice(0, 24)))
  );
}

section("resubmit updates instead of duplicating");
{
  const again = await jfetch("/api/reviews", {
    method: "POST",
    headers: customerHeaders,
    body: JSON.stringify({
      productId: product.id,
      rating: 5,
      body: "Bumping to five stars after a week.",
      images: [PNG_DATA_URL],
    }),
  });
  check("resubmit reports an update", again.status === 200 && again.json?.updated === true, JSON.stringify(again.json));

  const list = await jfetch(`/api/reviews?productId=${product.id}`);
  const mine = (list.json?.items || []).filter((r) => r.customerName === "Review Probe");
  check("still exactly one review from this customer", mine.length === 1, `${mine.length} rows`);
  check("update replaced the photo list", mine[0] && JSON.parse(mine[0].images || "[]").length === 1, mine[0]?.images?.slice(0, 40));
}

section("admin moderation list");
{
  const anon = await jfetch("/api/reviews");
  check("store-wide list is empty for anonymous callers", (anon.json?.items || []).length === 0, `${anon.json?.items?.length} items`);

  const list = await jfetch("/api/reviews", { headers: admin });
  const mine = (list.json?.items || []).find((r) => r.customerName === "Review Probe");
  check("admin sees the review store-wide", !!mine, `items=${list.json?.items?.length}`);
  check("moderation row carries the product name", !!mine?.productName, JSON.stringify(mine?.productName));

  if (mine) {
    const del = await jfetch("/api/reviews", {
      method: "DELETE",
      headers: { ...admin, "Content-Type": "application/json" },
      body: JSON.stringify({ id: mine.id }),
    });
    check("admin delete succeeds", del.status === 200 && del.json?.ok, JSON.stringify(del.json));

    const after = await jfetch(`/api/reviews?productId=${product.id}`);
    const gone = !(after.json?.items || []).some((r) => r.id === mine.id);
    check("deleted review is gone from the product page", gone, "still present");
  } else {
    check("admin delete succeeds", false, "review not found in admin list");
    check("deleted review is gone from the product page", false, "review not found in admin list");
  }
}

section("customer photo upload rules");
{
  // Anonymous upload: refused outright.
  const anonForm = new FormData();
  anonForm.append("file", new File([new Uint8Array(64)], "x.png", { type: "image/png" }));
  const anon = await fetch(`${BASE}/api/media/upload`, { method: "POST", body: anonForm });
  check("anonymous upload is refused", anon.status === 401, `got ${anon.status}`);

  // Customer uploading a video: images only for shoppers. When R2 is not
  // configured the route answers 503 before looking at the file — both
  // statuses prove the video was not stored.
  const vidForm = new FormData();
  vidForm.append("file", new File([new Uint8Array(64)], "x.mp4", { type: "video/mp4" }));
  const vid = await fetch(`${BASE}/api/media/upload`, { method: "POST", body: vidForm, headers: { cookie } });
  check("customer video upload is not accepted", vid.status === 400 || vid.status === 503, `got ${vid.status}`);
}

console.log(`\n${passed + failed} checks, ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
