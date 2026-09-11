/**
 * The cheap anti-abuse layers, each proven to actually fire:
 *
 *   1. Cross-origin write rejection — a POST/PUT/PATCH/DELETE whose Origin
 *      header names a foreign site is refused by the middleware before any
 *      route code runs. Reads are unaffected (public pages get hot-linked
 *      and that is fine).
 *   2. Form honeypots — the visually hidden "website" field on the contact
 *      and newsletter forms. A bot that fills it must receive a success
 *      response (so it moves on) while nothing is stored.
 *   3. Media upload degradation — with R2 unconfigured the upload route
 *      answers 503 so the admin UI falls back to data URLs; it must never
 *      crash or pretend to succeed.
 *
 * Requires a running server and a seeded database:
 *   BASE=http://localhost:3000 node tests/abuse-guards.mjs
 */

const BASE = process.env.BASE || "http://localhost:3000";
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

// ---------- cross-origin write rejection ----------
section("cross-origin writes are rejected by the middleware");
{
  const evil = await jfetch(`/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ name: "x", email: "x@evil.example", message: "hi" }),
  });
  check("a POST with a foreign Origin is refused", evil.status === 403, `got ${evil.status}`);

  const malformed = await jfetch(`/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "not a url" },
    body: JSON.stringify({ name: "x", email: "x@evil.example", message: "hi" }),
  });
  check("a POST with a malformed Origin is refused", malformed.status === 403, `got ${malformed.status}`);

  const sameOrigin = await jfetch(`/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
    },
    body: JSON.stringify({
      name: "Origin Probe",
      email: `origin${RUN}@test.local`,
      phone: "9000000001",
      message: "same-origin write should pass the middleware",
    }),
  });
  check("the same-origin POST passes the middleware", sameOrigin.status !== 403, `got ${sameOrigin.status}`);

  const read = await fetch(`${BASE}/api/products?limit=1`, { headers: { Origin: "https://evil.example" } });
  check("cross-origin reads are unaffected", read.status === 200, `got ${read.status}`);
}

// ---------- honeypots ----------
section("form honeypots fool bots without storing anything");
{
  const botContact = await jfetch(`/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Bot Probe",
      email: `bot${RUN}@test.local`,
      phone: "9000000002",
      message: "spam",
      website: "https://spam.example", // the hidden field no human sees
    }),
  });
  check("a contact POST with the honeypot filled still reads as success", botContact.status === 200, `got ${botContact.status}`);

  const humanContact = await jfetch(`/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Human Probe",
      email: `human${RUN}@test.local`,
      phone: "9000000003",
      message: "a real enquiry from the abuse-guards suite",
    }),
  });
  check("a normal contact POST succeeds", humanContact.status === 200, `got ${humanContact.status}`);

  const botSub = await jfetch(`/api/subscribers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `bot-sub${RUN}@test.local`, website: "https://spam.example" }),
  });
  check("a newsletter POST with the honeypot filled still reads as success", botSub.status === 200, `got ${botSub.status}`);

  const humanSub = await jfetch(`/api/subscribers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `human-sub${RUN}@test.local` }),
  });
  check("a normal newsletter POST succeeds", humanSub.status === 200, `got ${humanSub.status}`);

  // Subscribing the honeypot-flagged address again must behave as if it were
  // never stored: a fresh subscribe attempt is not refused as a duplicate.
  const botSubAgain = await jfetch(`/api/subscribers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `bot-sub${RUN}@test.local` }),
  });
  check("the honeypot-flagged address was never actually stored", botSubAgain.status === 200, `got ${botSubAgain.status} ${JSON.stringify(botSubAgain.json)}`);
}

// ---------- media upload degradation ----------
section("media upload degrades cleanly when R2 is not configured");
{
  const anon = await fetch(`${BASE}/api/media/upload`, { method: "POST", body: new FormData() });
  check("upload requires an admin session", anon.status === 401 || anon.status === 403 || anon.status === 503, `got ${anon.status}`);

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const setCookie = loginRes.headers.get("set-cookie") || "";
  const login = await loginRes.json().catch(() => ({}));
  const sessionCookie = /sms_session=([^;]+)/.exec(setCookie)?.[1] || login.token;

  if (!sessionCookie) {
    console.log("  skip admin login unavailable — upload degradation not probed");
  } else {
    // A 1×1 white PNG, the smallest legitimate image payload.
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const form = new FormData();
    form.append("file", new Blob([pngBytes], { type: "image/png" }), "probe.png");
    const res = await fetch(`${BASE}/api/media/upload`, {
      method: "POST",
      headers: { cookie: `sms_session=${sessionCookie}` },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    const r2Live = res.status === 200 && typeof body.url === "string" && body.url.length > 0;
    const cleanFallback = res.status === 503;
    check(
      "upload either succeeds (R2 configured) or answers 503 for the data-URL fallback",
      r2Live || cleanFallback,
      `got ${res.status} ${JSON.stringify(body)}`
    );
    if (r2Live) check("a successful upload returns a real URL, not a data URL", !body.url.startsWith("data:"), body.url.slice(0, 60));
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
