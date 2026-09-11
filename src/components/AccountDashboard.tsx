"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { markWishlistStale } from "@/lib/wishlist";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SafeImage from "./SafeImage";
import ProductCard, { CardProduct } from "./ProductCard";
import { orderTimeline, bookingTimeline } from "@/lib/format";
import { clearSession } from "@/lib/session";

const TABS = ["Orders", "Bookings", "Claims", "Addresses", "Wishlist", "Profile"] as const;
type Tab = (typeof TABS)[number];

export default function AccountDashboard({ user }: { user: any }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<CardProduct[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    const [o, b, c, a, w] = await Promise.all([
      fetch("/api/orders").then((r) => r.json()),
      fetch("/api/bookings").then((r) => r.json()),
      fetch("/api/claims").then((r) => r.json()),
      fetch("/api/addresses").then((r) => r.json()),
      fetch("/api/wishlist").then((r) => r.json()),
    ]);
    setOrders(o.items || []);
    setBookings(b.items || []);
    setClaims(c.items || []);
    setAddresses(a.items || []);
    setWishlist(w.items || []);
    setLoading(false);
  }

  useEffect(() => {
    // Canonical fetch-on-mount: loadAll's setState calls run after the
    // async data arrives, not synchronously during the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearSession();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">My Account</h1>
          <p className="text-sm text-slate-500">{user.name} · {user.email}</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Log out</button>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 no-scrollbar dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading && <p className="text-slate-500">Loading…</p>}
        {!loading && tab === "Orders" && <OrdersTab orders={orders} onChanged={loadAll} />}
        {!loading && tab === "Bookings" && <BookingsTab bookings={bookings} />}
        {!loading && tab === "Claims" && <ClaimsTab claims={claims} />}
        {!loading && tab === "Addresses" && <AddressesTab addresses={addresses} onChange={loadAll} />}
        {!loading && tab === "Wishlist" && <WishlistTab items={wishlist} onChange={loadAll} />}
        {!loading && tab === "Profile" && <ProfileTab user={user} />}
      </div>
    </div>
  );
}

