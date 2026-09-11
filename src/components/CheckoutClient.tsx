"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import SafeImage from "./SafeImage";
import { getCart, cartTotals, cartLineKey, clearCart, replaceCart, type CartItem } from "@/lib/cart";
import { formatINR } from "@/lib/format";
import { fetchSession } from "@/lib/session";
import { openCheckout } from "@/lib/payments/checkoutScript";

type Addr = { id: number; label: string; line: string; city: string; pincode: string };

/** What /api/payments/config tells us this deploy can honour. */
type PayConfig = { online: boolean; keyId: string; testMode: boolean; methods: string[] };

const COD = "Cash on Delivery";
const ONLINE = "Razorpay";

/** One line as /api/cart/validate reports it. */
type ValidatedLine = {
  productId: number;
  variantId: number | null;
  name: string;
  variantLabel: string;
  mrp: number | null;
  mop: number | null;
  stock: number | null;
  unavailableReason: string | null;
};

/**
 * Re-price the cart against the database and work out what changed.
 *
 * Returns the corrected cart plus the two things worth telling the shopper:
 * lines whose price moved, and lines that can no longer be ordered at all.
 * Dropped lines are removed rather than left to fail at Place Order, because an
 * item the shop cannot sell is not something the shopper can fix by retrying.
 *
 * On any network or server failure this returns null and the caller carries on
 * with the stored cart. The order endpoint re-reads prices regardless, so the
 * worst case is the old behaviour — a surprise at the end — rather than a
 * checkout page that refuses to load because one extra request failed.
 */
async function revalidateCart(
  stored: CartItem[]
): Promise<{
  items: CartItem[];
  repriced: { name: string; from: number; to: number }[];
  dropped: { name: string; reason: string }[];
} | null> {
  try {
    const r = await fetch("/api/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: stored.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, qty: i.qty })),
      }),
    });
    if (!r.ok) return null;
    const data: { lines?: ValidatedLine[] } = await r.json();
    if (!Array.isArray(data.lines) || data.lines.length !== stored.length) return null;

    const items: CartItem[] = [];
    const repriced: { name: string; from: number; to: number }[] = [];
    const dropped: { name: string; reason: string }[] = [];

    stored.forEach((item, idx) => {
      const line = data.lines![idx];
      if (line.unavailableReason || line.mop == null || line.mrp == null) {
        dropped.push({ name: item.name, reason: line.unavailableReason || "No longer available." });
        return;
      }
      if (Number(line.mop) !== Number(item.mop)) {
        repriced.push({ name: item.name, from: Number(item.mop), to: Number(line.mop) });
      }
      // Take the server's name and label too, so a renamed product doesn't sit
      // in the summary under its old title.
      items.push({
        ...item,
        name: line.name || item.name,
        variantLabel: line.variantLabel || item.variantLabel,
        mrp: Number(line.mrp),
        mop: Number(line.mop),
        stock: line.stock ?? item.stock,
      });
    });

    return { items, repriced, dropped };
  } catch {
    return null;
  }
}

