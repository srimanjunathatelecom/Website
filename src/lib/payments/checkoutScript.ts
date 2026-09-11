/**
 * Loader for the gateway's hosted checkout script.
 *
 * Client-side only, and deliberately contains no configuration: the key id
 * arrives from /api/payments/config at runtime. Nothing secret is imported
 * here, so this module is safe in a browser bundle.
 *
 * The script is fetched on demand rather than included in the site's <head>.
 * A payment SDK loaded on every page view is roughly 100 KB of JavaScript that
 * the overwhelming majority of visitors — anyone browsing but not buying —
 * downloads, parses and never uses. Loading it when the customer chooses to
 * pay costs a few hundred milliseconds once, at a moment when they expect
 * something to happen, and keeps it off the critical path everywhere else.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Resolves once, then reused — a second checkout attempt must not re-inject. */
let loader: Promise<boolean> | null = null;

export function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  // Already available, either from a previous attempt in this session or
  // because the script was cached by the browser.
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve(true);
  if (loader) return loader;

  loader = new Promise<boolean>((resolve) => {
    // Reuse a tag that's already in flight rather than adding a second one.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const el = existing || document.createElement("script");

    const done = (ok: boolean) => {
      // Reset on failure so a retry can attempt the load again. Leaving a
      // rejected promise cached would mean one flaky network moment
      // permanently disables online payment for the rest of the session.
      if (!ok) loader = null;
      resolve(ok);
    };

    el.addEventListener("load", () => done(true), { once: true });
    el.addEventListener("error", () => done(false), { once: true });

    if (!existing) {
      el.src = SCRIPT_SRC;
      el.async = true;
      document.body.appendChild(el);
    }
  });

  return loader;
}

/** Shape of the fields the gateway hands back on a successful payment. */
export type CheckoutSuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type OpenArgs = {
  keyId: string;
  gatewayOrderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  onSuccess: (r: CheckoutSuccess) => void;
  /** Fired when the customer closes the sheet without completing payment. */
  onDismiss: () => void;
  onFailure: (reason: string) => void;
};

type RazorpayCtor = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (event: string, cb: (payload: unknown) => void) => void;
};

/**
 * Open the gateway's payment sheet.
 *
 * Note the deliberate absence of any amount arithmetic here. The amount and
 * the gateway order both come from the server, which computed them from
 * database prices. Passing a client-side total would make the displayed
 * amount trivially editable in devtools.
 */
export async function openCheckout(args: OpenArgs): Promise<void> {
  const ok = await loadCheckoutScript();
  if (!ok) {
    args.onFailure("Could not reach the payment provider. Please check your connection and try again.");
    return;
  }

  const Ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (!Ctor) {
    args.onFailure("The payment provider could not be started. Please try again.");
    return;
  }

  const rzp = new Ctor({
    key: args.keyId,
    order_id: args.gatewayOrderId,
    amount: args.amountPaise,
    currency: args.currency,
    name: args.name,
    description: args.description,
    prefill: args.prefill,
    theme: { color: "#2563eb" },
    // Closing the sheet is not an error, but it does need handling: the order
    // is sitting in Awaiting Payment holding stock, and the customer needs to
    // be told they can retry rather than left on a spinner.
    modal: { ondismiss: () => args.onDismiss(), escape: true, confirm_close: true },
    handler: (r: CheckoutSuccess) => args.onSuccess(r),
  });

  // Card declines and bank failures surface here rather than through the
  // handler. Without this the sheet closes and `ondismiss` fires, which would
  // report a declined card as "you cancelled" — confusing, and it hides a real
  // problem the customer needs to act on.
  rzp.on("payment.failed", (payload: unknown) => {
    const description =
      (payload as { error?: { description?: string } } | null)?.error?.description ||
      "The payment was declined.";
    args.onFailure(description);
  });

  rzp.open();
}