function Timeline({ steps }: { steps: { label: string; done?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function OrdersTab({ orders, onChanged }: { orders: any[]; onChanged: () => void }) {
  const [claimFor, setClaimFor] = useState<{ orderId: number; orderNo: string; products: any[] } | null>(null);
  const [claimProd, setClaimProd] = useState(0);
  const [claimReason, setClaimReason] = useState("");
  const [msg, setMsg] = useState("");

  if (orders.length === 0) return <Empty text="You have no orders yet." link="/products" linkText="Start shopping" />;

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: claimFor!.orderId, productId: claimProd, reason: claimReason }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg("Claim raised. We'll review it shortly.");
      setClaimFor(null);
      setClaimReason("");
      onChanged();
    } else setMsg(d.error || "Could not raise claim.");
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <div key={o.order.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold">#{o.order.orderNo}</p>
              <p className="text-xs text-slate-500">{new Date(o.order.createdAt).toLocaleString("en-IN")}</p>
            </div>
            <p className="font-semibold">₹{Number(o.order.totalMop).toLocaleString("en-IN")} · {o.order.paymentMethod}</p>
            <Link href={`/invoice/${o.order.id}`} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">Invoice</Link>
          </div>
          <div className="mt-3"><Timeline steps={orderTimeline(o.order.status)} /></div>
          <div className="mt-3 space-y-1 text-sm">
            {o.items.map((it: any) => (
              <div key={it.id} className="flex justify-between"><span className="clamp-1 max-w-[70%]">{it.name} ×{it.qty}</span><span>₹{(Number(it.mop) * it.qty).toLocaleString("en-IN")}</span></div>
            ))}
          </div>
          <button onClick={() => { setClaimFor({ orderId: o.order.id, orderNo: o.order.orderNo, products: o.items }); setClaimProd(o.items[0]?.productId); }} className="mt-3 text-sm font-semibold text-rose-600 hover:underline">
            Raise warranty / defect claim
          </button>
        </div>
      ))}

      {claimFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={submitClaim} className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Claim for #{claimFor.orderNo}</h3>
              <button type="button" onClick={() => setClaimFor(null)} className="text-slate-500" aria-label="Close"><X aria-hidden className="h-4 w-4" /></button>
            </div>
            <label className="mt-3 block text-sm font-semibold">Product</label>
            <select value={claimProd} onChange={(e) => setClaimProd(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
              {claimFor.products.map((p: any) => <option key={p.productId} value={p.productId}>{p.name}</option>)}
            </select>
            <label className="mt-3 block text-sm font-semibold">Describe the issue</label>
            <textarea required value={claimReason} onChange={(e) => setClaimReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
            {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
            <button className="mt-3 w-full rounded-lg bg-rose-600 py-2 font-semibold text-white">Submit Claim</button>
          </form>
        </div>
      )}
    </div>
  );
}

function BookingsTab({ bookings }: { bookings: any[] }) {
  if (bookings.length === 0) return <Empty text="No repair bookings yet." link="/services" linkText="Book a repair" />;
  return (
    <div className="space-y-4">
      {bookings.map((b) => (
        <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">#{b.bookingNo} · {b.serviceName}</p>
            <p className="text-sm text-slate-500">{new Date(b.createdAt).toLocaleString("en-IN")}</p>
          </div>
          <p className="mt-1 text-sm text-slate-500">Device: {b.device || "n/a"}</p>
          <p className="text-sm text-slate-500">Issue: {b.issue}</p>
          <div className="mt-3"><Timeline steps={bookingTimeline(b.status)} /></div>
        </div>
      ))}
    </div>
  );
}

function ClaimsTab({ claims }: { claims: any[] }) {
  if (claims.length === 0) return <Empty text="No warranty/defect claims yet." />;
  return (
    <div className="space-y-4">
      {claims.map((c) => (
        <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">#{c.claimNo} · {c.productName}</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              c.status === "Approved" || c.status === "Resolved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
              : c.status === "Rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
            }`}>{c.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Reason: {c.reason}</p>
        </div>
      ))}
    </div>
  );
}

function AddressesTab({ addresses, onChange }: { addresses: any[]; onChange: () => void }) {
  const [form, setForm] = useState({ label: "Home", line: "", city: "Bengaluru", pincode: "" });
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ label: "Home", line: "", city: "Bengaluru", pincode: "" });
    setBusy(false);
    onChange();
  }
  async function del(id: number) {
    await fetch("/api/addresses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    onChange();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        {addresses.length === 0 && <p className="text-sm text-slate-500">No saved addresses.</p>}
        {addresses.map((a) => (
          <div key={a.id} className="flex items-start justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-sm"><b>{a.label}</b> {a.isDefault && <span className="text-xs text-emerald-600">(Default)</span>}<br />{a.line}, {a.city} {a.pincode}</div>
            <button onClick={() => del(a.id)} className="text-xs text-rose-600 hover:underline">Delete</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="font-bold">Add address</h3>
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        <input value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} placeholder="Full address" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        <div className="grid grid-cols-2 gap-2">
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="Pincode" className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
        </div>
        <button disabled={busy} className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white">Save address</button>
      </form>
    </div>
  );
}

function WishlistTab({ items, onChange }: { items: CardProduct[]; onChange: () => void }) {
  if (items.length === 0) return <Empty text="Your wishlist is empty." link="/products" linkText="Browse products" />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <div key={p.id} className="relative">
          <ProductCard p={p} />
          <button onClick={async () => { await fetch("/api/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id }) }); markWishlistStale(); onChange(); }} className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-rose-600 shadow dark:bg-slate-800">Remove</button>
        </div>
      ))}
    </div>
  );
}

function ProfileTab({ user }: { user: any }) {
  return (
    <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-bold">Profile</h3>
      <p className="mt-3 text-sm"><b>Name:</b> {user.name}</p>
      <p className="text-sm"><b>Email:</b> {user.email}</p>
      <p className="text-sm"><b>Phone:</b> {user.phone || "—"}</p>
      <p className="mt-3 text-xs text-slate-500">Need to update your details? Contact the store and we&apos;ll help.</p>
    </div>
  );
}

function Empty({ text, link, linkText }: { text: string; link?: string; linkText?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
      <p className="text-slate-500">{text}</p>
      {link && <Link href={link} className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{linkText}</Link>}
    </div>
  );
}