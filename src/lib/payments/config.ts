/**
 * Payment configuration and the vocabulary of payment methods.
 *
 * Two rules drive everything in this file:
 *
 * 1. Secrets never appear in code, and never reach the browser. The key id is
 *    public by design (the gateway's checkout script needs it), but it is
 *    served from an API route rather than baked in with a NEXT_PUBLIC_ prefix,
 *    so rotating a key doesn't require a rebuild and redeploy.
 *
 * 2. If the gateway isn't configured, online payment does not exist as far as
 *    the customer is concerned. It is not shown as a disabled button or a
 *    "coming soon" option that fails on click — an unconfigured deploy simply
 *    offers Cash on Delivery, which genuinely works. A payment button that
 *    throws is worse than no payment button.
 */

/** Payment methods the server will accept. Anything else is rejected. */
export const PAYMENT_METHODS = {
  COD: "Cash on Delivery",
  RAZORPAY: "Razorpay",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

const ALLOWED: readonly string[] = Object.values(PAYMENT_METHODS);

/**
 * Validate a client-supplied payment method.
 *
 * This matters more than it looks. The order endpoint previously wrote
 * `String(body.paymentMethod || "Cash on Delivery")` straight into the
 * orders table, so a customer could POST `paymentMethod: "Paid in full via
 * UPI"` and the admin's order list would show exactly that, with no money
 * having moved. Free-text from the client became a business record. Only
 * values this shop actually supports are allowed through now.
 */
export function normalizePaymentMethod(input: unknown): PaymentMethod | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return PAYMENT_METHODS.COD;
  const match = ALLOWED.find((m) => m.toLowerCase() === trimmed.toLowerCase());
  return (match as PaymentMethod) || null;
}

/** True when this method settles through the online gateway rather than cash. */
// Accepts the raw column type rather than the narrowed union, because every
// real caller is testing a value read back from the database, where the column
// is nullable and older rows predate the payment work.
export function isOnlineMethod(method: string | null | undefined): boolean {
  return method === PAYMENT_METHODS.RAZORPAY;
}

/** Server-only gateway credentials. Never return this to a client. */
export function razorpaySecrets() {
  return {
    keyId: (process.env.RAZORPAY_KEY_ID || "").trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET || "").trim(),
    webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim(),
  };
}

/**
 * Whether online payment is live on this deploy.
 *
 * Requires both halves of the API key. The webhook secret is checked
 * separately by `webhookConfigured` because a deploy can legitimately take
 * payments before webhooks are wired up — the client-side verify handler
 * covers the happy path, and webhooks are what make the unhappy paths
 * (customer closes the tab after paying) self-heal.
 */
export function paymentsConfigured(): boolean {
  const { keyId, keySecret } = razorpaySecrets();
  return Boolean(keyId && keySecret);
}

/** Whether webhook signature verification can be performed. */
export function webhookConfigured(): boolean {
  return Boolean(razorpaySecrets().webhookSecret);
}

/**
 * Test-mode detection. Razorpay test keys are prefixed `rzp_test_`. Surfaced
 * in the checkout UI so nobody mistakes a sandbox deploy for a live one and
 * ships a store that cannot actually be paid.
 */
export function isTestMode(): boolean {
  return razorpaySecrets().keyId.startsWith("rzp_test_");
}

/** Payment methods a customer may choose on this deploy, in display order. */
export function availablePaymentMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  if (paymentsConfigured()) methods.push(PAYMENT_METHODS.RAZORPAY);
  methods.push(PAYMENT_METHODS.COD);
  return methods;
}

/**
 * Rupees (as stored in the numeric columns) to paise, which is the only unit
 * the gateway accepts.
 *
 * `Math.round` is deliberate rather than a truncation: 1499.99 * 100 is
 * 149998.99999999999 in IEEE-754 doubles, and `Math.trunc` would silently
 * undercharge by a paisa. Over thousands of orders that is a real,
 * unexplainable gap between the store's totals and the gateway's.
 */
export function toPaise(rupees: number | string): number {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Paise back to rupees, for display and for writing to numeric columns. */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}
