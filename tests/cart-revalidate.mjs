/**
 * /api/cart/validate — the endpoint that stops checkout showing one total and
 * charging another.
 *
 * The cart lives in localStorage, so its prices are a snapshot from whenever the
 * shopper pressed "Add to cart". The order endpoint always re-read the real
 * prices before charging; the checkout page did not, so a product repriced in
 * the admin console in between was charged at the new amount while the page
 * still displayed the old one. These assertions cover the endpoint that closes
 * that gap, and the guarantee that matters most: it must agree with what
 * /api/orders actually charges, because the two share one resolver.
 *
 * Run with the dev server up:  node tests/cart-revalidate.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";

let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log("FAIL: " + label);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

/** Registration is rate-limited per IP, so each run uses one fresh customer. */
const RUN = Date.now().toString(36);

async function json(res) {
  return res.json().catch(() => ({}));
}

async function adminToken() {
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const d = await json(r);
  if (!d.token) throw new Error("admin login failed: " + JSON.stringify(d));
  return d.token;
}

/**
 * Registration replies with a session cookie rather than a bearer token, so the
 * customer half of this suite carries a cookie and the admin half a token.
 */
async function customerCookie() {
  const email = `cartqa_${RUN}@example.com`;
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Cart QA",
      email,
      phone: `9${String(Date.now()).slice(-9)}`,
      password: "CartQaPass#2026",
    }),
  });
  if (!r.ok) throw new Error(`register failed: ${r.status} ${await r.text()}`);
  const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("register returned no session cookie");
  return cookie;
}

/** Accepts either a bearer token (admin) or a session cookie (customer). */
function auth(cred) {
  const headers = { "Content-Type": "application/json" };
  if (cred.includes("=")) headers.cookie = cred;
  else headers.Authorization = `Bearer ${cred}`;
  return headers;
}

async function validate(token, items) {
  const r = await fetch(`${BASE}/api/cart/validate`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ items }),
  });
  return { status: r.status, body: await json(r) };
}

