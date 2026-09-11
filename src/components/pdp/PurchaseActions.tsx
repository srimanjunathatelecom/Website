"use client";

export type PurchaseState = {
  qty: number;
  maxQty: number;
  setQty: (n: number) => void;
  /** Blocking reason, e.g. out of stock or an unavailable combination. */
  blockedReason: string;
  busy: "" | "cart" | "buy";
  added: boolean;
  error: string;
  price: number;
  onAdd: () => void;
  onBuy: () => void;
};

export function QuantitySelector({ qty, maxQty, setQty, disabled }: {
  qty: number;
  maxQty: number;
  setQty: (n: number) => void;
  disabled?: boolean;
}) {
  const canDec = !disabled && qty > 1;
  const canInc = !disabled && qty < maxQty;
  return (
    <div className="flex items-center gap-3">
      <span id="pdp-qty-label" className="text-sm font-bold text-slate-700 dark:text-slate-300">
        Quantity
      </span>
      <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setQty(qty - 1)}
          disabled={!canDec}
          aria-label="Decrease quantity"
          className="grid h-9 w-9 place-items-center rounded-l-xl text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14" strokeLinecap="round" /></svg>
        </button>
        <span
          aria-live="polite"
          aria-labelledby="pdp-qty-label"
          className="min-w-9 px-2 text-center text-sm font-bold text-slate-900 dark:text-white"
        >
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty(qty + 1)}
          disabled={!canInc}
          aria-label="Increase quantity"
          className="grid h-9 w-9 place-items-center rounded-r-xl text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </button>
      </div>
      {/* Scarcity note. Suppressed while the selector is disabled: an
          out-of-stock variant clamps maxQty to 1, which previously rendered
          "Only 1 left" directly beside "Out of stock" and "Unavailable" —
          three contradictory stock claims in one panel. */}
      {!disabled && maxQty > 0 && maxQty <= 5 && (
        <span className="text-[12px] font-semibold text-orange-700 dark:text-orange-400">
          Only {maxQty} left
        </span>
      )}
    </div>
  );
}

/**
 * Add to Cart / Buy Now pair. Both buttons are disabled while a request is in
 * flight, which is what prevents a double submission adding the line twice.
 */
export function PurchaseButtons({ state, compact = false }: { state: PurchaseState; compact?: boolean }) {
  const { blockedReason, busy, added, onAdd, onBuy, price } = state;
  const blocked = !!blockedReason;
  const disabled = blocked || busy !== "";

  return (
    <div className="flex items-stretch gap-2.5">
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className={`flex-1 rounded-xl border-[1.5px] border-slate-300 bg-white text-[14px] font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          compact ? "py-2.5" : "py-3"
        }`}
      >
        {busy === "cart" ? (
          "Adding…"
        ) : added ? (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Added to cart
          </span>
        ) : (
          "Add to Cart"
        )}
      </button>
      <button
        type="button"
        onClick={onBuy}
        disabled={disabled}
        className={`flex-1 rounded-xl bg-amber-400 text-[14px] font-black text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "py-2.5" : "py-3"
        }`}
      >
        {busy === "buy" ? "Please wait…" : blocked ? blockedReason : "Buy Now"}
        {!blocked && busy === "" && (
          <span className="block text-[11px] font-bold">at ₹{price.toLocaleString("en-IN")}</span>
        )}
      </button>
    </div>
  );
}

/** Mobile-only sticky bar so the purchase controls are always one tap away. */
export function StickyPurchaseBar({ state }: { state: PurchaseState }) {
  return (
    // data-sticky-cta lets globals.css lift the floating WhatsApp button clear of
    // this bar. Without it the button covered part of "Buy Now".
    <div
      data-sticky-cta
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/95"
    >
      <PurchaseButtons state={state} compact />
    </div>
  );
}
