"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { openCheckout } from "@/lib/payments/checkoutScript";

type PayConfig = { online: boolean; keyId: string; testMode: boolean };

/**
 * Lets a customer finish paying for an order they abandoned.
 *
 * Without this, an order that reached "Awaiting Payment" was a dead end. The
 * checkout page held the retry in React state, so closing the tab — which is
 * precisely what happens when a bank redirect goes wrong — stranded the order.
 * The customer's only route back was to rebuild their basket and order again,
 * leaving the shop with two orders and double-reserved stock.
 *
 * The order is reused rather than recreated, so the order number, its prices and
 * its stock reservation all stay as they were.
 */
export default function CompletePaymentButton({
  orderId,
  orderNo,
  amount,
  customerName,
  customerEmail,
  customerPhone,
}: {
  orderId: number;
  orderNo: string;
  amount: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<PayConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/payments/config")
      .then((r) => r.json())
      .then((d) => {
        if (active) setConfig(d);
      })
      .catch(() => {
        // Leaving config null hides the button rather than showing one that
        // cannot work.
      });
    return () => {
      active = false;
    };
  }, []);

  async function pay() {
    setErr("");
    setBusy(true);
    setLabel("Opening secure payment\u2026");

    try {
      const created = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const order = await created.json();

      if (!created.ok) {
        setErr(order.error || "Could not start the payment. Please try again.");
        setBusy(false);
        setLabel("");
        return;
      }

      // The gateway may already have the money — e.g. the payment succeeded
      // after the customer gave up, and the webhook recorded it. In that case
      // there is nothing to pay and the page just needs to catch up.
      if (order.alreadyPaid) {
        router.refresh();
        return;
      }

      await openCheckout({
        keyId: order.keyId || config?.keyId || "",
        gatewayOrderId: order.gatewayOrderId,
        amountPaise: order.amountPaise,
        currency: order.currency || "INR",
        name: order.name || "SMS Stores",
        description: `Order ${orderNo}`,
        prefill: order.prefill || { name: customerName, email: customerEmail || "", contact: customerPhone },
        onSuccess: async (result) => {
          setLabel("Confirming payment\u2026");
          const verified = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result),
          });
          if (verified.ok) {
            router.refresh();
            return;
          }
          const d = await verified.json().catch(() => ({}));
          // Deliberately not phrased as "payment failed": the money may well
          // have left the customer's account and the webhook will settle it.
          setErr(
            d.error ||
              "We couldn't confirm the payment straight away. If money has left your account, this order will update on its own within a few minutes."
          );
          setBusy(false);
          setLabel("");
        },
        onDismiss: () => {
          setBusy(false);
          setLabel("");
        },
        onFailure: (message) => {
          setErr(message || "The payment didn't go through. You can try again, or pick a different method.");
          setBusy(false);
          setLabel("");
        },
      });
    } catch {
      setErr("Couldn't reach the payment service. Please check your connection and try again.");
      setBusy(false);
      setLabel("");
    }
  }

  async function switchToCod() {
    setErr("");
    setBusy(true);
    setLabel("Switching to Cash on Delivery\u2026");
    try {
      const res = await fetch("/api/payments/switch-to-cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Could not switch this order to Cash on Delivery.");
    } catch {
      setErr("Network error. Please try again.");
    }
    setBusy(false);
    setLabel("");
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap gap-2">
        {config?.online && (
          <button
            onClick={pay}
            disabled={busy}
            aria-busy={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? label || "Working\u2026" : `Pay \u20b9${amount.toLocaleString("en-IN")} now`}
          </button>
        )}
        <button
          onClick={switchToCod}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Pay cash on delivery instead
        </button>
      </div>

      {config?.testMode && (
        <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
          Test mode — no real money will be taken.
        </p>
      )}

      {err && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          {err}
        </p>
      )}
    </div>
  );
}
