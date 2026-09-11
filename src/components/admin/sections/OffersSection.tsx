"use client";

import { sectionIndex } from "@/lib/adminNav";
import { adminToast } from "@/lib/adminToast";

import { useState } from "react";
import React from "react";
import { adminFetch } from "@/lib/adminAuth";
import { SectionHeader, useApi, StatusDot, Field } from "@/components/admin/shared";

/* ------------------------------------------------------------------ */
/*  Promo Offers (PDP "bank offers" tiles)                            */
/* ------------------------------------------------------------------ */

// Type-aware one-line summary for the admin offer card — mirrors what the
// PDP actually shows, so the list never implies a generic % discount for
// offer types (EMI/Exchange) that don't have one.
function offerSummary(o: any): string {
  if (o.type === "emi") {
    const tenures = String(o.emiTenures || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const parts = [
      o.noCostEmi ? "No Cost EMI" : (o.emiInterestRate != null ? `${Number(o.emiInterestRate)}% p.a.` : "EMI"),
      tenures.length ? `${tenures.join("/")} months` : "",
      o.processingFee != null ? `₹${Number(o.processingFee).toLocaleString("en-IN")} processing fee` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }
  if (o.type === "exchange") {
    const parts = [
      o.maxExchangeValue != null ? `Up to ₹${Number(o.maxExchangeValue).toLocaleString("en-IN")} exchange value` : "",
      o.exchangeEligibility || "",
    ].filter(Boolean);
    return parts.join(" · ");
  }
  const parts = [
    o.discountType === "fixed" ? `₹${Number(o.discountValue).toLocaleString("en-IN")} off` : `${Number(o.discountValue)}% off`,
    o.discountType === "percent" && o.maxDiscount != null ? `up to ₹${Number(o.maxDiscount).toLocaleString("en-IN")}` : "",
    Number(o.minOrder) > 0 ? `min order ₹${Number(o.minOrder).toLocaleString("en-IN")}` : "",
    o.provider ? o.provider : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export default function PromoOffers() {
  const { data, loading, reload } = useApi("/api/promo-offers", { transform: (d) => d.items as any[] });
  const { data: productOptions } = useApi("/api/products?limit=500", {
    transform: (d) => (d.items || []) as any[],
  });
  const { data: categoryOptions } = useApi("/api/categories", {
    transform: (d) => (d.items || []) as any[],
  });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const rows = data || [];

  function scopeLabel(o: any) {
    if (o.productId) {
      const p = productOptions?.find((p: any) => p.id === o.productId);
      return p ? `Only: ${p.name}` : "Only: one product";
    }
    if (o.categoryId) {
      const c = categoryOptions?.find((c: any) => c.id === o.categoryId);
      return c ? `Category: ${c.name}` : "One category";
    }
    return "All products";
  }

  return (
    <div>
      <SectionHeader index={sectionIndex("offers")} kicker="Storefront" title="PDP Offers.">
        <button onClick={() => { setEditing(null); setShow(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Offer</button>
      </SectionHeader>

      <p className="-mt-3 mb-6 max-w-2xl text-[13px] leading-relaxed text-[var(--adm-muted)]">
        These are the bank/UPI/instant-discount tiles shown in the &ldquo;WOW! DEAL&rdquo; box on every product page.
        Scope an offer to one product or one category, or leave it unscoped to apply store-wide. Only <b>active</b>{" "}
        offers within their start/expiry window are shown to customers, and only when the product&apos;s price
        actually qualifies for the offer&apos;s minimum order value.
      </p>

      {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
      {!loading && rows.length === 0 && (
        <p className="adm-card p-5 text-[13px] text-[var(--adm-muted)]">No offers yet — add one above.</p>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((o: any) => (
          <div key={o.id} className="adm-card p-4 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold uppercase tracking-wide text-[var(--adm-muted)]">{o.type}</p>
                <p className="text-[15px] font-bold break-words">{o.title}</p>
                <p className="mt-1 text-[13px] text-[var(--adm-muted)] break-words leading-snug">{offerSummary(o)}</p>
                <p className="mt-1 text-[12px] text-[var(--adm-muted)] break-words">{scopeLabel(o)}</p>
              </div>
              <span className={`adm-pill shrink-0 ${o.active ? "adm-pill--good" : ""}`}>
                <StatusDot tone={o.active ? "good" : "neutral"} /> {o.active ? "active" : "hidden"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => { setEditing(o); setShow(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
              <button
                onClick={async () => { if (confirm(`Delete offer "${o.title}"?`)) { await adminFetch(`/api/promo-offers/${o.id}`, { method: "DELETE" }); reload(); } }}
                className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]"
              >Delete</button>
            </div>
          </div>
        ))}
      </div>

      {show && (
        <PromoOfferEditor
          initial={editing}
          productOptions={productOptions || []}
          categoryOptions={categoryOptions || []}
          onClose={() => { setShow(false); setEditing(null); }}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function PromoOfferEditor({
  initial,
  productOptions,
  categoryOptions,
  onClose,
  onSaved,
}: {
  initial?: any;
  productOptions: any[];
  categoryOptions: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  function toDateInput(v: string | null | undefined) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  const [f, setF] = useState({
    type: initial?.type || "bank",
    title: initial?.title || "",
    description: initial?.description || "",
    discountType: initial?.discountType || "percent",
    discountValue: initial?.discountValue != null ? String(initial.discountValue) : "",
    maxDiscount: initial?.maxDiscount != null ? String(initial.maxDiscount) : "",
    minOrder: initial?.minOrder != null ? String(initial.minOrder) : "0",
    categoryId: initial?.categoryId != null ? String(initial.categoryId) : "",
    productId: initial?.productId != null ? String(initial.productId) : "",
    active: initial?.active ?? true,
    startsAt: toDateInput(initial?.startsAt),
    expiresAt: toDateInput(initial?.expiresAt),
    sortOrder: initial?.sortOrder != null ? String(initial.sortOrder) : "0",
    provider: initial?.provider || "",
    cardType: initial?.cardType || "",
    emiTenures: initial?.emiTenures || "",
    emiInterestRate: initial?.emiInterestRate != null ? String(initial.emiInterestRate) : "",
    noCostEmi: initial?.noCostEmi ?? false,
    processingFee: initial?.processingFee != null ? String(initial.processingFee) : "",
    minPurchaseAmount: initial?.minPurchaseAmount != null ? String(initial.minPurchaseAmount) : "",
    maxExchangeValue: initial?.maxExchangeValue != null ? String(initial.maxExchangeValue) : "",
    exchangeEligibility: initial?.exchangeEligibility || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isEmi = f.type === "emi";
  const isExchange = f.type === "exchange";
  const isBank = f.type === "bank";
  const isUpi = f.type === "upi";
  const isGenericDiscount = !isEmi && !isExchange; // bank | upi | instant

  // Tenure chip list, kept in sync with the comma-separated emiTenures string.
  const tenureList: string[] = f.emiTenures.split(",").map((s: string) => s.trim()).filter(Boolean);
  function addTenure(months: string) {
    if (!months || tenureList.includes(months)) return;
    const next = [...tenureList, months].sort((a: string, b: string) => Number(a) - Number(b));
    setF({ ...f, emiTenures: next.join(",") });
  }
  function removeTenure(months: string) {
    setF({ ...f, emiTenures: tenureList.filter((t: string) => t !== months).join(",") });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!f.title.trim()) { setError("Offer title is required."); return; }
    if (isGenericDiscount && (!f.discountValue || Number(f.discountValue) <= 0)) {
      setError("Enter a discount value greater than 0."); return;
    }
    if (isEmi && tenureList.length === 0) { setError("Add at least one EMI tenure."); return; }
    if (isExchange && !f.maxExchangeValue) { setError("Enter a maximum exchange value."); return; }

    setBusy(true);
    const url = initial ? `/api/promo-offers/${initial.id}` : "/api/promo-offers";
    const method = initial ? "PUT" : "POST";
    const r = await adminFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f,
        discountValue: isGenericDiscount ? f.discountValue : "0",
        maxDiscount: f.discountType === "fixed" || !isGenericDiscount ? "" : f.maxDiscount,
        startsAt: f.startsAt || null,
        expiresAt: f.expiresAt || null,
      }),
    });
    setBusy(false);
    if (r.ok) { adminToast(`Offer ${initial ? "saved" : "added"} — now live on the site.`); onSaved(); onClose(); }
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Couldn't save this offer.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl my-8">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Offer" : "New Offer"}</h3>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Offer Type">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="adm-input">
              <option value="bank">Bank Card</option>
              <option value="upi">UPI</option>
              <option value="instant">Instant Discount</option>
              <option value="exchange">Exchange</option>
              <option value="emi">EMI</option>
            </select>
          </Field>
          <Field label="Title *">
            <input
              required
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              className="adm-input"
              placeholder={isEmi ? "e.g. Bajaj Finserv No Cost EMI" : isExchange ? "e.g. Old Phone Exchange" : "e.g. HDFC Bank Credit Card"}
            />
          </Field>
        </div>

        {(isBank || isUpi) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={isBank ? "Bank Name" : "UPI / Payment Provider"}>
              <input
                value={f.provider}
                onChange={(e) => setF({ ...f, provider: e.target.value })}
                className="adm-input"
                placeholder={isBank ? "e.g. HDFC Bank" : "e.g. Google Pay"}
              />
            </Field>
            {isBank && (
              <Field label="Card Type">
                <input
                  value={f.cardType}
                  onChange={(e) => setF({ ...f, cardType: e.target.value })}
                  className="adm-input"
                  placeholder="e.g. Credit Card"
                />
              </Field>
            )}
          </div>
        )}

        {isEmi && (
          <Field label="EMI Provider / Bank">
            <input
              value={f.provider}
              onChange={(e) => setF({ ...f, provider: e.target.value })}
              className="adm-input"
              placeholder="e.g. Bajaj Finserv / HDFC Bank"
            />
          </Field>
        )}

        <Field label="Description">
          <input
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            className="adm-input"
            placeholder={isEmi ? "e.g. No cost EMI on all major cards" : isExchange ? "e.g. Instant valuation, in-store only" : "e.g. Credit Card · Includes cashback"}
          />
        </Field>

        {isGenericDiscount && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount Type">
                <select value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value })} className="adm-input">
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed amount (₹)</option>
                </select>
              </Field>
              <Field label={f.discountType === "fixed" ? "Amount off (₹) *" : "Percent off (%) *"}>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={f.discountValue}
                  onChange={(e) => setF({ ...f, discountValue: e.target.value })}
                  className="adm-input"
                />
              </Field>
            </div>

            {f.discountType === "percent" && (
              <Field label="Max Discount Cap (₹) — optional, uncapped if blank">
                <input type="number" min="0" step="0.01" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} className="adm-input" />
              </Field>
            )}

            <Field label="Minimum Order Value (₹)">
              <input type="number" min="0" step="0.01" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} className="adm-input" />
            </Field>
          </>
        )}

        {isEmi && (
          <>
            <Field label="Eligible Tenures (months) *">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tenureList.map((t) => (
                  <span key={t} className="adm-pill flex items-center gap-1 !text-[11px]">
                    {t}m
                    <button type="button" onClick={() => removeTenure(t)} className="text-[var(--adm-rose)] font-bold">×</button>
                  </span>
                ))}
                {tenureList.length === 0 && <span className="text-[12px] text-[var(--adm-muted)]">No tenures added yet</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["3", "6", "9", "12", "18", "24"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => addTenure(m)}
                    disabled={tenureList.includes(m)}
                    className="adm-btn !py-1 !px-2 !text-[11px] disabled:opacity-30"
                  >+ {m}m</button>
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={f.noCostEmi} onChange={(e) => setF({ ...f, noCostEmi: e.target.checked })} />
              No Cost EMI (0% interest to the customer)
            </label>

            {!f.noCostEmi && (
              <Field label="Interest Rate (% p.a.)">
                <input type="number" min="0" step="0.01" value={f.emiInterestRate} onChange={(e) => setF({ ...f, emiInterestRate: e.target.value })} className="adm-input" placeholder="e.g. 14" />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Processing Fee (₹) — optional">
                <input type="number" min="0" step="0.01" value={f.processingFee} onChange={(e) => setF({ ...f, processingFee: e.target.value })} className="adm-input" />
              </Field>
              <Field label="Minimum Purchase Amount (₹)">
                <input type="number" min="0" step="0.01" value={f.minPurchaseAmount} onChange={(e) => setF({ ...f, minPurchaseAmount: e.target.value })} className="adm-input" />
              </Field>
            </div>
          </>
        )}

        {isExchange && (
          <>
            <Field label="Maximum Exchange Value (₹) *">
              <input required type="number" min="0" step="0.01" value={f.maxExchangeValue} onChange={(e) => setF({ ...f, maxExchangeValue: e.target.value })} className="adm-input" placeholder="e.g. 18000" />
            </Field>
            <Field label="Eligibility Note">
              <input value={f.exchangeEligibility} onChange={(e) => setF({ ...f, exchangeEligibility: e.target.value })} className="adm-input" placeholder="e.g. Working display, powers on, no major damage" />
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Limit to Category">
            <select
              value={f.categoryId}
              onChange={(e) => setF({ ...f, categoryId: e.target.value, productId: e.target.value ? f.productId : f.productId })}
              className="adm-input"
              disabled={!!f.productId}
            >
              <option value="">All categories</option>
              {categoryOptions.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Limit to One Product">
            <select
              value={f.productId}
              onChange={(e) => setF({ ...f, productId: e.target.value, categoryId: e.target.value ? "" : f.categoryId })}
              className="adm-input"
            >
              <option value="">All products{f.categoryId ? " in category" : ""}</option>
              {productOptions.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (optional)">
            <input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} className="adm-input" />
          </Field>
          <Field label="Expires (optional)">
            <input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} className="adm-input" />
          </Field>
        </div>

        <Field label="Display Order (lower shows first)">
          <input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} className="adm-input" />
        </Field>

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          Active (visible on the product page)
        </label>

        {error && <p className="text-[12px] font-bold text-[var(--adm-rose)]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : "Save Offer"}</button>
        </div>
      </form>
    </div>
  );
}

