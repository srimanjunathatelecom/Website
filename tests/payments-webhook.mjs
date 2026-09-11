/**
 * Webhook and reservation test for the payment flow.
 *
 * Exercises the parts of the payment path that cannot be reached from the
 * browser and are the easiest to get wrong: signature rejection, duplicate
 * delivery, and whether an abandoned payment gives its stock back. These are
 * driven with locally-signed payloads rather than a live gateway, because the
 * behaviour under test is ours, not Razorpay's.
 *
 * Run against a seeded dev server:
 *   node tests/payments-webhook.mjs
 */

import crypto from "crypto";
import { execFileSync } from "child_process";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DB = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/sms_stores";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "localqawebhooksecret";

let pass = 0;
let fail = 0;

// Event ids are deduped permanently in the payment_events ledger, which is the
// whole point of that table. Reusing fixed ids across runs would make every run
// after the first a stream of correctly-ignored duplicates, so each run gets its
// own namespace.
const RUN = `qa${Date.now().toString(36)}`;
const ev = (name) => `evt_${RUN}_${name}`;

function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sql(query) {
  return execFileSync("psql", [DB, "-tAc", query], { encoding: "utf8" }).trim();
}

function sign(body) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

async function webhook(event, { signature, eventId } = {}) {
  const body = JSON.stringify(event);
  const headers = {
    "Content-Type": "application/json",
    "x-razorpay-signature": signature ?? sign(body),
  };
  if (eventId) headers["x-razorpay-event-id"] = eventId;
  const res = await fetch(`${BASE}/api/payments/webhook`, { method: "POST", headers, body });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function capturedEvent(gatewayOrderId, gatewayPaymentId, amountPaise) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: gatewayPaymentId,
          order_id: gatewayOrderId,
          amount: amountPaise,
          amount_refunded: 0,
          currency: "INR",
          status: "captured",
          method: "upi",
          error_code: null,
          error_description: null,
          captured: true,
        },
      },
    },
  };
}

// Registration is deliberately rate limited to 5 per hour per IP, so the suite
// creates exactly two customers up front and reuses them. Two are needed
// because the ownership checks require a genuine second account.
let seq = 0;

async function signUp(label) {
  seq += 1;
  const unique = `${Date.now().toString().slice(-7)}${String(seq).padStart(2, "0")}`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `WH ${label}`,
      email: `wh_${label}_${unique}@test.local`,
      phone: `9${unique.slice(-9).padStart(9, "0")}`,
      password: "TestPass#123",
    }),
  });
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) {
    throw new Error(
      `could not create test customer "${label}": ${JSON.stringify(await res.json().catch(() => ({})))}. ` +
        `Registration is rate limited to 5/hour per IP — restart the dev server to clear it.`
    );
  }
  return cookie;
}

const buyer = await signUp("buyer");
const stranger = await signUp("stranger");

/** Place an awaiting-payment order and stand up its payment row. */
async function makePendingOrder(label, cookie = buyer) {
  const productId = Number(sql("select id from products where stock > 3 order by id limit 1"));
  const stockBefore = Number(sql(`select stock from products where id = ${productId}`));

  const orderRes = await fetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },

    body: JSON.stringify({
      items: [{ productId, qty: 1 }],
      address: { line: "12 MG Road", city: "Bengaluru", pincode: "560001" },
      paymentMethod: "Razorpay",
    }),
  });
  const order = await orderRes.json();
  if (!order.orderId) throw new Error(`order creation failed for ${label}: ${JSON.stringify(order)}`);

  // The real /api/payments/create call would need live gateway credentials, so
  // the gateway order handle is inserted directly. Everything downstream of
  // this point is our own code and is what's actually under test.
  const gatewayOrderId = `order_TEST${label}${Date.now()}`;
  const amountPaise = Math.round(Number(sql(`select total_mop from orders where id = ${order.orderId}`)) * 100);
  sql(
    `insert into payments (order_id, gateway, gateway_order_id, amount_paise, status)
     values (${order.orderId}, 'razorpay', '${gatewayOrderId}', ${amountPaise}, 'created')`
  );
  const paymentRowId = Number(sql(`select id from payments where gateway_order_id = '${gatewayOrderId}'`));

  return { cookie, order, productId, stockBefore, gatewayOrderId, amountPaise, paymentRowId };
}

console.log("\npayment webhook + reservation tests\n");

