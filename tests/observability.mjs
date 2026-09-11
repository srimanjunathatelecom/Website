/**
 * Error reporting — that it captures, and that it doesn't leak.
 *
 * Two things are being checked here, and the second matters more than the first.
 *
 * Capture: errors used to be discarded. Sixteen catch blocks under src/app/api
 * were written `} catch {`, so the error object was gone before anything could
 * report it. The ones that returned 500 now report first.
 *
 * Redaction: a reporting pipeline is one of the classic ways credentials escape a
 * system — the message goes to stderr, to a log vendor, and to whatever
 * ERROR_WEBHOOK_URL points at. Error messages in this app can contain the
 * database URL with its password inline, Razorpay keys and HMAC signatures. So
 * these assertions push exactly those values through the reporter and check they
 * come out unreadable, which is the sort of thing that is easy to get right today
 * and quietly break in six months.
 *
 * The module is TypeScript, so it's transpiled in memory the same way
 * scripts/check-env.mjs does, rather than duplicating the rules in a fixture.
 *
 * Run:  node tests/observability.mjs
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import ts from "typescript";

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

/** Transpile and load src/lib/observability.ts as an ES module. */
async function loadModule() {
  const source = readFileSync("src/lib/observability.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

/** Capture what the reporter writes, so assertions can read the emitted record. */
function captureConsole() {
  const lines = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => lines.push(args.join(" "));
  console.warn = (...args) => lines.push(args.join(" "));
  return {
    lines,
    restore() {
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

function lastReport(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.observability) return parsed.observability;
    } catch {
      /* not a structured line */
    }
  }
  return null;
}

async function main() {
  const { reportError, reportWarning } = await loadModule();

  // -----------------------------------------------------------------------
  // It emits a structured, parseable record.
  // -----------------------------------------------------------------------
  {
    const cap = captureConsole();
    reportError(new TypeError("something went wrong"), "api/test", { orderId: 42 });
    cap.restore();

    const report = lastReport(cap.lines);
    ok(report !== null, "the report is emitted as a single parseable JSON line");
    if (report) {
      eq(report.severity, "error", "severity is recorded");
      eq(report.name, "TypeError", "the error class is preserved");
      eq(report.message, "something went wrong", "the message is preserved");
      eq(report.scope, "api/test", "the scope identifies where it happened");
      eq(report.context.orderId, 42, "caller context is carried through");
      ok(typeof report.stack === "string" && report.stack.length > 0, "the stack is included");
      ok(typeof report.timestamp === "string", "the record is timestamped");
    }
  }

  // -----------------------------------------------------------------------
  // Credentials must not survive a round trip.
  // -----------------------------------------------------------------------
  {
    const cap = captureConsole();
    reportError(
      new Error(
        "connect failed for postgresql://admin:sup3rsecret@db.internal:5432/shop " +
          "using key rzp_live_ABC123xyz and header Bearer eyJhbGciOi.JzdWIiOiIx.abc-def_123 " +
          "signature 4f2a9c8e1b7d6a3f5e2c9b8a7d6f5e4c3b2a1908"
      ),
      "api/test"
    );
    cap.restore();
    const report = lastReport(cap.lines);
    const message = report?.message ?? "";

    ok(!message.includes("sup3rsecret"), "a database password in an error message is redacted");
    ok(!message.includes("db.internal"), "the database host goes with it");
    ok(!message.includes("rzp_live_ABC123xyz"), "a live Razorpay key is redacted");
    ok(!message.includes("eyJhbGciOi.JzdWIiOiIx.abc-def_123"), "a bearer token is redacted");
    ok(!message.includes("4f2a9c8e1b7d6a3f5e2c9b8a7d6f5e4c3b2a1908"), "a long hex signature is redacted");
    // The point is a usable report, not an empty one.
    ok(message.includes("connect failed"), "the non-sensitive part of the message survives");
  }

  // -----------------------------------------------------------------------
  // Sensitive context keys are dropped by name, whatever they contain.
  // -----------------------------------------------------------------------
  {
    const cap = captureConsole();
    reportError(new Error("boom"), "api/test", {
      password: "hunter2",
      webhookSecret: "whsec_abc",
      sessionToken: "tok_123",
      authorization: "anything",
      cardNumber: "4111111111111111",
      orderId: 7,
      email: "shopper@example.com",
    });
    cap.restore();
    const context = lastReport(cap.lines)?.context ?? {};

    eq(context.password, "[redacted]", "a password context value is redacted");
    eq(context.webhookSecret, "[redacted]", "a webhook secret is redacted");
    eq(context.sessionToken, "[redacted]", "a session token is redacted");
    eq(context.authorization, "[redacted]", "an authorization value is redacted");
    eq(context.cardNumber, "[redacted]", "a card number is redacted");
    ok("password" in context, "the key is kept, so you can still tell it was present");
    eq(context.orderId, 7, "harmless context is untouched");
  }

  // -----------------------------------------------------------------------
  // Grouping: the same bug must read as one problem, different bugs as two.
  // -----------------------------------------------------------------------
  {
    const cap = captureConsole();
    function throwFrom(id) {
      return new Error(`order ${id} failed`);
    }
    reportError(throwFrom(1), "api/orders");
    const first = lastReport(cap.lines).fingerprint;
    reportError(throwFrom(2), "api/orders");
    const second = lastReport(cap.lines).fingerprint;
    reportError(new RangeError("entirely different"), "api/orders");
    const third = lastReport(cap.lines).fingerprint;
    cap.restore();

    eq(first, second, "the same fault with a different id groups together");
    ok(first !== third, "an unrelated fault groups separately");
  }

  // -----------------------------------------------------------------------
  // It must never throw. It runs inside catch blocks.
  // -----------------------------------------------------------------------
  {
    const cap = captureConsole();
    let threw = false;
    try {
      reportError(undefined, "api/test");
      reportError(null, "api/test");
      reportError("a bare string", "api/test");
      reportError({ weird: true }, "api/test");
      // A circular object defeats JSON.stringify, the obvious way to crash this.
      const circular = {};
      circular.self = circular;
      reportError(circular, "api/test");
      // A value whose own toString throws.
      reportError(
        {
          get message() {
            throw new Error("nope");
          },
        },
        "api/test"
      );
      reportWarning("plain warning", "api/test");
    } catch {
      threw = true;
    }
    cap.restore();
    ok(!threw, "reporting never throws, whatever it is handed");
  }

  // -----------------------------------------------------------------------
  // Webhook delivery, against a real listener.
  // -----------------------------------------------------------------------
  {
    const received = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(body);
        res.writeHead(200).end("ok");
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    process.env.ERROR_WEBHOOK_URL = `http://127.0.0.1:${port}/alert`;

    const cap = captureConsole();
    reportError(new Error("payment capture failed for postgresql://u:pw@h/db"), "api/payments/webhook", {
      eventId: "evt_1",
    });
    cap.restore();

    // Delivery is deliberately not awaited, so give the socket a moment.
    await new Promise((r) => setTimeout(r, 400));

    ok(received.length === 1, "the report is delivered to ERROR_WEBHOOK_URL");
    if (received.length) {
      const payload = JSON.parse(received[0]);
      ok(typeof payload.text === "string" && payload.text.length > 0, "the payload has the `text` Slack requires");
      ok(payload.text.includes("api/payments/webhook"), "the alert text says where it happened");
      eq(payload.context.eventId, "evt_1", "structured fields travel alongside for other collectors");
      ok(!received[0].includes("pw@h"), "credentials are redacted before leaving the process");
    }

    // Repeat suppression: 3 per 5 minutes per distinct fault.
    //
    // Measured from a baseline rather than against a total, because the
    // fingerprint includes the top stack frame: the report above came from a
    // different line, so it counts as a different fault with its own allowance.
    // That is the intended behaviour — one message raised from two call sites is
    // two problems — but it makes an absolute total the wrong thing to assert.
    const deliveredBefore = received.length;
    const cap2 = captureConsole();
    for (let i = 0; i < 8; i++) {
      reportError(new Error("payment capture failed for postgresql://u:pw@h/db"), "api/payments/webhook", {
        eventId: "evt_1",
      });
    }
    cap2.restore();
    await new Promise((r) => setTimeout(r, 500));

    const deliveredByLoop = received.length - deliveredBefore;
    eq(deliveredByLoop, 3, "8 occurrences of one fault deliver only the 3 allowed in the window");
    // Suppression must not suppress the log — only the alert.
    ok(cap2.lines.filter((l) => l.includes("observability")).length === 8, "every occurrence is still logged");

    delete process.env.ERROR_WEBHOOK_URL;
    server.close();
  }

  // -----------------------------------------------------------------------
  // No webhook configured must be a no-op, not an error.
  // -----------------------------------------------------------------------
  {
    const cap = captureConsole();
    let threw = false;
    try {
      reportError(new Error("no webhook set"), "api/test");
    } catch {
      threw = true;
    }
    cap.restore();
    ok(!threw, "reporting works with no ERROR_WEBHOOK_URL configured");
    ok(lastReport(cap.lines) !== null, "and still writes the record to stderr");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
