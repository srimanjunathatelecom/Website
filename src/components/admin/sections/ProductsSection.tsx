"use client";

import { sectionIndex } from "@/lib/adminNav";
import { adminToast } from "@/lib/adminToast";

import { useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, X, Check as CheckIcon } from "lucide-react";
import { adminFetch, buildDownloadUrl } from "@/lib/adminAuth";
import { uploadMediaFile } from "@/lib/uploadMedia";
import VariantManager from "@/components/admin/VariantManager";
import ImportWizard from "@/components/ImportWizard";
import { SectionHeader, useApi, stamp, inr, Field, Check, FilterPill, UrlAddField } from "@/components/admin/shared";

export default function Products() {
  const { data, loading, error, reload } = useApi("/api/products?limit=500", { transform: (d) => d.items as any[] });
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low" | "out" | "hidden" | "active">("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [cats, setCats] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [importCategoryId, setImportCategoryId] = useState<string>("all");
  const [wiping, setWiping] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const wipeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    adminFetch("/api/categories").then((r) => r.ok && r.json()).then((d) => setCats(d?.items || [])).catch(() => {});
    return () => {
      if (wipeTimerRef.current) clearInterval(wipeTimerRef.current);
    };
  }, []);

  const catSlug = (id: number) => cats.find((c) => c.id === id)?.slug || "";
  const items = (data || []).filter((p: any) => {
    if (catFilter !== "all" && catSlug(p.categoryId) !== catFilter) return false;
    if (q && !(`${p.name} ${p.brand} ${p.sku}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (stockFilter === "in_stock" && p.stock <= 0) return false;
    if (stockFilter === "low" && !(p.stock > 0 && p.stock <= p.lowStockThreshold)) return false;
    if (stockFilter === "out" && p.stock > 0) return false;
    if (stockFilter === "hidden" && p.status !== "hidden") return false;
    if (stockFilter === "active" && p.status !== "active") return false;
    const mop = Number(p.mop);
    if (minPrice && mop < Number(minPrice)) return false;
    if (maxPrice && mop > Number(maxPrice)) return false;
    return true;
  });

  const allVisibleSelected = items.length > 0 && items.every((p: any) => selected.has(p.id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const p of items) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of items) next.add(p.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runBulk(payload: any, confirmMsg?: string) {
    if (selected.size === 0) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const r = await adminFetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), ...payload }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setBulkMsg(d.error || "Bulk action failed.");
      } else {
        setBulkMsg(
          payload.action === "delete"
            ? `Deleted ${d.deleted} product${d.deleted === 1 ? "" : "s"}.`
            : `Updated ${d.updated} product${d.updated === 1 ? "" : "s"}.`
        );
        clearSelection();
        reload();
      }
    } catch {
      setBulkMsg("Network error — bulk action failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function adjustStock(p: any, delta: number) {
    const next = Math.max(0, (p.stock || 0) + delta);
    await adminFetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: next }),
    });
    reload();
  }

  async function toggleLive(p: any) {
    await adminFetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: p.status === "active" ? "hidden" : "active" }),
    });
    reload();
  }

  async function toggleFeatured(p: any) {
    await adminFetch(`/api/products/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured: !p.featured }),
    });
    reload();
  }

  async function remove(p: any) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    await adminFetch(`/api/products/${p.id}`, { method: "DELETE" });
    reload();
  }

  async function handleDeleteAll() {
    if (!confirm("Are you ABSOLUTELY sure? This will delete EVERY product and image in your store. This cannot be undone once the timer finishes.")) return;
    setUndoCountdown(7);
    wipeTimerRef.current = setInterval(() => {
      setUndoCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(wipeTimerRef.current!);
          executeWipe();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function executeWipe() {
    setWiping(true);
    const r = await adminFetch("/api/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE ALL PRODUCTS" }),
    });
    setWiping(false);
    if (r.ok) {
      alert("All products have been deleted successfully!");
      reload();
    } else {
      const err = await r.json().catch(() => ({}));
      alert(`Delete failed: ${err.error || 'Unknown database error'}`);
    }
  }

  function cancelWipe() {
    if (wipeTimerRef.current) clearInterval(wipeTimerRef.current);
    setUndoCountdown(0);
  }

  const stockCounts = useMemo(() => {
    const all = data || [];
    return {
      all: all.length,
      in_stock: all.filter((p: any) => p.stock > 0).length,
      low: all.filter((p: any) => p.stock > 0 && p.stock <= p.lowStockThreshold).length,
      out: all.filter((p: any) => p.stock <= 0).length,
      hidden: all.filter((p: any) => p.status === "hidden").length,
      active: all.filter((p: any) => p.status === "active").length,
    };
  }, [data]);

  return (
    <div>
      <SectionHeader index={sectionIndex("products")} kicker="Catalogue" title="Products & stock.">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHistory(true)} className="adm-btn !py-1.5 !text-[12px]">Stock History</button>
          <button onClick={handleDeleteAll} disabled={wiping || undoCountdown > 0} className="adm-btn !text-[var(--adm-rose)] !border-[var(--adm-rose)] !py-1.5 !text-[12px] hover:!bg-[var(--adm-rose)] hover:!text-white">
            {wiping ? "Deleting..." : "Delete All"}
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--adm-line)] p-1">
            <select
              value={importCategoryId}
              onChange={(e) => setImportCategoryId(e.target.value)}
              disabled={undoCountdown > 0}
              title="Which category this import/export applies to"
              className="adm-input !w-auto !border-0 !py-1 !text-[11px]"
            >
              <option value="all">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <a
              href={buildDownloadUrl(importCategoryId === "all" ? "/api/export/stock" : `/api/export/stock?category=${importCategoryId}`, `sms-stock-${importCategoryId === "all" ? "all" : cats.find((c) => String(c.id) === importCategoryId)?.slug || importCategoryId}-${stamp()}.csv`)}
              className="adm-btn !py-1.5 !px-2 !text-[11px]"
              title="Download this category's stock sheet to edit and re-import"
            >
              Export
            </a>
            <button
              onClick={() => setShowImportWizard(true)}
              disabled={undoCountdown > 0}
              className="adm-btn adm-btn--pine !py-1.5 !text-[12px]"
              title="Import stock or products from Excel/CSV with a full preview before anything changes"
            >
              Import
            </button>
          </div>
          <button onClick={() => setShowQuickAdd(true)} disabled={undoCountdown > 0} className="adm-btn adm-btn--pine !py-1.5 !text-[12px]">Quick Add</button>
          <button onClick={() => setEditing({ __new: true })} disabled={undoCountdown > 0} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Product</button>
        </div>
      </SectionHeader>

      {undoCountdown > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--adm-rose)] bg-[#fffdf7] p-3 shadow-sm">
          <div className="flex items-center gap-3 text-[13px] text-[var(--adm-rose)]">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--adm-rose)] text-white animate-pulse font-bold">{undoCountdown}</span>
            <strong>Deletion in progress...</strong>
          </div>
          <button onClick={cancelWipe} className="adm-btn !border-[var(--adm-ink)] !py-1 hover:!bg-[var(--adm-ink)] hover:!text-white">
            Undo Delete
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--adm-line-strong)] bg-[#fffdf7] px-3 py-1.5">
          <span className="text-[var(--adm-muted)] font-mono-adm">SEARCH</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, SKU..." aria-label="Search products by name, brand or SKU" className="w-full bg-transparent text-[13px] outline-none" disabled={undoCountdown > 0} />
        </div>
        <div className="flex items-center gap-1.5">
          <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Min ₹" aria-label="Minimum price in rupees" type="number" className="adm-input !w-24 !py-1.5 !text-[12px]" />
          <span className="text-[var(--adm-muted)]">–</span>
          <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max ₹" aria-label="Maximum price in rupees" type="number" className="adm-input !w-24 !py-1.5 !text-[12px]" />
        </div>
        <button onClick={reload} disabled={undoCountdown > 0} className="adm-btn !py-1.5 !text-[12px]">Refresh</button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterPill active={catFilter === "all"} onClick={() => setCatFilter("all")}>All categories</FilterPill>
        {cats.map((c) => (
          <FilterPill key={c.id} active={catFilter === c.slug} onClick={() => setCatFilter(c.slug)}>{c.name}</FilterPill>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterPill active={stockFilter === "all"} onClick={() => setStockFilter("all")}>All ({stockCounts.all})</FilterPill>
        <FilterPill active={stockFilter === "in_stock"} onClick={() => setStockFilter("in_stock")}>In Stock ({stockCounts.in_stock})</FilterPill>
        <FilterPill active={stockFilter === "low"} onClick={() => setStockFilter("low")}>Low Stock ({stockCounts.low})</FilterPill>
        <FilterPill active={stockFilter === "out"} onClick={() => setStockFilter("out")}>Out of Stock ({stockCounts.out})</FilterPill>
        <FilterPill active={stockFilter === "active"} onClick={() => setStockFilter("active")}>Live ({stockCounts.active})</FilterPill>
        <FilterPill active={stockFilter === "hidden"} onClick={() => setStockFilter("hidden")}>Hidden ({stockCounts.hidden})</FilterPill>
      </div>

      {error && <p className="mb-3 text-[13px] text-[var(--adm-rose)]">Could not load products: {error}</p>}

      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={bulkBusy}
          msg={bulkMsg}
          cats={cats}
          onClear={clearSelection}
          onRun={runBulk}
        />
      )}

      <div className={`overflow-x-auto rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7] ${undoCountdown > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
        <table className="w-full min-w-[1020px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[var(--adm-line)] bg-[var(--adm-paper-2)]/60 text-[10px] uppercase tracking-[0.18em] text-[var(--adm-muted)]">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-3.5 w-3.5" aria-label="Select all visible products" />
              </th>
              <th className="py-3 font-semibold">Product</th>
              <th className="py-3 font-semibold">Category</th>
              <th className="py-3 text-right font-semibold">MRP</th>
              <th className="py-3 text-right font-semibold">MOP</th>
              <th className="py-3 text-right font-semibold">Disc.</th>
              <th className="py-3 text-center font-semibold">Stock</th>
              <th className="py-3 text-center font-semibold">Live</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={9} className="px-4 py-10 text-center font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading catalogue...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-[13px] text-[var(--adm-muted)]">No products match your filters.</td></tr>
            )}
            {items.map((p: any) => {
              const mrp = Number(p.mrp); const mop = Number(p.mop);
              const disc = mrp > 0 ? Math.round(((mrp - mop) / mrp) * 100) : 0;
              const low = p.stock > 0 && p.stock <= p.lowStockThreshold;
              const out = p.stock <= 0;
              return (
                <tr key={p.id} className={`adm-row border-b border-[var(--adm-line)] last:border-0 ${selected.has(p.id) ? "bg-[var(--adm-pine)]/5" : ""}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="h-3.5 w-3.5" aria-label={`Select ${p.name}`} />
                  </td>
                  <td className="py-3">
                    <p className="truncate max-w-[260px] font-semibold">{p.name}</p>
                    <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">#{p.id} · {p.brand || "—"} · {p.sku || "—"}</p>
                  </td>
                  <td className="py-3 text-[12px] text-[var(--adm-muted)]">{cats.find((c) => c.id === p.categoryId)?.name || "—"}</td>
                  <td className="py-3 text-right font-mono-adm text-[12px] text-[var(--adm-muted)] line-through">{inr(mrp)}</td>
                  <td className="py-3 text-right font-mono-adm text-[13px] font-bold">{inr(mop)}</td>
                  <td className="py-3 text-right">
                    {disc > 0 ? <span className="adm-pill adm-pill--good">{disc}%</span> : <span className="text-[var(--adm-muted)]">—</span>}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => adjustStock(p, -1)} className="grid h-6 w-6 place-items-center rounded-md border border-[var(--adm-line)] text-[var(--adm-muted)] transition hover:border-[var(--adm-ink)] hover:text-[var(--adm-ink)]">-</button>
                      <span className={`w-10 text-center font-mono-adm text-[13px] font-bold ${out ? "text-[var(--adm-rose)]" : low ? "text-[var(--adm-amber)]" : "text-[var(--adm-pine)]"}`}>{p.stock}</span>
                      <button onClick={() => adjustStock(p, 1)} className="grid h-6 w-6 place-items-center rounded-md border border-[var(--adm-line)] text-[var(--adm-muted)] transition hover:border-[var(--adm-ink)] hover:text-[var(--adm-ink)]">+</button>
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <button 
                      onClick={() => toggleLive(p)} 
                      title={p.status === "active" ? "Hide from store" : "Show on store"}
                      className={`px-2 py-1 text-[11px] rounded-md border border-[var(--adm-line)] transition mx-auto ${p.status === "active" ? "text-[var(--adm-pine)] border-[var(--adm-pine)] bg-[var(--adm-pine)]/10 font-bold" : "text-[var(--adm-muted)] hover:border-[var(--adm-ink)] hover:text-[var(--adm-ink)] bg-transparent"}`}
                    >
                      {p.status === "active" ? "Live" : "Hidden"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="adm-row-actions flex items-center justify-end gap-2">
                      <button onClick={() => toggleFeatured(p)} className={`adm-btn !py-1 !text-[11px] ${p.featured ? '!text-[var(--adm-amber)] !border-[var(--adm-amber)]' : ''}`}>{p.featured ? 'Unstar' : 'Star'}</button>
                      <button onClick={() => setEditing(p)} className="adm-btn !py-1 !text-[11px]">Edit</button>
                      <button onClick={() => remove(p)} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <ProductEditor initial={editing} cats={cats} onClose={() => setEditing(null)} onSaved={reload} />}
      {showQuickAdd && <QuickAddModal cats={cats} onClose={() => setShowQuickAdd(false)} onPublished={reload} />}
      {showImportWizard && <ImportWizard onClose={() => setShowImportWizard(false)} onImported={reload} />}
      {showHistory && <StockHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  );
}

function BulkActionBar({
  count,
  busy,
  msg,
  cats,
  onClear,
  onRun,
}: {
  count: number;
  busy: boolean;
  msg: string;
  cats: any[];
  onClear: () => void;
  onRun: (payload: any, confirmMsg?: string) => void;
}) {
  const [stockMode, setStockMode] = useState<"delta" | "set">("delta");
  const [stockValue, setStockValue] = useState("");
  const [categoryPick, setCategoryPick] = useState("");

  function applyStock() {
    const n = Number(stockValue);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return;
    if (stockMode === "delta") {
      if (n === 0) return;
      onRun(
        { action: "stock_delta", delta: n },
        `${count} product${count === 1 ? "" : "s"} selected.\n${n > 0 ? `Increase` : `Decrease`} stock by ${Math.abs(n)} unit${Math.abs(n) === 1 ? "" : "s"}?`
      );
    } else {
      if (n < 0) return;
      onRun(
        { action: "stock_set", value: n },
        `${count} product${count === 1 ? "" : "s"} selected.\nSet stock to exactly ${n} for all of them?`
      );
    }
  }

  function applyCategory() {
    if (!categoryPick) return;
    const cat = cats.find((c) => String(c.id) === categoryPick);
    onRun(
      { action: "set_category", categoryId: Number(categoryPick) },
      `${count} product${count === 1 ? "" : "s"} selected.\nMove all to category "${cat?.name || categoryPick}"?`
    );
  }

  return (
    <div className="adm-card mb-4 flex flex-wrap items-center gap-3 border-[var(--adm-pine)] bg-[var(--adm-pine)]/5 p-3">
      <span className="font-mono-adm text-[12px] font-bold text-[var(--adm-pine)]">{count} selected</span>

      <div className="flex items-center gap-1.5 rounded-md border border-[var(--adm-line)] bg-[#fffdf7] px-2 py-1">
        <select value={stockMode} onChange={(e) => setStockMode(e.target.value as any)} className="bg-transparent text-[11px] font-mono-adm outline-none">
          <option value="delta">Adjust by</option>
          <option value="set">Set to</option>
        </select>
        <input
          type="number"
          value={stockValue}
          onChange={(e) => setStockValue(e.target.value)}
          placeholder={stockMode === "delta" ? "+5 / -5" : "10"}
          className="w-16 bg-transparent text-[12px] font-mono-adm outline-none"
        />
        <button onClick={applyStock} disabled={busy || !stockValue} className="adm-btn !py-1 !px-2 !text-[11px] disabled:opacity-40">Apply</button>
      </div>

      <button disabled={busy} onClick={() => onRun({ action: "set_status", status: "active" }, `Show ${count} product${count === 1 ? "" : "s"} on the storefront?`)} className="adm-btn !py-1.5 !text-[12px]">Activate</button>
      <button disabled={busy} onClick={() => onRun({ action: "set_status", status: "hidden" }, `Hide ${count} product${count === 1 ? "" : "s"} from the storefront?`)} className="adm-btn !py-1.5 !text-[12px]">Hide</button>
      <button disabled={busy} onClick={() => onRun({ action: "set_featured", value: true })} className="adm-btn !py-1.5 !text-[12px]">Feature</button>
      <button disabled={busy} onClick={() => onRun({ action: "set_featured", value: false })} className="adm-btn !py-1.5 !text-[12px]">Unfeature</button>
      <button disabled={busy} onClick={() => onRun({ action: "set_bestseller", value: true })} className="adm-btn !py-1.5 !text-[12px]">Mark Bestseller</button>
      <button disabled={busy} onClick={() => onRun({ action: "set_new_arrival", value: true })} className="adm-btn !py-1.5 !text-[12px]">Mark New Arrival</button>

      <div className="flex items-center gap-1.5 rounded-md border border-[var(--adm-line)] bg-[#fffdf7] px-2 py-1">
        <select value={categoryPick} onChange={(e) => setCategoryPick(e.target.value)} className="bg-transparent text-[11px] font-mono-adm outline-none">
          <option value="">Move to category...</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={applyCategory} disabled={busy || !categoryPick} className="adm-btn !py-1 !px-2 !text-[11px] disabled:opacity-40">Apply</button>
      </div>

      <button
        disabled={busy}
        onClick={() => onRun({ action: "delete" }, `Delete ${count} product${count === 1 ? "" : "s"}? This cannot be undone and will remove their images too.`)}
        className="adm-btn !py-1.5 !text-[12px] !text-[var(--adm-rose)]"
      >
        Delete Selected
      </button>

      {msg && <span className="font-mono-adm text-[11px] text-[var(--adm-muted)]">{msg}</span>}
      <button onClick={onClear} className="ml-auto adm-btn !py-1.5 !text-[12px]">Clear selection</button>
    </div>
  );
}

function StockHistoryModal({ onClose }: { onClose: () => void }) {
  const { data, loading } = useApi("/api/stock-history?limit=100", { transform: (d) => d.items as any[] });
  const rows = data || [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-[14px] bg-[var(--adm-paper)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--adm-line)] p-5">
          <h3 className="font-display-adm text-[20px]">Stock change history.</h3>
          <button onClick={onClose} className="adm-btn !py-1 !px-2.5 !text-[12px]">Close</button>
        </div>
        <div className="overflow-y-auto p-5">
          {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
          {!loading && rows.length === 0 && <p className="text-[13px] text-[var(--adm-muted)]">No stock changes recorded yet.</p>}
          <ul className="divide-y divide-[var(--adm-line)]">
            {rows.map((h: any) => (
              <li key={h.id} className="py-3 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold truncate">{h.productName || `Product #${h.productId}`}</p>
                  <span className={`font-mono-adm text-[12px] font-bold ${h.change > 0 ? "text-[var(--adm-pine)]" : "text-[var(--adm-rose)]"}`}>
                    {h.change > 0 ? "+" : ""}{h.change}
                  </span>
                </div>
                <p className="mt-0.5 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                  {h.oldStock} → {h.newStock} · {h.reason || "—"} · {h.adminName || "Admin"} · {new Date(h.createdAt).toLocaleString("en-IN")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function QuickAddModal({ cats, onClose, onPublished }: { cats: any[]; onClose: () => void; onPublished: () => void }) {
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: any[]; failed: any[] } | null>(null);

  async function parse() {
    if (!text.trim()) { setError("Paste at least one product line."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await adminFetch("/api/products/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Could not parse input."); return; }
      setRows(d.items.map((it: any) => ({ ...it, include: !it.hasBlockingIssue })));
      setStep("review");
    } catch {
      setError("Network error while parsing.");
    } finally {
      setBusy(false);
    }
  }

  function updateRow(index: number, patch: any) {
    setRows((prev) => prev.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  }

  async function publish() {
    const toPublish = rows.filter((r) => r.include && r.name);
    if (toPublish.length === 0) { setError("No rows selected to publish."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await adminFetch("/api/products/quick-add/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: toPublish.map((r) => ({
            name: r.name,
            brand: r.brand,
            categoryId: r.suggestedCategoryId,
            ram: r.ram,
            storage: r.storage,
            color: r.color,
            mrp: r.mrp,
            mop: r.mop,
            stock: r.stock,
          })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Publish failed."); return; }
      setResult({ created: d.created || [], failed: d.failed || [] });
      setStep("done");
      onPublished();
    } catch {
      setError("Network error while publishing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-[14px] bg-[var(--adm-paper)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--adm-line)] p-5">
          <div>
            <h3 className="font-display-adm text-[20px]">Quick Add.</h3>
            <p className="mt-0.5 text-[12px] text-[var(--adm-muted)]">
              {step === "paste" && "Paste one product per line — nothing is saved until you review and confirm."}
              {step === "review" && "Review each row before publishing. Nothing goes live until you confirm."}
              {step === "done" && "Done — new products were saved as Hidden. Review and activate them from the table."}
            </p>
          </div>
          <button onClick={onClose} className="adm-btn !py-1 !px-2.5 !text-[12px]">Close</button>
        </div>

        <div className="overflow-y-auto p-5">
          {step === "paste" && (
            <div>
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Samsung Galaxy S24 Ultra 256GB Black 79999 94999 10\nOnePlus Nord CE4 5G 27999 31999 15\nVivo Y21 5G 6GB 128GB 16999 18999 8"}
                className="adm-input w-full font-mono-adm !text-[12px] !leading-relaxed"
              />
              <p className="mt-2 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                Format per line: name and specs, then up to 3 trailing numbers read as MOP, MRP, stock. Missing numbers are left blank for you to fill in — nothing is guessed for price or stock.
              </p>
              {error && <p className="mt-3 text-[13px] font-bold text-[var(--adm-rose)]">{error}</p>}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.index} className={`rounded-xl border p-3 ${r.hasBlockingIssue ? "border-[var(--adm-rose)] bg-[var(--adm-rose)]/5" : "border-[var(--adm-line)] bg-[#fffdf7]"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={!!r.include} onChange={(e) => updateRow(r.index, { include: e.target.checked })} disabled={r.hasBlockingIssue} className="mt-1.5 h-3.5 w-3.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono-adm text-[10px] text-[var(--adm-muted)] truncate">&quot;{r.raw}&quot;</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <input value={r.name} onChange={(e) => updateRow(r.index, { name: e.target.value })} placeholder="Product name" className="adm-input !py-1.5 !text-[12px] lg:col-span-2" />
                        <input value={r.brand} onChange={(e) => updateRow(r.index, { brand: e.target.value })} placeholder="Brand" className="adm-input !py-1.5 !text-[12px]" />
                        <select value={r.suggestedCategoryId ?? ""} onChange={(e) => updateRow(r.index, { suggestedCategoryId: Number(e.target.value) })} className="adm-input !py-1.5 !text-[12px]">
                          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input value={r.mop ?? ""} onChange={(e) => updateRow(r.index, { mop: e.target.value === "" ? null : Number(e.target.value) })} placeholder="MOP (selling price)" type="number" className="adm-input !py-1.5 !text-[12px]" />
                        <input value={r.mrp ?? ""} onChange={(e) => updateRow(r.index, { mrp: e.target.value === "" ? null : Number(e.target.value) })} placeholder="MRP" type="number" className="adm-input !py-1.5 !text-[12px]" />
                        <input value={r.stock ?? ""} onChange={(e) => updateRow(r.index, { stock: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Stock" type="number" className="adm-input !py-1.5 !text-[12px]" />
                        <span className={`self-center font-mono-adm text-[10px] ${r.categoryConfidence === "high" ? "text-[var(--adm-pine)]" : r.categoryConfidence === "medium" ? "text-[var(--adm-amber)]" : "text-[var(--adm-muted)]"}`}>
                          Category confidence: {r.categoryConfidence}
                        </span>
                      </div>
                      {r.warnings?.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {r.warnings.map((w: string, wi: number) => (
                            <li key={wi} className="text-[11px] text-[var(--adm-amber)]"><AlertTriangle aria-hidden className="mr-1 inline h-3 w-3 align-[-1px]" />{w}</li>
                          ))}
                        </ul>
                      )}
                      {r.hasBlockingIssue && <p className="mt-1 text-[11px] font-bold text-[var(--adm-rose)]">No product name detected — this row is excluded until fixed.</p>}
                    </div>
                  </div>
                </div>
              ))}
              {error && <p className="text-[13px] font-bold text-[var(--adm-rose)]">{error}</p>}
            </div>
          )}

          {step === "done" && result && (
            <div className="space-y-4">
              {result.created.length > 0 && (
                <div>
                  <p className="adm-eyebrow mb-2">Published as Hidden ({result.created.length})</p>
                  <ul className="space-y-1">
                    {result.created.map((c) => <li key={c.id} className="text-[13px]"><CheckIcon aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--adm-pine)]" />{c.name}</li>)}
                  </ul>
                </div>
              )}
              {result.failed.length > 0 && (
                <div>
                  <p className="adm-eyebrow mb-2 !text-[var(--adm-rose)]">Failed ({result.failed.length})</p>
                  <ul className="space-y-1">
                    {result.failed.map((f, i) => <li key={i} className="text-[13px] text-[var(--adm-rose)]"><X aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{f.name}: {f.error}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--adm-line)] p-5">
          {step === "paste" && (
            <button onClick={parse} disabled={busy || !text.trim()} className="adm-btn adm-btn--primary">{busy ? "Parsing..." : "Preview"}</button>
          )}
          {step === "review" && (
            <>
              <button onClick={() => setStep("paste")} className="adm-btn">Back</button>
              <button onClick={publish} disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Publishing..." : `Publish ${rows.filter((r) => r.include).length} product(s)`}</button>
            </>
          )}
          {step === "done" && (
            <button onClick={onClose} className="adm-btn adm-btn--primary">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}


function ProductEditor({ initial, cats, onClose, onSaved }: { initial: any; cats: any[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !!initial.__new;
  const [f, setF] = useState({
    name: initial.name || "",
    brand: initial.brand || "",
    categoryId: initial.categoryId || cats[0]?.id || 0,
    description: initial.description || "",
    specifications: initial.specifications || "",
    mrp: initial.mrp || "",
    mop: initial.mop || "",
    stock: initial.stock ?? 0,
    lowStockThreshold: initial.lowStockThreshold ?? 5,
    sku: initial.sku || "",
    warranty: initial.warranty || "",
    imageSource: initial.imageSource || "Manufacturer-authorized",
    featured: !!initial.featured,
    bestseller: !!initial.bestseller,
    newArrival: !!initial.newArrival,
    trending: !!initial.trending,
    limitedStock: !!initial.limitedStock,
    hotDeal: !!initial.hotDeal,
    status: initial.status || "active",
    highlights: initial.highlights || "",
    boxContents: initial.boxContents || "",
    saleBadge: initial.saleBadge || "",
    protectPromiseFee: initial.protectPromiseFee || "",
    sellerName: initial.sellerName || "",
    sellerRating: initial.sellerRating ?? "",
    sellerYears: initial.sellerYears ?? "",
  });
  // Multiple images, in display order — first one is the primary/cover image.
  // Previously this only kept a single image and silently dropped the rest of
  // an existing product's gallery on every edit; now the full array round-trips.
  // Media rows, in display order — the first still image is the cover. Each row
  // carries its own alt text, colour association (so the product page can show
  // colour-specific photos) and image/video type.
  type MediaRow = { url: string; alt: string; variantColor: string; mediaType: "image" | "video" };
  const initialImages: MediaRow[] = (() => {
    const media = (initial?.media as any[]) || [];
    if (media.length) {
      return media.map((m) => ({
        url: String(m.url || ""),
        alt: String(m.alt || ""),
        variantColor: String(m.variantColor || ""),
        mediaType: m.mediaType === "video" ? ("video" as const) : ("image" as const),
      }));
    }
    const urls: string[] = (initial?.images && initial.images.length > 0)
      ? initial.images
      : (initial?.primaryImage ? [initial.primaryImage] : []);
    return urls.map((url) => ({ url, alt: "", variantColor: "", mediaType: "image" as const }));
  })();
  const [images, setImages] = useState<MediaRow[]>(initialImages);
  // Real variant colour names, supplied by the variant manager below, so photos
  // can be tagged with a colour that actually exists.
  const [variantColors, setVariantColors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const dataUrls = await Promise.all(files.map((file) => uploadMediaFile(file).catch(() => ""))).then((urls) =>
      urls.filter(Boolean)
    );
    setImages((prev) => [
      ...prev,
      ...dataUrls.map((url) => ({ url, alt: "", variantColor: "", mediaType: "image" as const })),
    ]);
    e.target.value = "";
  }

  function addImageUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    const isVideo = /\.(mp4|webm|ogg)(\?|$)/i.test(trimmed);
    setImages((prev) => [
      ...prev,
      { url: trimmed, alt: "", variantColor: "", mediaType: isVideo ? "video" : "image" },
    ]);
  }

  function patchImage(idx: number, patch: Partial<MediaRow>) {
    setImages((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveImage(idx: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    // Client-side pre-check mirroring the backend rules in
    // validateProductInput — instant feedback, but the backend check
    // is still what actually protects the data.
    const mrpNum = Number(f.mrp);
    const mopNum = Number(f.mop);
    const stockNum = Number(f.stock);
    if (!f.name.trim()) { setErr("Product name is required."); return; }
    if (!Number.isFinite(mrpNum) || mrpNum < 0) { setErr("MRP must be a valid number, 0 or more."); return; }
    if (!Number.isFinite(mopNum) || mopNum < 0) { setErr("Selling price (MOP) must be a valid number, 0 or more."); return; }
    if (mrpNum > 0 && mopNum > mrpNum) { setErr("Selling price (MOP) cannot be higher than MRP."); return; }
    if (!Number.isFinite(stockNum) || !Number.isInteger(stockNum) || stockNum < 0) { setErr("Stock must be a whole number, 0 or more."); return; }

    setBusy(true);
    const payload = {
      ...f,
      mrp: mrpNum,
      mop: mopNum,
      stock: stockNum,
      lowStockThreshold: Number(f.lowStockThreshold) || 5,
      images: images.map((m, i) => ({
        dataUrl: m.url,
        alt: m.alt.trim() || `${f.name} ${i + 1}`.trim(),
        variantColor: m.variantColor.trim(),
        mediaType: m.mediaType,
      })),
    };
    const url = isNew ? "/api/products" : `/api/products/${initial.id}`;
    const r = await adminFetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (r.ok) { adminToast(`Product ${isNew ? "added" : "saved"} — now live on the site.`); onSaved(); onClose(); }
    else { const d = await r.json().catch(() => ({})); setErr(d?.error || `Save failed (${r.status})`); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="adm-eyebrow">{isNew ? "New entry" : `Edit #${initial.id}`}</p>
            <h3 className="font-display-adm text-[22px]">{isNew ? "Add Product" : "Edit Product"}</h3>
          </div>
          <button onClick={onClose} className="adm-btn !py-1.5 !px-3">Close</button>
        </div>
        <form onSubmit={save} className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <Field label="Name *"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="adm-input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand"><input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} className="adm-input" /></Field>
              <Field label="Category *">
                <select required value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: Number(e.target.value) })} className="adm-input">
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="MRP *"><input required type="number" value={f.mrp} onChange={(e) => setF({ ...f, mrp: e.target.value })} className="adm-input font-mono-adm" /></Field>
              <Field label="MOP *"><input required type="number" value={f.mop} onChange={(e) => setF({ ...f, mop: e.target.value })} className="adm-input font-mono-adm" /></Field>
              <Field label="Stock"><input type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="adm-input font-mono-adm" /></Field>
              <Field label="Low-stock at"><input type="number" value={f.lowStockThreshold} onChange={(e) => setF({ ...f, lowStockThreshold: e.target.value })} className="adm-input font-mono-adm" /></Field>
              <Field label="SKU"><input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} className="adm-input font-mono-adm" /></Field>
              <Field label="Warranty"><input value={f.warranty} onChange={(e) => setF({ ...f, warranty: e.target.value })} className="adm-input" /></Field>
            </div>
            {/* A variant product sells only through its variants, so the price
                and stock above are recalculated from them on save. Saying so
                here prevents the store owner typing a price, seeing the field
                change back, and assuming the save failed. */}
            {variantColors.length > 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <strong>This product sells by variant.</strong> Shoppers buy a specific colour / RAM / storage, so
                the price and stock above are recalculated on save from the cheapest variant that is in stock, and
                shown on listings as the &ldquo;starting from&rdquo; price. To change what a shopper actually pays,
                edit the prices in <strong>Variants</strong> below.
              </p>
            )}
            <Field label="Description"><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="adm-input" /></Field>
            <Field label="Specifications (one per line: Label | Value)">
              <textarea
                rows={6}
                value={f.specifications}
                onChange={(e) => setF({ ...f, specifications: e.target.value })}
                placeholder={"## Display\nSize | 6.3 inch\nType | OLED\n## Battery\nCapacity | 4500 mAh"}
                className="adm-input font-mono-adm !text-[12px]"
              />
            </Field>
            <p className="font-mono-adm text-[10px] text-[var(--adm-muted)] -mt-2">
              Start a line with <b>## Group name</b> (e.g. ## Display, ## Camera, ## Battery) to group the
              rows beneath it on the product page. Rows before the first group heading appear under
              &quot;General&quot;. Existing single-list specifications keep working unchanged.
            </p>

            <Field label="What's in the box (one item per line)">
              <textarea
                rows={3}
                value={f.boxContents}
                onChange={(e) => setF({ ...f, boxContents: e.target.value })}
                placeholder={"Handset\nUSB-C cable\nSIM ejector tool\nUser guide"}
                className="adm-input font-mono-adm !text-[12px]"
              />
            </Field>

            <div className="rounded-lg border border-[var(--adm-line-strong)] p-3 space-y-3">
              <p className="adm-eyebrow">Product page highlights (Flipkart-style)</p>
              <Field label="Highlight chips — one per line, format: Icon | Detail line | Bold headline">
                <textarea
                  rows={5}
                  value={f.highlights}
                  onChange={(e) => setF({ ...f, highlights: e.target.value })}
                  placeholder={"ram | 512 GB ROM |\nprocessor | A19 Chip, 6 Core, Hexa Core, 4.26 GHz | Superfast Multitasking. Extensive Gaming\ncamera | 48MP + 48MP + 48MP Rear Camera | DSLR Like Pictures & Great Zoom\nfrontCamera | 18MP Front Camera |\ndisplay | 6.3 inch All Screen OLED Display | Cinematic Display. Sharpest Colours"}
                  className="adm-input font-mono-adm !text-[12px]"
                />
              </Field>
              <p className="font-mono-adm text-[10px] text-[var(--adm-muted)] -mt-1">
                Icon options: ram, processor, camera, frontCamera, display, battery. Leave the headline blank if you only want the detail line (like ROM/front camera).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sale badge (e.g. Top Discount of the Sale)"><input value={f.saleBadge} onChange={(e) => setF({ ...f, saleBadge: e.target.value })} className="adm-input" /></Field>
                <Field label="Protect Promise fee (e.g. +₹220 Protect Promise Fee)"><input value={f.protectPromiseFee} onChange={(e) => setF({ ...f, protectPromiseFee: e.target.value })} className="adm-input" /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Seller name"><input value={f.sellerName} onChange={(e) => setF({ ...f, sellerName: e.target.value })} placeholder="Vision Star" className="adm-input" /></Field>
                <Field label="Seller rating"><input type="number" step="0.1" min="0" max="5" value={f.sellerRating} onChange={(e) => setF({ ...f, sellerRating: e.target.value })} placeholder="4.7" className="adm-input font-mono-adm" /></Field>
                <Field label="Years with us"><input type="number" min="0" value={f.sellerYears} onChange={(e) => setF({ ...f, sellerYears: e.target.value })} placeholder="9" className="adm-input font-mono-adm" /></Field>
              </div>
            </div>

            <Field label="Image source (legal)">
              <select value={f.imageSource} onChange={(e) => setF({ ...f, imageSource: e.target.value })} className="adm-input">
                <option>Manufacturer-authorized</option>
                <option>Our own photo</option>
              </select>
            </Field>
            <div className="rounded-lg border border-[var(--adm-line-strong)] p-3 space-y-2">
              <p className="adm-eyebrow">Product page badges</p>
              <div className="flex flex-wrap gap-2">
                <Check label="Bestseller" checked={f.bestseller} onChange={(v) => setF({ ...f, bestseller: v })} />
                <Check label="New arrival" checked={f.newArrival} onChange={(v) => setF({ ...f, newArrival: v })} />
                <Check label="Trending" checked={f.trending} onChange={(v) => setF({ ...f, trending: v })} />
                <Check label="Hot deal" checked={f.hotDeal} onChange={(v) => setF({ ...f, hotDeal: v })} />
                <Check label="Limited stock" checked={f.limitedStock} onChange={(v) => setF({ ...f, limitedStock: v })} />
              </div>
              <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">
                These appear as badges under the product title. The sale badge above is shown alongside them.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Check label="Featured" checked={f.featured} onChange={(v) => setF({ ...f, featured: v })} />
              <Check label="Live on store" checked={f.status === "active"} onChange={(v) => setF({ ...f, status: v ? "active" : "hidden" })} />
            </div>
          </div>
          <div className="space-y-3">
            <p className="adm-eyebrow">Media ({images.length})</p>
            <p className="font-mono-adm text-[10px] text-[var(--adm-muted)] -mt-2">
              First still image is the cover on product cards. Tag a photo with a colour to show it only
              when that colour is selected on the product page; leave the colour blank for shared shots.
            </p>

            {images.length > 0 ? (
              <div className="space-y-2">
                {images.map((im, i) => (
                  <div key={i} className="rounded-lg border border-[var(--adm-line-strong)] bg-white p-2">
                    <div className="flex gap-2">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-[var(--adm-line)] bg-white">
                        {im.mediaType === "video" ? (
                          <div className="grid h-full place-items-center font-mono-adm text-[9px] text-[var(--adm-muted)]">VIDEO</div>
                        ) : (
                          <img src={im.url} alt="" className="h-full w-full object-contain" />
                        )}
                        {i === 0 && (
                          <span className="absolute left-0.5 top-0.5 rounded bg-[var(--adm-ink)] px-1 py-0.5 font-mono-adm text-[8px] text-[var(--adm-paper)]">COVER</span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <input
                          value={im.alt}
                          onChange={(e) => patchImage(i, { alt: e.target.value })}
                          placeholder="Alt text (for accessibility & SEO)"
                          className="adm-input !py-1 !text-[11px]"
                        />
                        <div className="flex gap-1">
                          <input
                            value={im.variantColor}
                            onChange={(e) => patchImage(i, { variantColor: e.target.value })}
                            list="adm-variant-colors"
                            placeholder="Colour (optional)"
                            className="adm-input !py-1 !text-[11px]"
                          />
                          <select
                            value={im.mediaType}
                            onChange={(e) => patchImage(i, { mediaType: e.target.value === "video" ? "video" : "image" })}
                            className="adm-input !w-[74px] !py-1 !text-[11px]"
                          >
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-end gap-1">
                      <button type="button" title="Move up" disabled={i === 0} onClick={() => moveImage(i, -1)} className="adm-btn !px-2 !py-0.5 !text-[11px] disabled:opacity-30"><ArrowUp aria-hidden className="h-3 w-3" /><span className="sr-only">Move up</span></button>
                      <button type="button" title="Move down" disabled={i === images.length - 1} onClick={() => moveImage(i, 1)} className="adm-btn !px-2 !py-0.5 !text-[11px] disabled:opacity-30"><ArrowDown aria-hidden className="h-3 w-3" /><span className="sr-only">Move down</span></button>
                      <button type="button" title="Remove" onClick={() => removeImage(i)} className="adm-btn !px-2 !py-0.5 !text-[11px] !text-[var(--adm-rose)]">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-square overflow-hidden rounded-lg border border-[var(--adm-line-strong)] bg-white">
                <div className="grid h-full place-items-center font-mono-adm text-[10px] text-[var(--adm-muted)]">NO MEDIA</div>
              </div>
            )}

            <label className="adm-btn adm-btn--pine w-full cursor-pointer justify-center !py-2 !text-[12px]">
              Upload Image(s)
              <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
            </label>

            <UrlAddField onAdd={addImageUrl} />

            <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">JPG / PNG · under 5 MB recommended per image</p>
          </div>
          <datalist id="adm-variant-colors">
            {variantColors.map((c) => <option key={c} value={c} />)}
          </datalist>

          <div className="md:col-span-2">
            {isNew ? (
              <p className="mb-3 rounded-lg border border-dashed border-[var(--adm-line-strong)] p-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                Colour / RAM / storage variants can be added right here once the product is created.
              </p>
            ) : (
              <div className="mb-4">
                <VariantManager productId={initial.id} productName={initial.name} onColorsChange={setVariantColors} />
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            {err && <p className="mb-3 text-[13px] text-[var(--adm-rose)]">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
              <button type="submit" disabled={busy} className="adm-btn adm-btn--primary">{busy ? "Saving..." : isNew ? "Create Product" : "Save Changes"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