// ---------------------------------------------------------------------------
console.log("signature enforcement");
{
  const ctx = await makePendingOrder("sig");
  const res = await webhook(capturedEvent(ctx.gatewayOrderId, "pay_forged", ctx.amountPaise), {
    signature: "deadbeef".repeat(8),
  });
  check("forged signature is rejected", res.status === 400, `got ${res.status}`);
  const status = sql(`select payment_status from orders where id = ${ctx.order.orderId}`);
  check("forged webhook does not mark the order paid", status === "pending", `payment_status=${status}`);

  const res2 = await webhook(capturedEvent(ctx.gatewayOrderId, "pay_nosig", ctx.amountPaise), { signature: "" });
  check("missing signature is rejected", res2.status === 400, `got ${res2.status}`);
}

// ---------------------------------------------------------------------------
console.log("\ncapture");
{
  const ctx = await makePendingOrder("cap");
  const orderStatusBefore = sql(`select status from orders where id = ${ctx.order.orderId}`);
  check("online order waits at Awaiting Payment", orderStatusBefore === "Awaiting Payment", orderStatusBefore);

  const stockReserved = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("stock is reserved before payment", stockReserved === ctx.stockBefore - 1, `${ctx.stockBefore} -> ${stockReserved}`);

  const res = await webhook(capturedEvent(ctx.gatewayOrderId, "pay_cap1", ctx.amountPaise), { eventId: ev("cap_1") });
  check("valid capture is accepted", res.status === 200, `got ${res.status}`);

  const row = sql(
    `select payment_status || '|' || status || '|' || (paid_at is not null) from orders where id = ${ctx.order.orderId}`
  );
  check("order becomes paid and Placed", row === "paid|Placed|true", row);

  const pay = sql(`select status || '|' || method from payments where id = ${ctx.paymentRowId}`);
  check("payment row records capture and method", pay === "captured|upi", pay);

  // Duplicate delivery of the same event.
  const dup = await webhook(capturedEvent(ctx.gatewayOrderId, "pay_cap1", ctx.amountPaise), { eventId: ev("cap_1") });
  check("duplicate event is acknowledged", dup.status === 200, `got ${dup.status}`);
  check("duplicate event is recognised as a duplicate", dup.json.note === "duplicate", JSON.stringify(dup.json));

  const events = Number(sql(`select count(*) from payment_events where event_id = '${ev("cap_1")}'`));
  check("event ledger holds exactly one row", events === 1, `count=${events}`);

  const stockAfter = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("paid order does not release stock", stockAfter === ctx.stockBefore - 1, `${stockAfter}`);

  // A late payment.failed for an earlier attempt must not un-pay a paid order.
  const late = await webhook(
    {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_cap1",
            order_id: ctx.gatewayOrderId,
            amount: ctx.amountPaise,
            amount_refunded: 0,
            currency: "INR",
            status: "failed",
            method: "card",
            error_code: "BAD_REQUEST_ERROR",
            error_description: "late failure for an earlier attempt",
            captured: false,
          },
        },
      },
    },
    { eventId: ev("late_fail") }
  );
  check("late failure event is acknowledged", late.status === 200, `got ${late.status}`);
  const stillPaid = sql(`select payment_status from orders where id = ${ctx.order.orderId}`);
  check("late failure does not un-pay a paid order", stillPaid === "paid", stillPaid);
  const stockStill = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("late failure does not release stock of a paid order", stockStill === ctx.stockBefore - 1, `${stockStill}`);
}

// ---------------------------------------------------------------------------
console.log("\nfailure releases the reservation");
{
  const ctx = await makePendingOrder("fail");
  const reserved = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("stock reserved", reserved === ctx.stockBefore - 1, `${reserved}`);

  const failEvent = {
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_fail1",
          order_id: ctx.gatewayOrderId,
          amount: ctx.amountPaise,
          amount_refunded: 0,
          currency: "INR",
          status: "failed",
          method: "card",
          error_code: "GATEWAY_ERROR",
          error_description: "card declined by issuer",
          captured: false,
        },
      },
    },
  };

  const res = await webhook(failEvent, { eventId: ev("fail_1") });
  check("failure event accepted", res.status === 200, `got ${res.status}`);

  const stockBack = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("stock is returned on failure", stockBack === ctx.stockBefore, `expected ${ctx.stockBefore}, got ${stockBack}`);

  const payRow = sql(`select status || '|' || error_code from payments where id = ${ctx.paymentRowId}`);
  check("failure reason is recorded", payRow === "failed|GATEWAY_ERROR", payRow);

  // Second delivery of the same failure must not credit stock twice.
  const dup = await webhook(failEvent, { eventId: ev("fail_1") });
  check("duplicate failure acknowledged", dup.status === 200 && dup.json.note === "duplicate", JSON.stringify(dup.json));
  const stockUnchanged = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("duplicate failure does not double-credit stock", stockUnchanged === ctx.stockBefore, `${stockUnchanged}`);

  // And a *different* event id for the same payment must also not double-credit,
  // because the stock release itself is claimed, not just the event.
  const dup2 = await webhook(failEvent, { eventId: ev("fail_2") });
  check("second distinct failure event accepted", dup2.status === 200, `got ${dup2.status}`);
  const stockStill = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("stock release is claimed once regardless of event id", stockStill === ctx.stockBefore, `${stockStill}`);
}

