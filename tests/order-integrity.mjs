/**
 * Order creation must not trust anything the browser sends.
 *
 * The checkout page validates the delivery address and clamps quantities, but a
 * client-side check is not a check: anything can post JSON straight at this
 * route. These assertions exist because several of them failed the first time
 * they were run — the address check lived only in React, and a quantity of 0 or
 * -5 was silently rewritten to 1, charging the customer for an item they had
 * just removed.
 *
 * Requires a running server and a seeded database:
 *   BASE=http://localhost:3000 node tests/order-integrity.mjs
 */

const BASE = process.env.BASE || "http://localhost:3000";
const RUN = Date.now();

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

async function registerCustomer() {
  const email = `integrity${RUN}@test.local`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Integrity Probe",
      email,
      // Registration is rate limited per IP, so this suite deliberately creates
      // exactly one customer and reuses it for every case.
      phone: `9${String(RUN).slice(-9)}`,
      password: "Integrity#12345",
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
  const p = (body.items || []).find((x) => Number(x.stock) >= 2);
  if (!p) throw new Error("no seeded product with stock available");
  return p;
}

async function main() {
  const { cookie } = await registerCustomer();
  const product = await pickProduct();
  const headers = { "Content-Type": "application/json", cookie };

  const goodAddress = { line: "12 Test Street", city: "Pune", pincode: "411001" };

  async function place(body) {
    const res = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({ address: goodAddress, paymentMethod: "Cash on Delivery", ...body }),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {
      /* a crash returns HTML, and `json` staying empty is itself the signal */
    }
    return { status: res.status, json };
  }

  section("quantities are validated, not guessed at");
  for (const [label, qty] of [
    ["a negative quantity is refused", -5],
    ["a zero quantity is refused", 0],
    ["a fractional quantity is refused rather than crashing", 1.5],
    ["a non-numeric quantity is refused", "many"],
    ["a missing quantity is refused", undefined],
  ]) {
    const r = await place({ items: [{ productId: product.id, qty }] });
    check(label, r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }

  const capped = await place({ items: [{ productId: product.id, qty: 999999 }] });
  check("an absurd quantity is refused", capped.status === 400, `got ${capped.status}`);

  section("the delivery address is validated on the server");
  const noAddress = await place({ items: [{ productId: product.id, qty: 1 }], address: {} });
  check("an order with no address is refused", noAddress.status === 400, `got ${noAddress.status}`);

  const blank = await place({ items: [{ productId: product.id, qty: 1 }], address: { line: "   ", city: "Pune", pincode: "411001" } });
  check("a whitespace-only address is refused", blank.status === 400, `got ${blank.status}`);

  for (const [label, pincode] of [
    ["a non-numeric pincode is refused", "abc"],
    ["a short pincode is refused", "4110"],
    ["a long pincode is refused", "4110011"],
    ["a pincode starting with zero is refused", "011001"],
  ]) {
    const r = await place({ items: [{ productId: product.id, qty: 1 }], address: { ...goodAddress, pincode } });
    check(label, r.status === 400, `got ${r.status} ${JSON.stringify(r.json)}`);
  }

  section("money is read from the database, never from the request");
  const tampered = await place({
    items: [{ productId: product.id, qty: 1, mop: 1, price: 1, mrp: 1 }],
    // A discount the client made up, and a total it would like to pay.
    discount: -99999,
    totalMop: 1,
    totalMrp: 1,
  });
  check("an order with tampered prices is still accepted", tampered.status === 200, `got ${tampered.status}`);

  if (tampered.status === 200) {
    const list = await (await fetch(`${BASE}/api/orders`, { headers: { cookie } })).json();
    const row = (list.items || []).find((x) => x.order.id === tampered.json.orderId);
    check("but it is priced from the catalogue, not the payload", row && Number(row.order.totalMop) === Number(product.mop), `stored ${row?.order?.totalMop}, catalogue ${product.mop}`);
    check("and the invented discount is ignored", row && Number(row.order.discount) === 0, `stored discount ${row?.order?.discount}`);
    check("and the delivery address is persisted", row && row.order.pincode === goodAddress.pincode, `stored pincode ${JSON.stringify(row?.order?.pincode)}`);
  }

  section("catalogue references are checked");
  const bogus = await place({ items: [{ productId: 99999999, qty: 1 }] });
  check("an order for a product that doesn't exist is refused", bogus.status === 400, `got ${bogus.status}`);

  const empty = await place({ items: [] });
  check("an empty cart is refused", empty.status === 400, `got ${empty.status}`);

  const badMethod = await place({ items: [{ productId: product.id, qty: 1 }], paymentMethod: "Paid in full via UPI" });
  check("an invented payment method is refused", badMethod.status === 400, `got ${badMethod.status}`);

  const fakeCoupon = await place({ items: [{ productId: product.id, qty: 1 }], couponCode: `NOTREAL${RUN}` });
  check("a coupon that doesn't exist is refused", fakeCoupon.status === 400, `got ${fakeCoupon.status}`);

  section("a coupon that covers the whole cart doesn't strand the order");
  // Needs a 100%-off code. If the shop doesn't have one, the suite creates
  // QAFREE100 itself through the admin API — same as the import suite
  // provisions its own data — so this check runs deterministically instead
  // of silently skipping on every fresh database. No Razorpay keys are
  // needed: nothing is owed on a fully discounted order, so the server must
  // settle it as paid without ever talking to a gateway.
  const freeCode = process.env.FREE_COUPON || "QAFREE100";
  const placeFree = () =>
    place({
      items: [{ productId: product.id, qty: 1 }],
      couponCode: freeCode,
      paymentMethod: "Razorpay",
    });
  let freeOnline = await placeFree();
  if (freeOnline.status === 400 && /coupon/i.test(JSON.stringify(freeOnline.json))) {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";
    const loginRes = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const login = await loginRes.json().catch(() => ({}));
    const adminSession = /sms_session=([^;]+)/.exec(setCookie)?.[1] || login.token;
    if (adminSession) {
      await fetch(`${BASE}/api/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `sms_session=${adminSession}` },
        body: JSON.stringify({ code: freeCode, type: "percent", value: 100 }),
      });
      freeOnline = await placeFree();
    }
  }
  if (freeOnline.status === 400 && /coupon/i.test(JSON.stringify(freeOnline.json))) {
    console.log(`  skip no 100% coupon (${freeCode}) configured and admin login unavailable to create one`);
  } else {
    check("a fully discounted online order is accepted", freeOnline.status === 200, `got ${freeOnline.status} ${JSON.stringify(freeOnline.json)}`);
    if (freeOnline.status === 200) {
      const list = await (await fetch(`${BASE}/api/orders`, { headers: { cookie } })).json();
      const row = (list.items || []).find((x) => x.order.id === freeOnline.json.orderId);
      // The gateway refuses amounts below one rupee, so an order left in
      // Awaiting Payment here could never be paid for or dispatched.
      check("it is not left awaiting a payment that can never happen", row && row.order.status !== "Awaiting Payment", `status ${row?.order?.status}`);
      check("it is settled as paid, because nothing is owed", row && row.order.paymentStatus === "paid", `paymentStatus ${row?.order?.paymentStatus}`);
      check("and its total really is zero", row && Number(row.order.totalMop) === 0, `total ${row?.order?.totalMop}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nsuite could not run: ${e.message}\n`);
  process.exit(1);
});