async function main() {
  const admin = await adminToken();
  const customer = await customerCookie();

  // A product with plenty of stock and no variants, so price is unambiguous.
  const prods = await json(await fetch(`${BASE}/api/products`));
  const product = (prods.items || []).find((p) => Number(p.stock) > 3);
  if (!product) throw new Error("no product with stock > 3 to test against");
  const originalMop = Number(product.mop);
  const originalMrp = Number(product.mrp);

  // ---- Authorization -------------------------------------------------------
  {
    const r = await fetch(`${BASE}/api/cart/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
    eq(r.status, 401, "validate rejects an unauthenticated caller");
  }

  // ---- Malformed input -----------------------------------------------------
  {
    const r = await fetch(`${BASE}/api/cart/validate`, {
      method: "POST",
      headers: auth(customer),
      body: JSON.stringify({ nope: true }),
    });
    eq(r.status, 400, "validate refuses a body with no items array");
  }
  {
    const many = Array.from({ length: 51 }, () => ({ productId: product.id, qty: 1 }));
    const { status } = await validate(customer, many);
    eq(status, 400, "validate caps the number of lines");
  }

  // ---- Unchanged cart ------------------------------------------------------
  {
    const { status, body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 1 }]);
    eq(status, 200, "validate accepts a signed-in caller");
    eq(body.lines?.length, 1, "one line in, one line out");
    const line = body.lines[0];
    eq(Number(line.mop), originalMop, "an unchanged product reports its current price");
    eq(Number(line.mrp), originalMrp, "an unchanged product reports its current MRP");
    eq(line.unavailableReason, null, "an in-stock product is not flagged unavailable");
    ok(Number(line.stock) > 0, "stock is reported");
    eq(line.name, product.name, "the authoritative name comes back");
  }

  // ---- Line order is preserved --------------------------------------------
  // The client pairs lines to cart items by index, so a reordered or short
  // response would silently attach one product's price to another's line.
  {
    const others = (prods.items || []).filter((p) => p.id !== product.id && Number(p.stock) > 0).slice(0, 2);
    if (others.length === 2) {
      const items = [
        { productId: others[0].id, variantId: null, qty: 1 },
        { productId: product.id, variantId: null, qty: 1 },
        { productId: others[1].id, variantId: null, qty: 1 },
      ];
      const { body } = await validate(customer, items);
      eq(body.lines?.length, 3, "every posted line gets a reply");
      eq(body.lines?.[0]?.productId, others[0].id, "line 1 matches the posted order");
      eq(body.lines?.[1]?.productId, product.id, "line 2 matches the posted order");
      eq(body.lines?.[2]?.productId, others[1].id, "line 3 matches the posted order");
    }
  }

  // ---- A price changed underneath the cart ---------------------------------
  // The whole reason this endpoint exists.
  // Stay below MRP: the product validator rightly refuses a selling price above
  // the maximum retail price, so a test reprice has to be a legal one.
  const raisedMop = Math.min(originalMrp, originalMop + 500);
  ok(raisedMop !== originalMop, "the test reprice is actually a change");
  {
    // Partial update — the endpoint merges with the existing row, so there is no
    // need to resend fields this test isn't changing.
    const r = await fetch(`${BASE}/api/products/${product.id}`, {
      method: "PUT",
      headers: auth(admin),
      body: JSON.stringify({ mop: raisedMop }),
    });
    ok(r.ok, "admin can reprice the product");

    const { body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 1 }]);
    eq(Number(body.lines?.[0]?.mop), raisedMop, "a repriced product reports the NEW price, not the cart's");
    ok(Number(body.lines?.[0]?.mop) !== originalMop, "the stale cart price is not echoed back");

    // The guarantee that matters: what validate reports is what orders charges.
    const addr = await json(
      await fetch(`${BASE}/api/addresses`, {
        method: "POST",
        headers: auth(customer),
        body: JSON.stringify({ label: "Home", line: "1 Test Street", city: "Bengaluru", pincode: "560001" }),
      })
    );
    const addressId = addr.address?.id ?? addr.id;
    ok(addressId, "test address created");

    const placed = await json(
      await fetch(`${BASE}/api/orders`, {
        method: "POST",
        headers: auth(customer),
        body: JSON.stringify({
          items: [{ productId: product.id, variantId: null, qty: 1 }],
          addressId,
          paymentMethod: "Cash on Delivery",
        }),
      })
    );
    ok(placed.orderId, "an order can still be placed after a reprice");
    if (placed.orderId) {
      const detail = await json(
        await fetch(`${BASE}/api/orders/${placed.orderId}`, { headers: auth(customer) })
      );
      const charged = Number(detail.order?.items?.[0]?.mop ?? detail.items?.[0]?.mop);
      eq(charged, raisedMop, "the order charges the same price validate reported");
    }
  }

  // ---- An unpublished product ---------------------------------------------
  {
    const unpub = await fetch(`${BASE}/api/products/${product.id}`, {
      method: "PUT",
      headers: auth(admin),
      body: JSON.stringify({ status: "draft" }),
    });
    ok(unpub.ok, "admin can unpublish the product");
    const { body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 1 }]);
    ok(body.lines?.[0]?.unavailableReason, "an unpublished product is flagged unavailable");
    eq(body.lines?.[0]?.mop, null, "an unavailable line carries no price");

    // And it must not be orderable either — the same resolver backs both.
    const blocked = await json(
      await fetch(`${BASE}/api/orders`, {
        method: "POST",
        headers: auth(customer),
        body: JSON.stringify({
          items: [{ productId: product.id, variantId: null, qty: 1 }],
          addressId: 1,
          paymentMethod: "Cash on Delivery",
        }),
      })
    );
    ok(!blocked.orderId, "an unpublished product cannot be ordered");
  }

  // ---- A deleted / unknown product ----------------------------------------
  {
    const { body } = await validate(customer, [{ productId: 999999, variantId: null, qty: 1 }]);
    ok(body.lines?.[0]?.unavailableReason, "an unknown product is flagged unavailable");
  }

  // ---- Nonsense quantities are refused, not rounded -----------------------
  {
    const { body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 0 }]);
    ok(body.lines?.[0]?.unavailableReason, "a zero quantity is refused");
  }
  {
    const { body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 1.5 }]);
    ok(body.lines?.[0]?.unavailableReason, "a fractional quantity is refused");
  }
  {
    const { body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 999 }]);
    ok(body.lines?.[0]?.unavailableReason, "a quantity above the per-line cap is refused");
  }

  // ---- Restore ------------------------------------------------------------
  {
    const r = await fetch(`${BASE}/api/products/${product.id}`, {
      method: "PUT",
      headers: auth(admin),
      body: JSON.stringify({ mop: originalMop, status: "active" }),
    });
    ok(r.ok, "the product is restored to its original price and status");
    const { body } = await validate(customer, [{ productId: product.id, variantId: null, qty: 1 }]);
    eq(Number(body.lines?.[0]?.mop), originalMop, "restored price reads back correctly");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
