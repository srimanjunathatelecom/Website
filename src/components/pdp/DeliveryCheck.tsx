"use client";

import { useState } from "react";

type PinResult = {
  deliverable?: boolean;
  message?: string;
  error?: string;
  city?: string;
  state?: string;
  estimatedDays?: number;
  estimatedDate?: string;
  cod?: boolean;
  deliveryCharge?: number | string;
  freeDeliveryAbove?: number | string;
};

/**
 * Pincode serviceability. Every figure shown — ETA, charge, free-delivery
 * threshold, COD — comes from the `delivery_pincodes` row the admin maintains.
 * Nothing is estimated client-side, and an unknown pincode says so.
 */
export default function DeliveryCheck({ orderValue }: { orderValue: number }) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<PinResult | null>(null);

  async function check() {
    if (!/^\d{6}$/.test(pin)) {
      setStatus("err");
      setData(null);
      setMsg("Please enter a valid 6-digit pincode.");
      return;
    }
    setStatus("loading");
    setMsg("Checking serviceability…");
    try {
      const res = await fetch(`/api/pincodes?pin=${pin}`);
      const d: PinResult = await res.json();
      if (!res.ok || !d.deliverable) {
        setStatus("err");
        setData(null);
        setMsg(d.message || d.error || "We do not deliver to this pincode yet.");
        return;
      }
      setStatus("ok");
      setData(d);
      setMsg(d.message || "Delivery available.");
    } catch {
      setStatus("err");
      setData(null);
      setMsg("Could not check right now. Please try again.");
    }
  }

  const charge = data?.deliveryCharge != null ? Number(data.deliveryCharge) : null;
  const freeAbove = data?.freeDeliveryAbove != null ? Number(data.freeDeliveryAbove) : null;
  const freeByThreshold = freeAbove != null && freeAbove > 0 && orderValue >= freeAbove;
  const payableCharge = charge == null ? null : freeByThreshold ? 0 : charge;

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Check delivery</p>
      <div className="flex max-w-sm items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
        <label htmlFor="pdp-pincode" className="sr-only">
          Delivery pincode
        </label>
        <input
          id="pdp-pincode"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter 6-digit pincode"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setStatus("idle");
            setData(null);
            setMsg("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              check();
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm font-semibold text-slate-700 outline-none dark:text-slate-200"
        />
        <button
          type="button"
          onClick={check}
          disabled={status === "loading"}
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-blue-600 hover:underline disabled:opacity-50"
        >
          {status === "loading" ? "Checking…" : "Check"}
        </button>
      </div>

      <div aria-live="polite" className="mt-2 space-y-1 text-[12.5px]">
        {msg && (
          <p
            className={`font-semibold ${
              status === "err" ? "text-rose-500" : status === "ok" ? "text-emerald-600" : "text-slate-500"
            }`}
          >
            {msg}
          </p>
        )}
        {status === "ok" && data && (
          <ul className="space-y-1 text-slate-600 dark:text-slate-400">
            {(data.city || data.state) && (
              <li>
                Delivering to{" "}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {[data.city, data.state].filter(Boolean).join(", ")}
                </span>
              </li>
            )}
            {data.estimatedDate && (
              <li>
                Estimated delivery{" "}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {new Date(data.estimatedDate).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                {data.estimatedDays ? ` · ${data.estimatedDays} day${data.estimatedDays === 1 ? "" : "s"}` : ""}
              </li>
            )}
            {payableCharge != null && (
              <li>
                {payableCharge === 0 ? (
                  <span className="font-semibold text-emerald-600">Free delivery</span>
                ) : (
                  <>
                    Delivery charge{" "}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      ₹{payableCharge.toLocaleString("en-IN")}
                    </span>
                  </>
                )}
                {!freeByThreshold && freeAbove != null && freeAbove > 0 && charge != null && charge > 0 && (
                  <span> · free above ₹{freeAbove.toLocaleString("en-IN")}</span>
                )}
              </li>
            )}
            {data.cod != null && (
              <li>
                Cash on delivery{" "}
                <span className={`font-semibold ${data.cod ? "text-emerald-600" : "text-slate-500"}`}>
                  {data.cod ? "available" : "not available"}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