export default function CheckoutClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState(getCart());
  const [addresses, setAddresses] = useState<Addr[]>([]);
  const [outlets, setOutlets] = useState<any[]>([]);
  const [selAddr, setSelAddr] = useState<number | "new">("new");
  const [form, setForm] = useState({ line: "", city: "Bengaluru", pincode: "" });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState("");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState<{ code: string; value: number; type: string; minOrder: number } | null>(null);
  const [couponErr, setCouponErr] = useState("");
  const [payment, setPayment] = useState(COD);
  const [payConfig, setPayConfig] = useState<PayConfig>({ online: false, keyId: "", testMode: false, methods: [COD] });
  const [outletId, setOutletId] = useState<number>(0);
  const [placing, setPlacing] = useState(false);
  const [placingLabel, setPlacingLabel] = useState("");
  const [err, setErr] = useState("");
  // What re-pricing the cart against the server changed. The cart is
  // localStorage, so its prices are a snapshot from add-to-cart time; the order
  // endpoint has always charged the real price, which meant a product repriced
  // in the admin console in between was charged at the new amount while this
  // page still showed the old one. These two lists exist so that difference is
  // stated plainly before the shopper pays rather than discovered afterwards.
  const [repriced, setRepriced] = useState<{ name: string; from: number; to: number }[]>([]);
  const [dropped, setDropped] = useState<{ name: string; reason: string }[]>([]);
  // An order that exists server-side and is holding stock while it waits for
  // payment. Kept so a failed or dismissed payment retries against the same
  // order instead of filing a second one for the same cart — the old flow
  // would have created a duplicate order on every retry.
  const [pendingOrder, setPendingOrder] = useState<{ id: number; orderNo: string } | null>(null);

  const totals = cartTotals(items);

  useEffect(() => {
    (async () => {
      const me = await fetchSession();
      if (!me.customer) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      setAuthed(true);
      const stored = getCart();
      setItems(stored);
      if (stored.length === 0) {
        setReady(true);
        return;
      }
      const [a, o, p, v] = await Promise.all([
        fetch("/api/addresses").then((r) => r.json()),
        fetch("/api/outlets").then((r) => r.json()),
        // Ask what payment methods actually work here rather than assuming.
        // On a deploy with no gateway keys this returns COD only, and the
        // online option is never rendered at all.
        fetch("/api/payments/config").then((r) => r.json()).catch(() => null),
        // Re-price the cart before anything is displayed. This posts the cart's
        // product and variant ids and gets back the prices the order endpoint
        // will actually charge, so the summary below is the real total rather
        // than whatever was true when the item was added.
        revalidateCart(stored),
      ]);

      // Apply the re-priced cart before the summary renders, so the shopper
      // never sees a total the server would not honour. Writing it back to
      // localStorage keeps the cart page and header consistent with checkout.
      if (v) {
        if (v.repriced.length || v.dropped.length) {
          replaceCart(v.items);
          setItems(v.items);
          setRepriced(v.repriced);
          setDropped(v.dropped);
        }
      }
      setAddresses(a.items || []);
      setOutlets(o.items || []);
      if (p?.online) {
        setPayConfig(p);
        // Default to online when it's available: it's the faster path and it
        // gets the shop paid before dispatch.
        setPayment(ONLINE);
      }
      setOutletId(o.items?.[0]?.id ?? 0);
      if ((a.items || []).length) setSelAddr(a.items[0].id);
      setReady(true);
    })();
  }, [router]);

  function useLocation() {
    setGeoMsg("");
    if (!navigator.geolocation) {
      setGeoMsg("Location not supported on this device — please enter manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoMsg("Location detected — you can still edit the address below.");
      },
      () => setGeoMsg("Location access denied. Please enter your address manually.")
    );
  }

  async function applyCoupon() {
    setCouponErr("");
    if (!coupon.trim()) return;
    // Sending the subtotal lets the server apply the minimum-order rule and
    // return the exact reason a code was refused (expired, fully claimed,
    // already used by this customer, cart too small) instead of the old
    // catch-all "Invalid or inapplicable coupon", which told the shopper
    // nothing actionable.
    const r = await fetch(
      `/api/coupons?code=${encodeURIComponent(coupon.trim())}&subtotal=${totals.totalMop}`,
    );
    const d = await r.json().catch(() => ({}));
    if (d.coupon) {
      setApplied(d.coupon);
    } else {
      setApplied(null);
      setCouponErr(d.error || "This coupon code isn't valid.");
    }
  }

  // Percentage coupons produce fractional paise (10% of ₹22,999 = ₹2,299.9),
  // which leaked into the summary, the total and the Place Order button as
  // "₹2,299.9". Rounding once here keeps every display and the amount the
  // server is asked to honour consistent, in whole rupees.
  const discount = applied
    ? Math.round(
        applied.type === "percent"
          ? (totals.totalMop * Number(applied.value)) / 100
          : Number(applied.value)
      )
    : 0;
  const grand = Math.max(0, totals.totalMop - discount);

  /**
   * Take an order that is already awaiting payment through the gateway.
   *
   * Split out from placeOrder so a declined card or a closed payment sheet can
   * retry this half on its own, without creating another order.
   */
  async function payForOrder(order: { id: number; orderNo: string }) {
    setPlacingLabel("Opening secure payment\u2026");
    const r = await fetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });
    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
      setErr(d.error || "Could not start the payment. Please try again.");
      setPlacing(false);
      setPlacingLabel("");
      return;
    }
    // Paid already — usually a stale tab or a double submit. Nothing to do but
    // show them the order.
    if (d.alreadyPaid) {
      clearCart();
      router.push(`/invoice/${order.id}`);
      return;
    }

    await openCheckout({
      keyId: payConfig.keyId,
      gatewayOrderId: d.gatewayOrderId,
      amountPaise: d.amountPaise,
      currency: d.currency || "INR",
      name: d.name || "SMS Stores",
      description: `Order ${order.orderNo}`,
      prefill: d.prefill || { name: "", email: "", contact: "" },
      onSuccess: async (res) => {
        setPlacingLabel("Confirming your payment\u2026");
        try {
          const v = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(res),
          });
          const vd = await v.json().catch(() => ({}));
          if (v.ok && vd.paid) {
            clearCart();
            router.push(`/invoice/${order.id}`);
            return;
          }
          // The signature check failed or the request didn't land. The money may
          // well have left their account, so this must not read as "payment
          // failed, try again" — that invites a second charge. The webhook and
          // the reconciler will settle it.
          setErr(
            vd.error ||
              "We couldn't confirm your payment yet. If money has left your account, your order will update shortly \u2014 please don't pay again."
          );
        } catch {
          setErr(
            "Your payment went through but we lost connection while confirming it. Your order will update shortly \u2014 please don't pay again."
          );
        } finally {
          setPlacing(false);
          setPlacingLabel("");
        }
      },
      onDismiss: async () => {
        // Tell the server so the reservation is released promptly instead of
        // waiting for the reconciliation sweep to notice hours later.
        fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ razorpay_order_id: d.gatewayOrderId, failed: true, reason: "Closed the payment window." }),
        }).catch(() => {});
        setErr("Payment was not completed. Your order is saved \u2014 you can pay for it now or choose Cash on Delivery.");
        setPlacing(false);
        setPlacingLabel("");
      },
      onFailure: (reason) => {
        setErr(`${reason} Your order is saved \u2014 you can try again or choose Cash on Delivery.`);
        setPlacing(false);
        setPlacingLabel("");
      },
    });
  }

  async function placeOrder() {
    setErr("");

    // Retry path: an order already exists and is holding stock. Reuse it
    // rather than filing a second order for the same cart.
    if (pendingOrder) {
      setPlacing(true);
      if (payment === ONLINE) {
        await payForOrder(pendingOrder);
        return;
      }
      // Switched to Cash on Delivery after an online attempt failed. Convert
      // the existing order instead of creating a new one.
      setPlacingLabel("Switching to Cash on Delivery\u2026");
      try {
        const r = await fetch("/api/payments/switch-to-cod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: pendingOrder.id }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          clearCart();
          router.push(`/invoice/${pendingOrder.id}`);
          return;
        }
        setErr(d.error || "Could not switch to Cash on Delivery.");
      } catch {
        setErr("Network error. Please try again.");
      }
      setPlacing(false);
      setPlacingLabel("");
      return;
    }

    const address =
      selAddr !== "new"
        ? addresses.find((a) => a.id === selAddr)
        : null;
    const payload = {
      // variantId is sent so the server prices and decrements the exact
      // colour/RAM/storage the shopper chose. Prices themselves are never
      // sent — the server re-reads them from the database.
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, qty: i.qty })),
      address: address
        ? { line: address.line, city: address.city, pincode: address.pincode }
        : { line: form.line, city: form.city, pincode: form.pincode },
      outletId,
      paymentMethod: payment,
      couponCode: applied?.code || null,
    };
    if (!payload.address.line.trim() || !payload.address.pincode.trim()) {
      setErr("Please provide a complete delivery address.");
      return;
    }
    setPlacing(true);
    setPlacingLabel(payment === ONLINE ? "Reserving your order\u2026" : "Placing order\u2026");
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Could not place order.");
        setPlacing(false);
        setPlacingLabel("");
        return;
      }

      // An online order isn't finished yet — it's reserved and awaiting money.
      // The cart is deliberately kept until the payment succeeds, so a customer
      // who abandons the gateway still has their basket.
      if (d.requiresPayment) {
        const order = { id: d.orderId, orderNo: d.orderNo };
        setPendingOrder(order);
        await payForOrder(order);
        return;
      }

      clearCart();
      router.push(`/invoice/${d.orderId}`);
    } catch {
      setErr("Network error. Please try again.");
      setPlacing(false);
      setPlacingLabel("");
    }
  }

  /**
   * What re-pricing changed, stated before the shopper commits.
   *
   * Rendered on the empty-cart branch as well as the normal one: if every line
   * turned out to be unavailable the cart empties, and "Your cart is empty" on
   * its own would look like the items were lost rather than withdrawn.
   */
  const cartChangeNotice =
    dropped.length || repriced.length ? (
      <div className="mb-4 space-y-3" role="status" aria-live="polite">
        {dropped.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/40">
            <p className="font-semibold text-rose-800 dark:text-rose-200">
              {dropped.length === 1 ? "An item was removed from your cart" : `${dropped.length} items were removed from your cart`}
            </p>
            <ul className="mt-2 space-y-1 text-rose-700 dark:text-rose-300">
              {dropped.map((d, i) => (
                <li key={`${d.name}-${i}`}>
                  <span className="font-medium">{d.name}</span> — {d.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {repriced.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              {repriced.length === 1 ? "A price has changed since you added it" : "Some prices have changed since you added them"}
            </p>
            <ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-300">
              {repriced.map((c, i) => (
                <li key={`${c.name}-${i}`}>
                  <span className="font-medium">{c.name}</span> — was {formatINR(c.from)}, now{" "}
                  <span className="font-semibold">{formatINR(c.to)}</span>
                  {c.to < c.from ? " (cheaper)" : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              The total below is the amount you will be charged.
            </p>
          </div>
        )}
      </div>
    ) : null;

  if (!ready) return <p className="py-20 text-center text-slate-500">Loading checkout…</p>;
  if (authed && items.length === 0)
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        {cartChangeNotice}
        <div className="text-center">
          <p className="text-lg font-semibold">Your cart is empty</p>
          <Link href="/products" className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Browse products</Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-2xl font-extrabold">Checkout</h1>
      {cartChangeNotice}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Address */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Delivery Address</h2>
              <button onClick={useLocation} className="text-sm font-semibold text-blue-600 hover:underline" style={{display:"inline-flex",alignItems:"center",gap:"0.375rem"}}><MapPin aria-hidden className="h-3.5 w-3.5" /> Use my current location</button>
            </div>
            {geoMsg && <p className="mt-1 text-xs text-slate-500">{geoMsg}</p>}

            {addresses.length > 0 && (
              <div className="mt-3 space-y-2">
                {addresses.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <input type="radio" checked={selAddr === a.id} onChange={() => setSelAddr(a.id)} />
                    <span className="text-sm"><b>{a.label}</b> — {a.line}, {a.city} {a.pincode}</span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-blue-600">
                  <input type="radio" checked={selAddr === "new"} onChange={() => setSelAddr("new")} /> Use a new address
                </label>
              </div>
            )}

            {selAddr === "new" && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} placeholder="Full address" className="sm:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
                <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="Pincode" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </div>
            )}

            <div className="mt-3">
              <label className="text-sm font-semibold">Preferred outlet</label>
              <select value={outletId} onChange={(e) => setOutletId(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </section>

          {/* Payment */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-bold">Payment Method</h2>

            {payConfig.testMode && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Test mode — payments made here are not real and no money will be taken.
              </p>
            )}

            <div className="mt-3 space-y-2">
              {/* Rendered only when the gateway is actually configured, so there
                  is never a payment option that fails when selected. */}
              {payConfig.online && (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    payment === ONLINE
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    className="mt-0.5"
                    checked={payment === ONLINE}
                    onChange={() => setPayment(ONLINE)}
                  />
                  <span>
                    <b>Pay online</b>
                    <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                      Recommended
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      UPI, cards, net banking and wallets. Your order is confirmed the moment payment succeeds.
                    </span>
                  </span>
                </label>
              )}

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  payment === COD
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  className="mt-0.5"
                  checked={payment === COD}
                  onChange={() => setPayment(COD)}
                />
                <span>
                  <b>Cash on Delivery</b>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Pay in cash when your order arrives, or at pickup.
                  </span>
                </span>
              </label>
            </div>

            {payConfig.online && (
              <p className="mt-3 text-xs text-slate-500">
                Payments are handled by Razorpay. Your card and UPI details are entered on their secure page and never
                reach this website.
              </p>
            )}
          </section>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-24">
          <h2 className="font-bold">Order Summary</h2>
          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {items.map((i) => (
              <div key={cartLineKey(i)} className="flex items-center gap-2 text-sm">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                  <SafeImage src={i.image} alt="" className="h-full w-full" />
                </span>
                <span className="clamp-2 flex-1">
                  {i.name} ×{i.qty}
                  {i.variantLabel && <span className="block text-xs text-slate-500">{i.variantLabel}</span>}
                </span>
                <span>₹{(Number(i.mop) * i.qty).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <div className="flex justify-between"><span className="text-slate-500">MRP</span><span>₹{totals.totalMrp.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Our Price</span><span>₹{totals.totalMop.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between text-emerald-600"><span>You save</span><span>₹{totals.savings.toLocaleString("en-IN")}</span></div>
          </div>

          <div className="mt-3 flex gap-2">
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            <button onClick={applyCoupon} className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600">Apply</button>
          </div>
          {couponErr && <p className="mt-1 text-xs text-rose-600">{couponErr}</p>}
          {applied && <p className="mt-1 text-xs text-emerald-600">Coupon {applied.code} applied — {formatINR(discount)} off</p>}

          {discount > 0 && (
            <div className="mt-2 flex justify-between text-sm"><span className="text-slate-500">Discount</span><span className="text-emerald-600">−₹{discount.toLocaleString("en-IN")}</span></div>
          )}
          <div className="mt-2 flex justify-between text-lg font-extrabold"><span>Total</span><span>₹{grand.toLocaleString("en-IN")}</span></div>

          {err && (
            <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {err}
            </p>
          )}
          <button
            onClick={placeOrder}
            disabled={placing}
            aria-busy={placing}
            className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {/* The label states what will actually happen next. "Place Order"
                on a flow that immediately opens a payment sheet asking for card
                details is a small betrayal of expectations, and it's the point
                where hesitant shoppers abandon. */}
            {placing
              ? placingLabel || "Working\u2026"
              : pendingOrder && payment === COD
                ? `Confirm Cash on Delivery · \u20b9${grand.toLocaleString("en-IN")}`
                : pendingOrder
                  ? `Retry payment · \u20b9${grand.toLocaleString("en-IN")}`
                  : payment === ONLINE
                  ? `Pay \u20b9${grand.toLocaleString("en-IN")} securely`
                  : `Place Order · \u20b9${grand.toLocaleString("en-IN")}`}
          </button>
        </div>
      </div>
    </div>
  );
}