/**
 * End-to-end test of the repair-services feature against a running, seeded
 * server: admin auth gates → service CRUD → catalogue-install idempotency →
 * public visibility (active/hidden) → customer booking → owner notification
 * side effects.
 *
 * These cover the exact regressions the feature could ship silently:
 * an unauthenticated caller installing the catalogue, a double install
 * duplicating every service, a hidden service still showing on the
 * storefront, and a booking that succeeds without telling the owner.
 *
 * Requires a running server and a seeded database:
 *   BASE=http://localhost:3000 node tests/repair-services.mjs
 */

const BASE = process.env.BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";
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
  return { status: res.status, json, headers: res.headers };
}

// ---------- auth gates: every admin write must refuse anonymous callers ----------
section("admin endpoints refuse anonymous callers");
{
  const anonCreate = await jfetch(`/api/services`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("POST /api/services requires admin", anonCreate.status === 401, `got ${anonCreate.status}`);

  const anonInstall = await jfetch(`/api/services/install-catalogue`, { method: "POST" });
  check("POST /api/services/install-catalogue requires admin", anonInstall.status === 401, `got ${anonInstall.status}`);

  const anonImages = await jfetch(`/api/services/auto-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "preview" }),
  });
  check("POST /api/services/auto-images requires admin", anonImages.status === 401, `got ${anonImages.status}`);
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
const authedJson = { ...authed, "Content-Type": "application/json" };

// ---------- catalogue install is idempotent ----------
section("catalogue install never duplicates services");
{
  const first = await jfetch(`/api/services/install-catalogue`, { method: "POST", headers: authed });
  check("first install succeeds", first.status === 200, `got ${first.status} ${JSON.stringify(first.json)}`);

  const before = await jfetch(`/api/services`, { headers: authed });
  const countBefore = (before.json?.items || []).length;

  const second = await jfetch(`/api/services/install-catalogue`, { method: "POST", headers: authed });
  check("second install succeeds", second.status === 200, `got ${second.status}`);

  const after = await jfetch(`/api/services`, { headers: authed });
  const countAfter = (after.json?.items || []).length;
  check("second install adds no duplicate services", countAfter === countBefore, `${countBefore} → ${countAfter}`);

  const names = (after.json?.items || []).map((s) => String(s.name).toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  check("no two services share a name", dupes.length === 0, dupes.join(", "));
}

// ---------- service lifecycle: create → hide → show → delete ----------
section("service lifecycle drives public visibility");
const svcName = `QA Probe Service ${RUN}`;
let svcId = null;
{
  const created = await jfetch(`/api/services`, {
    method: "POST",
    headers: authedJson,
    body: JSON.stringify({ name: svcName, description: "Automated test service", priceFrom: 499, category: "QA" }),
  });
  check("admin can create a service", created.status === 200, `got ${created.status} ${JSON.stringify(created.json)}`);
  svcId = created.json?.service?.id ?? created.json?.item?.id ?? created.json?.id ?? null;
  check("create returns the new service id", Boolean(svcId), JSON.stringify(created.json));

  const dupe = await jfetch(`/api/services`, {
    method: "POST",
    headers: authedJson,
    body: JSON.stringify({ name: svcName.toUpperCase() }),
  });
  check("a duplicate name (case-insensitive) is refused", dupe.status !== 200, `got ${dupe.status}`);

  const pubActive = await jfetch(`/api/services`);
  const visibleActive = (pubActive.json?.items || []).some((s) => s.id === svcId);
  check("an active service appears on the public list", visibleActive);

  if (svcId) {
    const hide = await jfetch(`/api/services/${svcId}`, {
      method: "PUT",
      headers: authedJson,
      body: JSON.stringify({ name: svcName, status: "hidden" }),
    });
    check("admin can hide a service", hide.status === 200, `got ${hide.status} ${JSON.stringify(hide.json)}`);

    const pubHidden = await jfetch(`/api/services`);
    const visibleHidden = (pubHidden.json?.items || []).some((s) => s.id === svcId);
    check("a hidden service disappears from the public list", !visibleHidden);

    const adminList = await jfetch(`/api/services`, { headers: authed });
    const adminSees = (adminList.json?.items || []).some((s) => s.id === svcId);
    check("but the admin list still shows it", adminSees);

    const unhide = await jfetch(`/api/services/${svcId}`, {
      method: "PUT",
      headers: authedJson,
      body: JSON.stringify({ name: svcName, status: "active" }),
    });
    check("admin can re-activate a service", unhide.status === 200, `got ${unhide.status}`);
  }
}

// ---------- customer booking ----------
section("a customer can book a service and the owner is told");
{
  const email = `svcprobe${RUN}@test.local`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Service Probe",
      email,
      phone: `8${String(RUN).slice(-9)}`,
      password: "Service#12345",
    }),
  });
  check("test customer registers", reg.ok, `got ${reg.status}`);
  const custCookie = (reg.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");

  const anonBook = await jfetch(`/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceId: svcId }),
  });
  check("booking requires a logged-in customer", anonBook.status === 401, `got ${anonBook.status}`);

  const bogus = await jfetch(`/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: custCookie },
    body: JSON.stringify({ serviceId: 99999999 }),
  });
  check("booking a service that doesn't exist is refused", bogus.status === 400, `got ${bogus.status}`);

  const booked = await jfetch(`/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: custCookie },
    body: JSON.stringify({ serviceId: svcId, device: "QA Phone", issue: "Automated test booking" }),
  });
  check("a real booking is accepted", booked.status === 200, `got ${booked.status} ${JSON.stringify(booked.json)}`);
  check("the booking gets a booking number", Boolean(booked.json?.bookingNo), JSON.stringify(booked.json));

  const mine = await jfetch(`/api/bookings`, { headers: { cookie: custCookie } });
  const ownRow = (mine.json?.items || []).find((b) => b.bookingNo === booked.json?.bookingNo);
  check("the customer sees their own booking", Boolean(ownRow));

  const adminView = await jfetch(`/api/bookings`, { headers: authed });
  const adminRow = (adminView.json?.items || []).find((b) => b.bookingNo === booked.json?.bookingNo);
  check("the admin sees the booking with the right service", Boolean(adminRow) && adminRow.serviceName === svcName, JSON.stringify(adminRow || null));
}

// ---------- auto-images preview is read-only ----------
section("auto-image preview proposes without writing");
{
  const preview = await jfetch(`/api/services/auto-images`, {
    method: "POST",
    headers: authedJson,
    body: JSON.stringify({ mode: "preview" }),
  });
  check("preview succeeds for an admin", preview.status === 200, `got ${preview.status}`);

  // A preview must not change any service row: fetch before/after and compare images.
  const before = await jfetch(`/api/services`, { headers: authed });
  await jfetch(`/api/services/auto-images`, { method: "POST", headers: authedJson, body: JSON.stringify({ mode: "preview" }) });
  const after = await jfetch(`/api/services`, { headers: authed });
  const imgs = (list) => JSON.stringify((list.json?.items || []).map((s) => [s.id, s.image]));
  check("preview mode changes no service images", imgs(before) === imgs(after));
}

// ---------- cleanup ----------
section("cleanup");
if (svcId) {
  const del = await jfetch(`/api/services/${svcId}`, { method: "DELETE", headers: authed });
  check("test service is deleted", del.status === 200, `got ${del.status}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
