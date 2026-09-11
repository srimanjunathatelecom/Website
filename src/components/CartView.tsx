"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SafeImage from "./SafeImage";
import EmptyState from "./EmptyState";
import { ShoppingCart } from "lucide-react";
import { getCart, updateQty, removeFromCart, cartTotals, cartLineKey, CartItem } from "@/lib/cart";
import { discountPercent } from "@/lib/format";

export default function CartView() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    // Initial sync read from localStorage (no SSR equivalent) plus
    // subscribing to future cart changes fired elsewhere in the app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(getCart());
    const onCh = () => setItems(getCart());
    window.addEventListener("sms-cart-change", onCh);
    return () => window.removeEventListener("sms-cart-change", onCh);
  }, []);

  const totals = cartTotals(items);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart className="h-7 w-7" strokeWidth={1.75} />}
        title="Your cart is empty"
        message="Anything you add will appear here, and nothing is charged until you place the order."
        primaryHref="/products"
        primaryLabel="Start shopping"
        secondaryHref="/wishlist"
        secondaryLabel="View wishlist"
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-2xl font-extrabold">Your Cart</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {items.map((it) => {
            const off = discountPercent(it.mrp, it.mop);
            return (
              // Keyed by product + variant: two variants of the same phone are
              // two distinct lines, so productId alone is not unique here.
              <div key={cartLineKey(it)} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <Link href={`/products/${it.slug}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                  <SafeImage src={it.image} alt={it.name} className="h-full w-full" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/products/${it.slug}`} className="clamp-2 text-sm font-semibold hover:text-blue-600">{it.name}</Link>
                  <p className="text-xs text-slate-500">{it.brand}</p>
                  {it.variantLabel && (
                    <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{it.variantLabel}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-bold">₹{Number(it.mop).toLocaleString("en-IN")}</span>
                    {off > 0 && <span className="text-xs text-slate-500 line-through">₹{Number(it.mrp).toLocaleString("en-IN")}</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${it.name}`}
                        disabled={it.qty <= 1}
                        onClick={() => updateQty(it.productId, it.qty - 1, it.variantId)}
                        className="px-2 py-1 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm" aria-live="polite">{it.qty}</span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${it.name}`}
                        disabled={it.qty >= Math.max(1, it.stock)}
                        onClick={() => updateQty(it.productId, it.qty + 1, it.variantId)}
                        className="px-2 py-1 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button type="button" onClick={() => removeFromCart(it.productId, it.variantId)} className="text-xs text-rose-600 hover:underline">Remove</button>
                    {/* Explains the greyed-out "+". Without this the stepper just
                        stops responding at the stock ceiling and the shopper has
                        no way to tell that apart from a broken button. Same copy
                        and colour as the scarcity note on the product page. */}
                    {it.stock > 0 && it.qty >= it.stock ? (
                      <span role="status" className="text-[12px] font-semibold text-orange-700 dark:text-orange-400">
                        Only {it.stock} in stock
                      </span>
                    ) : it.stock > 0 && it.stock <= 5 ? (
                      <span className="text-[12px] font-semibold text-orange-700 dark:text-orange-400">
                        Only {it.stock} left
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right font-semibold">₹{(Number(it.mop) * it.qty).toLocaleString("en-IN")}</div>
              </div>
            );
          })}
        </div>

        <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-24">
          <h2 className="font-bold">Order Summary</h2>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">MRP Total</span><span>₹{totals.totalMrp.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Our Price</span><span>₹{totals.totalMop.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between font-semibold text-emerald-600"><span>You&apos;re saving</span><span>₹{totals.savings.toLocaleString("en-IN")}</span></div>
          </div>
          <Link href="/checkout" className="mt-4 block rounded-xl bg-blue-600 py-3 text-center font-semibold text-white hover:bg-blue-700">
            Proceed to Checkout
          </Link>
          <Link href="/products" className="mt-2 block text-center text-sm text-blue-600 hover:underline">Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}