// ---------------------------------------------------------------------------
console.log("\nswitch to cash on delivery");
{
  const ctx = await makePendingOrder("cod");
  const reserved = Number(sql(`select stock from products where id = ${ctx.productId}`));

  const res = await fetch(`${BASE}/api/payments/switch-to-cod`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: ctx.cookie },
    body: JSON.stringify({ orderId: ctx.order.orderId }),
  });
  check("switch to COD succeeds", res.status === 200, `got ${res.status}`);

  const row = sql(`select payment_method || '|' || status from orders where id = ${ctx.order.orderId}`);
  check("order becomes a placed COD order", row === "Cash on Delivery|Placed", row);

  const stockAfter = Number(sql(`select stock from products where id = ${ctx.productId}`));
  check("reservation is kept by the COD order", stockAfter === reserved, `${reserved} -> ${stockAfter}`);

  const payStatus = sql(`select status from payments where id = ${ctx.paymentRowId}`);
  check("the abandoned gateway attempt is closed out", payStatus === "cancelled", payStatus);

  // The reconciler must not later decide this attempt was abandoned and
  // release stock out from under a live COD order.
  const released = sql(`select stock_released_at is not null from payments where id = ${ctx.paymentRowId}`);
  check("attempt is marked as accounted for", released === "t", released);
}

// ---------------------------------------------------------------------------
console.log("\nownership (IDOR)");
{
  const mine = await makePendingOrder("own1", buyer);
  const other = { cookie: stranger };

  const res = await fetch(`${BASE}/api/payments/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: other.cookie },
    body: JSON.stringify({ orderId: mine.order.orderId }),
  });
  check("cannot open a payment on another customer's order", res.status === 404, `got ${res.status}`);

  const res2 = await fetch(`${BASE}/api/payments/switch-to-cod`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: other.cookie },
    body: JSON.stringify({ orderId: mine.order.orderId }),
  });
  check("cannot convert another customer's order to COD", res2.status === 404, `got ${res2.status}`);

  const res3 = await fetch(`${BASE}/api/payments/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: other.cookie },
    body: JSON.stringify({ razorpay_order_id: mine.gatewayOrderId, failed: true }),
  });
  check("cannot cancel another customer's payment", res3.status === 404, `got ${res3.status}`);

  const res4 = await fetch(`${BASE}/api/payments/reconcile`, { method: "POST", headers: { cookie: other.cookie } });
  check("reconcile is admin-only", res4.status === 401, `got ${res4.status}`);

  // The reconciler also accepts a scheduler holding CRON_SECRET, so that branch
  // needs the same scrutiny as the session one: a secret that can be guessed,
  // or that is skipped entirely when absent, would expose every customer's
  // payment state and let anyone burn the merchant's gateway rate limit.
  const res5 = await fetch(`${BASE}/api/payments/reconcile`, {
    method: "POST",
    headers: { authorization: "Bearer definitely-not-the-cron-secret" },
  });
  check("reconcile rejects a wrong scheduler secret", res5.status === 401, `got ${res5.status}`);

  const res6 = await fetch(`${BASE}/api/payments/reconcile`, { method: "POST", headers: { authorization: "Bearer " } });
  check("reconcile rejects an empty scheduler secret", res6.status === 401, `got ${res6.status}`);
}

// ---------------------------------------------------------------------------
console.log("\nforged success from the browser");
{
  const ctx = await makePendingOrder("forge");
  const res = await fetch(`${BASE}/api/payments/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: ctx.cookie },
    body: JSON.stringify({
      razorpay_order_id: ctx.gatewayOrderId,
      razorpay_payment_id: "pay_iMadeThisUp",
      razorpay_signature: "00".repeat(32),
    }),
  });
  check("forged payment signature is rejected", res.status === 400, `got ${res.status}`);
  const status = sql(`select payment_status from orders where id = ${ctx.order.orderId}`);
  check("forged verify does not mark the order paid", status === "pending", status);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
