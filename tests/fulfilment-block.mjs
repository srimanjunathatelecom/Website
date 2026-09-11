/**
 * Fulfilment and stock-restore rules around unpaid orders.
 *
 * Three bugs are pinned down here, all of which cost the shop real money or
 * real inventory accuracy:
 *
 *   1. An order awaiting online payment could be marked Packed/Shipped/Delivered
 *      from the admin orders list, dispatching goods nobody paid for.
 *   2. Cancelling an order restored the product's stock but never the variant's,
 *      so every cancelled order with a size/colour option destroyed that
 *      option's stock permanently.
 *   3. Cancelling an unpaid order and then receiving the gateway's
 *      payment.failed webhook credited the same units twice.
 *
 * Run against a seeded dev server:  node tests/fulfilment-block.mjs
 */

import crypto from "crypto";
import { execFileSync } from "child_process";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DB = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/sms_stores";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "localqawebhooksecret";
const ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.local";
const ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || "AdminLocal#2026";

const RUN = `fb${Date.now().toString(36)}`;
const ev = (name) => `evt_${RUN}_${name}`;

let pass = 0;
let fail = 0;

function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sql = (q) => execFileSync("psql", [DB, "-tAc", q], { encoding: "utf8" }).trim();
const nums = (q) => sql(q).split(" ").map(Number);

