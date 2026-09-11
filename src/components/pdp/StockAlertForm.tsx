"use client";

import { useState } from "react";

/**
 * "Notify me when it's back" box, shown only while the selected item is out
 * of stock. Posts to /api/stock-alerts; the customer gets exactly one email
 * when the product (or the specific variant they had selected) is restocked.
 *
 * The hidden `website` field is the same honeypot used by the contact and
 * newsletter forms — bots fill it, humans never see it.
 */
export default function StockAlertForm({ productId, variantId }: { productId: number; variantId?: number }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, variantId, email, website }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setDone(json.message || "You'll get one email when it's back.");
      } else {
        setError(json.error || "Could not save your alert. Please try again.");
      }
    } catch {
      setError("Could not save your alert. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        {done}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200">Get notified when it&apos;s back</p>
      <p className="mt-0.5 text-[12px] font-medium text-slate-500 dark:text-slate-400">
        Leave your email and we&apos;ll send one message when this item is restocked.
      </p>
      {/* Honeypot — hidden from humans, bots fill it and get a fake success. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="mt-2.5 flex items-stretch gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for back-in-stock alert"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {busy ? "Saving…" : "Notify me"}
        </button>
      </div>
      <p aria-live="polite" className="min-h-[16px] pt-1 text-[12px] font-semibold text-rose-500">{error}</p>
    </form>
  );
}
