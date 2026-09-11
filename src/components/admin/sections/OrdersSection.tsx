"use client";

import { adminFetch } from "@/lib/adminAuth";
import { sectionIndex } from "@/lib/adminNav";

import { useMemo, useState } from "react";
import { SectionHeader, useApi, Empty, StatusDot, inr, StatusSelect, FilterPill } from "@/components/admin/shared";

export default function Orders() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<any | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("search", q.trim());
    if (status !== "all") p.set("status", status);
    if (paymentMethod !== "all") p.set("paymentMethod", paymentMethod);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (minAmount) p.set("minAmount", minAmount);
    if (maxAmount) p.set("maxAmount", maxAmount);
    return p.toString();
  }, [q, status, paymentMethod, dateFrom, dateTo, minAmount, maxAmount]);

  const { data, loading, error, reload } = useApi(`/api/orders${qs ? `?${qs}` : ""}`, { poll: 15000, transform: (d) => d.items as any[] });
  const rows = data || [];

  const allSelected = rows.length > 0 && rows.every((o: any) => selected.has(o.order.id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(rows.map((o: any) => o.order.id));
    });
  }

  async function updateOne(id: number, newStatus: string) {
    const r = await adminFetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Couldn't update this order's status.");
    }
    reload();
  }

  async function bulkSetStatus(newStatus: string) {
    if (selected.size === 0) return;
    const isCancel = newStatus === "Cancelled";
    const msg = isCancel
      ? `Cancel ${selected.size} order${selected.size === 1 ? "" : "s"}? This should only be done for genuinely cancelled orders.`
      : `Mark ${selected.size} order${selected.size === 1 ? "" : "s"} as "${newStatus}"?`;
    if (!confirm(msg)) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const r = await adminFetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), status: newStatus }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setBulkMsg(d.error || "Bulk update failed.");
      else {
        const notes = [];
        if (d.locked > 0) notes.push(`${d.locked} already Delivered/Cancelled`);
        // Surfaced explicitly: the server refuses to advance orders whose online
        // payment never arrived, and staff need to know that happened rather
        // than assume the whole selection shipped.
        if (d.unpaidBlocked > 0) notes.push(`${d.unpaidBlocked} not paid for yet`);
        const note = notes.length > 0 ? ` (${notes.join(", ")} — skipped)` : "";
        setBulkMsg(`Updated ${d.updated} order${d.updated === 1 ? "" : "s"}.${note}`);
        setSelected(new Set());
        reload();
      }
    } catch {
      setBulkMsg("Network error.");
    } finally {
      setBulkBusy(false);
    }
  }

  function printSelected() {
    const ids = Array.from(selected);
    for (const id of ids) window.open(`/invoice/${id}`, "_blank");
  }

  function exportSelectedCsv() {
    const chosen = rows.filter((o: any) => selected.has(o.order.id));
    const header = ["Order No", "Customer", "Phone", "Status", "Payment", "Total", "Date"];
    const lines = chosen.map((o: any) => [
      o.order.orderNo,
      o.order.customerName,
      o.order.customerPhone,
      o.order.status,
      o.order.paymentMethod,
      o.order.totalMop,
      new Date(o.order.createdAt).toLocaleString("en-IN"),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders-export-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <SectionHeader index={sectionIndex("orders")} kicker="Sales" title="Orders.">
        <span className="adm-pill"><StatusDot tone="good" /> auto-refresh</span>
      </SectionHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--adm-line-strong)] bg-[#fffdf7] px-3 py-1.5">
          <span className="text-[var(--adm-muted)] font-mono-adm text-[11px]">SEARCH</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no, name, phone, email..." aria-label="Search orders by order number, customer name, phone or email" className="w-full bg-transparent text-[13px] outline-none" />
        </div>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="adm-input !w-auto !py-1.5 !text-[12px]">
          <option value="all">All payment methods</option>
          <option value="Cash on Delivery">Cash on Delivery</option>
          <option value="Online">Online</option>
          <option value="UPI">UPI</option>
          <option value="Card">Card</option>
        </select>
        <input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} type="date" className="adm-input !w-auto !py-1.5 !text-[12px]" title="From date" aria-label="Orders from date" />
        <input value={dateTo} onChange={(e) => setDateTo(e.target.value)} type="date" className="adm-input !w-auto !py-1.5 !text-[12px]" title="To date" aria-label="Orders up to date" />
        <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min ₹" aria-label="Minimum order amount in rupees" type="number" className="adm-input !w-24 !py-1.5 !text-[12px]" />
        <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max ₹" aria-label="Maximum order amount in rupees" type="number" className="adm-input !w-24 !py-1.5 !text-[12px]" />
        <button onClick={reload} className="adm-btn !py-1.5 !text-[12px]">Refresh</button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {["all", "Awaiting Payment", "Placed", "Packed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"].map((s) => (
          <FilterPill key={s} active={status === s} onClick={() => setStatus(s)}>{s === "all" ? "All statuses" : s}</FilterPill>
        ))}
      </div>

      {error && <p className="mb-3 text-[13px] text-[var(--adm-rose)]">Could not load orders: {error}</p>}

      {selected.size > 0 && (
        <div className="adm-card mb-4 flex flex-wrap items-center gap-2 border-[var(--adm-pine)] bg-[var(--adm-pine)]/5 p-3">
          <span className="font-mono-adm text-[12px] font-bold text-[var(--adm-pine)]">{selected.size} selected</span>
          {["Packed", "Shipped", "Out for Delivery", "Delivered"].map((s) => (
            <button key={s} disabled={bulkBusy} onClick={() => bulkSetStatus(s)} className="adm-btn !py-1.5 !text-[12px]">Mark {s}</button>
          ))}
          <button disabled={bulkBusy} onClick={() => bulkSetStatus("Cancelled")} className="adm-btn !py-1.5 !text-[12px] !text-[var(--adm-rose)]">Cancel Selected</button>
          <button onClick={printSelected} className="adm-btn !py-1.5 !text-[12px]">Print Invoices</button>
          <button onClick={exportSelectedCsv} className="adm-btn !py-1.5 !text-[12px]">Export CSV</button>
          {bulkMsg && <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">{bulkMsg}</span>}
          <button onClick={() => setSelected(new Set())} className="ml-auto adm-btn !py-1.5 !text-[12px]">Clear</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
        {loading && !data ? (
          <p className="px-5 py-10 text-center font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center"><Empty label="No orders match your filters." /></div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--adm-line)] px-5 py-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5" aria-label="Select all orders" />
              <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">Select all visible</span>
            </div>
            <ul className="divide-y divide-[var(--adm-line)]">
              {rows.map((o: any) => (
                <li key={o.order.id} className="adm-row px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <input type="checkbox" checked={selected.has(o.order.id)} onChange={() => toggleOne(o.order.id)} className="mt-1 h-3.5 w-3.5" aria-label={`Select order ${o.order.orderNo}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setDetail(o)} className="font-mono-adm text-[13px] font-bold underline-offset-2 hover:underline">#{o.order.orderNo}</button>
                          <span className="adm-pill">{o.order.paymentMethod}</span>
                          <PaymentBadge order={o.order} />
                        </div>
                        <p className="mt-1 text-[13px]">{o.order.customerName} · <span className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{o.order.customerPhone}</span></p>
                        <p className="mt-1 text-[12px] text-[var(--adm-muted)]">{o.items.map((i: any) => `${i.name} x${i.qty}`).join(" · ")}</p>
                        <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">{new Date(o.order.createdAt).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p className="font-mono-adm text-[16px] font-bold">{inr(Number(o.order.totalMop))}</p>
                      <div className="flex items-center gap-2">
                        {/* An order whose online payment hasn't arrived is only
                            cancellable. Offering Packed/Shipped here would be a
                            dead option the server rejects, and worse, it would
                            invite staff to dispatch goods nobody paid for. */}
                        <StatusSelect
                          value={o.order.status}
                          onChange={(s) => updateOne(o.order.id, s)}
                          options={
                            o.order.status === "Awaiting Payment"
                              ? ["Awaiting Payment", "Cancelled"]
                              : ["Placed", "Packed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"]
                          }
                        />
                        <a href={`/invoice/${o.order.id}`} target="_blank" rel="noreferrer" className="adm-btn !py-1 !text-[11px]">View Invoice</a>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {detail && <OrderDetailModal order={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/**
 * Whether an order's money has actually arrived.
 *
 * The orders list previously showed only the payment *method*, which is a
 * statement of intent, not of fact. "Razorpay" on a row told staff how the
 * customer meant to pay, not whether they did. This badge states the fact,
 * because the whole cost of getting it wrong is goods shipped for free.
 */
function PaymentBadge({ order }: { order: any }) {
  const isOnline = order.paymentMethod === "Razorpay";
  const paid = order.paymentStatus === "paid";

  if (isOnline && paid) {
    return (
      <span className="rounded px-1.5 py-0.5 font-mono-adm text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: "var(--adm-pine)" }}>
        Paid
      </span>
    );
  }
  if (order.status === "Awaiting Payment") {
    return (
      <span className="rounded bg-[var(--adm-rose)] px-1.5 py-0.5 font-mono-adm text-[10px] font-bold uppercase tracking-wide text-white">
        Not paid — do not dispatch
      </span>
    );
  }
  if (order.paymentStatus === "refunded") {
    return (
      <span className="rounded bg-[var(--adm-muted)] px-1.5 py-0.5 font-mono-adm text-[10px] font-bold uppercase tracking-wide text-white">
        Refunded
      </span>
    );
  }
  if (isOnline && order.paymentStatus === "failed") {
    return (
      <span className="rounded bg-[var(--adm-rose)] px-1.5 py-0.5 font-mono-adm text-[10px] font-bold uppercase tracking-wide text-white">
        Payment failed
      </span>
    );
  }
  // Cash on Delivery: collected on the doorstep, so "unpaid" is expected and
  // flagging it would train staff to ignore the badge that matters.
  return null;
}

function OrderDetailModal({ order, onClose }: { order: any; onClose: () => void }) {
  const o = order.order;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="adm-eyebrow">Order detail</p>
            <h3 className="font-display-adm text-[22px]">#{o.orderNo}</h3>
          </div>
          <button onClick={onClose} className="adm-btn !py-1.5 !px-3">Close</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--adm-line)] bg-[#fffdf7] p-3">
            <p className="adm-eyebrow mb-2">Customer</p>
            <p className="text-[13px] font-semibold">{o.customerName}</p>
            <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{o.customerPhone}</p>
            {o.customerEmail && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">{o.customerEmail}</p>}
          </div>
          <div className="rounded-xl border border-[var(--adm-line)] bg-[#fffdf7] p-3">
            <p className="adm-eyebrow mb-2">Delivery address</p>
            <p className="text-[13px]">{o.addressLine || "—"}</p>
            <p className="text-[13px] text-[var(--adm-muted)]">{o.city} {o.pincode}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--adm-line)] bg-[#fffdf7] p-3">
          <p className="adm-eyebrow mb-2">Payment</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="adm-pill">{o.paymentMethod}</span>
            <PaymentBadge order={o} />
            {o.paidAt && (
              <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">
                Received {new Date(o.paidAt).toLocaleString("en-IN")}
              </span>
            )}
          </div>
          {o.status === "Awaiting Payment" && (
            <p className="mt-2 text-[12px] text-[var(--adm-rose)]">
              The customer started an online payment that has not completed. Nothing has been received for this order,
              so it cannot be packed or dispatched. It can be cancelled, which returns the stock it is holding.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[var(--adm-line)] bg-[#fffdf7] p-3">
          <p className="adm-eyebrow mb-2">Items</p>
          <ul className="divide-y divide-[var(--adm-line)]">
            {order.items.map((it: any) => (
              <li key={it.id} className="flex items-center justify-between py-2 text-[13px]">
                <span>{it.name} <span className="text-[var(--adm-muted)]">x{it.qty}</span></span>
                <span className="font-mono-adm">{inr(Number(it.mop) * it.qty)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <div><p className="adm-eyebrow">MRP total</p><p className="font-mono-adm">{inr(Number(o.totalMrp))}</p></div>
          <div><p className="adm-eyebrow">Savings</p><p className="font-mono-adm text-[var(--adm-pine)]">{inr(Number(o.savings))}</p></div>
          <div><p className="adm-eyebrow">Discount</p><p className="font-mono-adm">{inr(Number(o.discount))}</p></div>
          <div><p className="adm-eyebrow">Total paid</p><p className="font-mono-adm font-bold">{inr(Number(o.totalMop))}</p></div>
        </div>
        {o.couponCode && <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">Coupon used: {o.couponCode}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="adm-pill">{o.status}</span>
          <a href={`/invoice/${o.id}`} target="_blank" rel="noreferrer" className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">Open Invoice</a>
        </div>
      </div>
    </div>
  );
}

