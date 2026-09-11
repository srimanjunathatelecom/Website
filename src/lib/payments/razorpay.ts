/**
 * Razorpay REST client and signature verification.
 *
 * Implemented directly against the documented REST API with `fetch` and
 * node's built-in `crypto`, rather than pulling in the `razorpay` npm SDK.
 * The SDK is a thin wrapper over these same four HTTP calls plus an HMAC, and
 * adding a dependency to a payment path means one more package that can be
 * compromised in a supply-chain attack, one more thing to keep patched, and
 * one more thing between a bug and its explanation. There is nothing here
 * that benefits from abstraction.
 *
 * Everything in this module is server-only. It reads the key secret, so
 * importing it from a client component would leak credentials into the
 * browser bundle.
 */

import crypto from "crypto";
import { razorpaySecrets } from "./config";

const API_BASE = "https://api.razorpay.com/v1";

/** How long to wait on the gateway before giving up. */
const TIMEOUT_MS = 15_000;

export class PaymentGatewayError extends Error {
  readonly status: number;
  readonly gatewayCode: string;
  /**
   * True when retrying the identical request could plausibly succeed —
   * network blips, timeouts, gateway 5xx. A rejected card is *not* retryable
   * and the caller must not loop on it.
   */
  readonly retryable: boolean;

  constructor(message: string, opts: { status?: number; gatewayCode?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "PaymentGatewayError";
    this.status = opts.status ?? 0;
    this.gatewayCode = opts.gatewayCode ?? "";
    this.retryable = opts.retryable ?? false;
  }
}

function authHeader(): string {
  const { keyId, keySecret } = razorpaySecrets();
  if (!keyId || !keySecret) {
    throw new PaymentGatewayError("Online payment is not configured on this server.");
  }
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
  };
  // Razorpay honours this header on order and refund creation. Without it, a
  // client that times out and retries can create two gateway orders (or worse,
  // two refunds) for one cart.
  if (idempotencyKey) headers["X-Razorpay-Idempotency-Key"] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    // A timeout here is genuinely ambiguous: the gateway may have created the
    // order anyway. Marked retryable, and callers pass an idempotency key so
    // the retry cannot double-charge.
    const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "could not be reached";
    throw new PaymentGatewayError(`The payment gateway ${reason}. Please try again.`, { retryable: true });
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Razorpay serves HTML on some infrastructure errors; don't crash on it.
  }

  if (!res.ok) {
    const err = (parsed as { error?: { code?: string; description?: string } } | null)?.error;
    // Never surface the gateway's raw description to the customer verbatim —
    // it sometimes contains internal identifiers. Log it, show a clean message.
    console.error("razorpay api error", { path, status: res.status, code: err?.code, description: err?.description });
    throw new PaymentGatewayError(
      res.status >= 500
        ? "The payment gateway is temporarily unavailable. Please try again in a moment."
        : "The payment could not be processed. Please try again or choose Cash on Delivery.",
      { status: res.status, gatewayCode: err?.code || "", retryable: res.status >= 500 || res.status === 429 }
    );
  }

  return parsed as T;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
};

export type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string;
  error_code: string | null;
  error_description: string | null;
  captured: boolean;
};

/**
 * Create a gateway order.
 *
 * `receipt` carries our own order number so a row in the Razorpay dashboard
 * can be traced back to a row in our orders table without a lookup table.
 * `payment_capture: 1` asks the gateway to capture automatically on a
 * successful authorization — a two-step auth-then-capture flow buys this shop
 * nothing and introduces a state where the customer's money is held but the
 * order is not paid.
 */
export function createGatewayOrder(args: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
  idempotencyKey: string;
}): Promise<RazorpayOrder> {
  return call<RazorpayOrder>(
    "POST",
    "/orders",
    {
      amount: args.amountPaise,
      currency: args.currency || "INR",
      receipt: args.receipt.slice(0, 40),
      payment_capture: 1,
      notes: args.notes || {},
    },
    args.idempotencyKey
  );
}

/** Fetch the authoritative state of a payment. Used by reconciliation. */
export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

/** Fetch a gateway order, including whether it has been paid. */
export function fetchGatewayOrder(orderId: string): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("GET", `/orders/${encodeURIComponent(orderId)}`);
}

/** List payment attempts against a gateway order. */
export async function fetchGatewayOrderPayments(orderId: string): Promise<RazorpayPayment[]> {
  const res = await call<{ items?: RazorpayPayment[] }>(
    "GET",
    `/orders/${encodeURIComponent(orderId)}/payments`
  );
  return res?.items || [];
}

/** Issue a refund. Amount omitted means a full refund. */
export function refundPayment(args: {
  paymentId: string;
  amountPaise?: number;
  idempotencyKey: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; status: string }> {
  return call(
    "POST",
    `/payments/${encodeURIComponent(args.paymentId)}/refund`,
    {
      ...(args.amountPaise ? { amount: args.amountPaise } : {}),
      notes: args.notes || {},
      speed: "normal",
    },
    args.idempotencyKey
  );
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `a === b` on a signature is a timing oracle: string comparison exits at the
 * first differing byte, so an attacker can measure how long a guess survived
 * and recover the expected signature byte by byte. `timingSafeEqual` always
 * reads both buffers fully. The length check first is required because
 * `timingSafeEqual` throws on mismatched lengths rather than returning false.
 */
function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verify the signature the browser hands back after a successful checkout.
 *
 * This is the single most security-critical function in the payment flow. The
 * browser is not trustworthy: without this check, anyone could POST a made-up
 * `razorpay_payment_id` to the verify endpoint and have their order marked
 * paid. The signature is an HMAC-SHA256 of `order_id|payment_id` keyed with
 * the API secret, which only the gateway and this server know.
 */
export function verifyCheckoutSignature(args: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = razorpaySecrets();
  if (!keySecret) return false;
  if (!args.gatewayOrderId || !args.gatewayPaymentId || !args.signature) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${args.gatewayOrderId}|${args.gatewayPaymentId}`)
    .digest("hex");
  return safeEqualHex(expected, args.signature);
}

/**
 * Verify a webhook delivery.
 *
 * Keyed with the *webhook* secret, which is a different value from the API
 * key secret, and computed over the exact raw request body. It must be the
 * raw bytes — re-serializing the parsed JSON reorders keys and changes
 * whitespace, and the HMAC will never match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const { webhookSecret } = razorpaySecrets();
  if (!webhookSecret || !signature) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