async function webhook(event, eventId) {
  const body = JSON.stringify(event);
  const res = await fetch(`${BASE}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
      "x-razorpay-event-id": eventId,
    },
    body,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const paymentEvent = (type, gatewayOrderId, gatewayPaymentId, amount, extra = {}) => ({
  event: type,
  payload: {
    payment: {
      entity: {
        id: gatewayPaymentId,
        order_id: gatewayOrderId,
        amount,
        amount_refunded: 0,
        currency: "INR",
        status: type === "payment.captured" ? "captured" : "failed",
        method: "upi",
        error_code: null,
        error_description: null,
        captured: type === "payment.captured",
        ...extra,
      },
    },
  },
});

// Registration is rate limited to 5/hour per IP, so one customer is created and
// reused for every order in this file.
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Fulfilment QA",
    email: `fb_${RUN}@test.local`,
    phone: `9${Date.now().toString().slice(-9)}`,
    password: "TestPass#123",
  }),
});
const buyer = (reg.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
if (!buyer) {
  throw new Error(
    `could not create test customer: ${JSON.stringify(await reg.json().catch(() => ({})))}. ` +
      `Registration is rate limited to 5/hour per IP — restart the dev server to clear it.`
  );
}

const loginRes = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
});
const login = await loginRes.json();
if (!login.token) throw new Error(`admin login failed: ${JSON.stringify(login)}`);
const adminHeaders = { "Content-Type": "application/json", authorization: `Bearer ${login.token}` };

const setStatus = (orderId, status) =>
  fetch(`${BASE}/api/orders/${orderId}`, { method: "PUT", headers: adminHeaders, body: JSON.stringify({ status }) });

async function placeOrder({ productId, variantId, paymentMethod }) {
  const res = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: buyer },
    body: JSON.stringify({
      items: [variantId ? { productId, qty: 1, variantId } : { productId, qty: 1 }],
      address: { line: "12 MG Road", city: "Bengaluru", pincode: "560001" },
      paymentMethod,
    }),
  });
  const body = await res.json();
  if (!body.orderId) throw new Error(`order creation failed: ${JSON.stringify(body)}`);
  return body;
}

/** Place an online order and stand up the gateway handle the webhook matches on. */
async function pendingOnlineOrder(label) {
  const productId = Number(sql("select id from products where stock > 3 order by id limit 1"));
  const stockBefore = Number(sql(`select stock from products where id = ${productId}`));
  const order = await placeOrder({ productId, paymentMethod: "Razorpay" });
  const gatewayOrderId = `order_${RUN}${label}`;
  const amountPaise = Math.round(Number(sql(`select total_mop from orders where id = ${order.orderId}`)) * 100);
  sql(
    `insert into payments (order_id, gateway, gateway_order_id, amount_paise, status)
     values (${order.orderId}, 'razorpay', '${gatewayOrderId}', ${amountPaise}, 'created')`
  );
  return { order, productId, stockBefore, gatewayOrderId, amountPaise };
}

console.log("\nfulfilment and stock-restore rules\n");

// ---------------------------------------------------------------------------
console.log("an unpaid order cannot be dispatched");
{
  const ctx = await pendingOnlineOrder("guard");

  for (const status of ["Packed", "Shipped", "Out for Delivery", "Delivered"]) {
    const res = await setStatus(ctx.order.orderId, status);
    check(`refuses to mark an unpaid order ${status}`, res.status === 409, `got ${res.status}`);
  }

  const stayed = sql(`select status from orders where id = ${ctx.order.orderId}`);
  check("the refused order keeps its status", stayed === "Awaiting Payment", stayed);

  const reserved = Number(sql(`select stock from products where id = ${ctx.productId}`));
  const cancel = await setStatus(ctx.order.orderId, "Cancelled");
  check("an unpaid order can still be cancelled", cancel.status === 200, `got ${cancel.status}`);

  const afterCancel = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("cancelling returns the reserved stock", afterCancel === reserved + 1, `${reserved} -> ${afterCancel}`);

  const late = await webhook(
    paymentEvent("payment.failed", ctx.gatewayOrderId, `pay_${RUN}_late`, ctx.amountPaise, {
      error_code: "GATEWAY_ERROR",
      error_description: "declined by issuer",
    }),
    ev("after_cancel")
  );
  check("a failure webhook arriving after cancellation is accepted", late.status === 200, `got ${late.status}`);
  const afterLate = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("cancel plus late webhook does not credit stock twice", afterLate === afterCancel, `${afterCancel} -> ${afterLate}`);
}

// ---------------------------------------------------------------------------
console.log("\na paid order dispatches normally");
{
  const ctx = await pendingOnlineOrder("paid");
  const captured = await webhook(
    paymentEvent("payment.captured", ctx.gatewayOrderId, `pay_${RUN}_ok`, ctx.amountPaise),
    ev("paid")
  );
  check("capture accepted", captured.status === 200, `got ${captured.status}`);

  const res = await setStatus(ctx.order.orderId, "Packed");
  check("a paid online order can be packed", res.status === 200, `got ${res.status}`);
  const status = sql(`select status from orders where id = ${ctx.order.orderId}`);
  check("status moves to Packed", status === "Packed", status);
}

// ---------------------------------------------------------------------------
console.log("\ncash on delivery is unaffected");
{
  const productId = Number(sql("select id from products where stock > 3 order by id limit 1"));
  const order = await placeOrder({ productId, paymentMethod: "Cash on Delivery" });
  const res = await setStatus(order.orderId, "Packed");
  check("a cash order is packed while still unpaid, as intended", res.status === 200, `got ${res.status}`);
}

// ---------------------------------------------------------------------------
console.log("\nbulk updates hold back unpaid orders without failing the batch");
{
  const unpaid = await pendingOnlineOrder("bulk");
  const productId = Number(sql("select id from products where stock > 3 order by id limit 1"));
  const cod = await placeOrder({ productId, paymentMethod: "Cash on Delivery" });

  const res = await fetch(`${BASE}/api/orders/bulk-status`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ ids: [unpaid.order.orderId, cod.orderId], status: "Shipped" }),
  });
  const body = await res.json();

  check("the batch succeeds", res.status === 200, `got ${res.status}`);
  check("the payable order is updated", body.updated === 1, JSON.stringify(body));
  check("the unpaid order is reported as held back", body.unpaidBlocked === 1, JSON.stringify(body));
  check("the paid order really shipped", sql(`select status from orders where id = ${cod.orderId}`) === "Shipped");
  check(
    "the unpaid order is untouched",
    sql(`select status from orders where id = ${unpaid.order.orderId}`) === "Awaiting Payment"
  );
}

// ---------------------------------------------------------------------------
console.log("\ncancellation returns variant stock, not just product stock");
{
  // p.status must be 'active' and v.available true: the orders API correctly
  // refuses to sell a hidden or unavailable item, so without these filters this
  // picker can grab an unsellable product left behind by an earlier suite and
  // fail with "is no longer available" — a fault in the fixture, not the code.
  const picked = sql(
    `select v.id || ' ' || v.product_id
       from product_variants v join products p on p.id = v.product_id
      where v.stock > 2 and p.stock > 2
        and p.status = 'active' and v.available = true
      order by v.id limit 1`
  );

  if (!picked) {
    console.log("  skip — no seeded variant with stock to test against");
  } else {
    const [variantId, productId] = picked.split(" ").map(Number);
    const stocks = () =>
      nums(
        `select (select stock from products where id = ${productId}) || ' ' ||
                (select stock from product_variants where id = ${variantId})`
      );

    const before = stocks();
    const order = await placeOrder({ productId, variantId, paymentMethod: "Cash on Delivery" });

    const during = stocks();
    check("product stock is reserved", during[0] === before[0] - 1, `${before[0]} -> ${during[0]}`);
    check("variant stock is reserved", during[1] === before[1] - 1, `${before[1]} -> ${during[1]}`);

    const res = await setStatus(order.orderId, "Cancelled");
    check("the order cancels", res.status === 200, `got ${res.status}`);

    const after = stocks();
    check("product stock is returned", after[0] === before[0], `${before[0]} -> ${after[0]}`);
    check("variant stock is returned", after[1] === before[1], `expected ${before[1]}, got ${after[1]}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
