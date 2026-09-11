"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Bike,
  CheckCircle2,
  ClipboardList,
  Package,
  Receipt,
  Truck,
  Wrench,
  X,
  Check,
  Circle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ORDER_STEPS = ["Placed", "Packed", "Shipped", "Out for Delivery", "Delivered"];
const BOOKING_STEPS = ["Booked", "In Progress", "Ready", "Delivered"];
const STEP_ICON: Record<string, LucideIcon> = {
  Placed: Receipt, Packed: Package, Shipped: Truck, "Out for Delivery": Bike, Delivered: CheckCircle2,
  Booked: ClipboardList, "In Progress": Wrench, Ready: Bell,
  Cancelled: X,
};

export default function TrackClient() {
  // Prefilled from ?no= so the confirmation screens can link straight here with
  // the number already in the box. A customer who has just been given
  // "SVC2608001A394F" should not have to copy fifteen characters by hand off one
  // screen and retype them on the next, which on a phone is where the digits get
  // transposed and the number "does not exist".
  const searchParams = useSearchParams();
  const [no, setNo] = useState(() => searchParams.get("no")?.trim() ?? "");
  const [phone, setPhone] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function track(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setData(null);
    try {
      const qs = new URLSearchParams({ no: no.trim() });
      if (phone.trim()) qs.set("phone", phone.trim());
      const r = await fetch(`/api/track?${qs.toString()}`);
      const d = await r.json();
      if (r.ok) { setData(d); setNeedsPhone(false); }
      else if (d.error === "PHONE_REQUIRED") { setNeedsPhone(true); setErr(d.message); }
      else { setErr(d.error || "No record found."); }
    } catch { setErr("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  const steps = data?.type === "order" ? ORDER_STEPS : data?.type === "booking" ? BOOKING_STEPS : [];
  const cancelled = data?.status === "Cancelled";
  const currentIdx = cancelled ? -1 : steps.indexOf(data?.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-700">Live Order Tracking</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Where&apos;s my order?</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your order (<b>SMS…</b>) or booking (<b>SVC…</b>) number for a live status.</p>
      </div>

      <form onSubmit={track} className="mx-auto mt-6 flex max-w-xl flex-col gap-2 sm:flex-row rounded-2xl sm:rounded-full bg-white p-1.5 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <input value={no} onChange={(e) => setNo(e.target.value)} aria-label="Order or booking number" placeholder="e.g. SMS120326A1B2 or SVC2603X9K" className="flex-1 bg-transparent px-4 py-1.5 text-sm outline-none" />
        {needsPhone && (
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="Last 4 digits of phone"
            inputMode="numeric"
            maxLength={4}
            className="w-full sm:w-40 rounded-full bg-slate-100 px-4 py-1.5 text-sm outline-none dark:bg-slate-800"
          />
        )}
        <button disabled={busy} className="rounded-full bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-2.5 text-sm font-black text-white shadow transition hover:brightness-110 disabled:opacity-50">
          {busy ? "…" : "Track"}
        </button>
      </form>
      {err && <p className="mt-3 text-center text-sm font-semibold text-rose-500">{err}</p>}

      {data && (
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          {/* header */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white">
            <div>
              <div className="flex items-center gap-2">
                {cancelled ? <span className="flex items-center gap-1.5 text-rose-300"><X aria-hidden className="h-4 w-4" /> Cancelled</span> : <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-300"><span className="pulse-dot h-2 w-2 rounded-full bg-emerald-400" /> Live</span>}
                <span className="text-[11px] text-slate-500">· {data.type === "order" ? "Product order" : "Repair booking"}</span>
              </div>
              <p className="mt-1 text-xl font-black tracking-tight">#{data.orderNo || data.bookingNo}</p>
            </div>
            <div className="text-right text-sm">
              {data.type === "order" && <p className="font-black">₹{Number(data.total).toLocaleString("en-IN")}</p>}
              {data.type === "booking" && <p className="font-bold">{data.service}</p>}
              <p className="text-[11px] text-slate-500">{data.type === "booking" ? `Device · ${data.device || "—"}` : `${data.items?.length || 0} item(s)`}</p>
            </div>
          </div>

          {/* timeline */}
          <div className="px-5 py-7 sm:px-8">
            {cancelled ? (
              <p className="text-center text-sm font-bold text-rose-500">This order was cancelled. Contact the store if you need help.</p>
            ) : (
              <ol className="relative flex items-start justify-between">
                {steps.map((s, i) => {
                  const done = i < currentIdx;
                  const current = i === currentIdx;
                  const last = i === steps.length - 1 && current;
                  return (
                    <li key={s} className="relative z-10 flex flex-1 flex-col items-center text-center">
                      {/* connector */}
                      {i > 0 && (
                        <span className={`absolute right-1/2 top-5 h-0.5 w-full ${i <= currentIdx ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />
                      )}
                      <span className={`relative grid h-10 w-10 place-items-center rounded-full text-base shadow-md ring-4 ring-white transition dark:ring-slate-900 ${
                        done ? "bg-emerald-500 text-white" : current ? "bg-gradient-to-br from-blue-700 to-indigo-700 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                      } ${current ? "pulse-dot" : ""}`}>
                        {done ? <Check aria-hidden className="h-4 w-4" /> : (() => { const I = STEP_ICON[s] || Circle; return <I aria-hidden className="h-4 w-4" />; })()}
                      </span>
                      <span className={`mt-2 text-[11px] font-bold leading-tight sm:text-xs ${current ? "text-blue-700 dark:text-blue-400" : done ? "text-emerald-600" : "text-slate-500"}`}>{s}</span>
                      {last && <span className="mt-0.5 text-[10px] font-semibold text-blue-700">You are here</span>}
                    </li>
                  );
                })}
              </ol>
            )}

            {data.type === "order" && data.items?.length > 0 && (
              <div className="mt-7 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Items in this order</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.items.map((it: any, i: number) => (
                    <li key={i} className="flex justify-between"><span className="clamp-1">{it.name} <span className="text-slate-500">×{it.qty}</span></span></li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-5 text-center text-xs text-slate-500">
              {data.type === "order"
                ? "Need help? Call 7996663356 or tap the WhatsApp button."
                : "Our team will call you to confirm details and pricing before any work begins."}
            </p>
          </div>
        </div>
      )}

      {!data && !err && (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {([[Receipt, "Order placed", "We confirm stock and pack your items."], [Truck, "Out for delivery", "Rider heads to your address across Bengaluru."], [CheckCircle2, "Delivered", "Enjoy genuine products at MOP pricing."]] as [LucideIcon, string, string][]).map(([I, t, d]) => (
            <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="flex justify-center text-slate-700 dark:text-slate-200"><I aria-hidden className="h-6 w-6" /></p>
              <p className="mt-1 text-sm font-black">{t}</p>
              <p className="text-xs text-slate-500">{d}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}