"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";

/**
 * Full variant CRUD for one product, backed by /api/variants.
 *
 * Every colour / RAM / storage option a customer can pick on the product page
 * is a row here: its own price, stock, SKU, photo, swatch colour and
 * availability. Combinations that don't exist here are shown as unselectable on
 * the product page, which is why editing has to be possible in place instead of
 * delete-and-re-add.
 */

export type AdminVariant = {
  id: number;
  productId: number;
  color: string;
  colorHex: string | null;
  swatchImage: string | null;
  ram: string;
  storage: string;
  mrp: string | number;
  mop: string | number;
  stock: number;
  sku: string;
  image: string | null;
  available: boolean;
  sortOrder: number;
};

type Draft = {
  color: string;
  colorHex: string;
  swatchImage: string;
  ram: string;
  storage: string;
  mrp: string;
  mop: string;
  stock: string;
  sku: string;
  image: string;
  available: boolean;
  sortOrder: string;
};

const emptyDraft: Draft = {
  color: "",
  colorHex: "",
  swatchImage: "",
  ram: "",
  storage: "",
  mrp: "",
  mop: "",
  stock: "0",
  sku: "",
  image: "",
  available: true,
  sortOrder: "0",
};

function toDraft(v: AdminVariant): Draft {
  return {
    color: v.color || "",
    colorHex: v.colorHex || "",
    swatchImage: v.swatchImage || "",
    ram: v.ram || "",
    storage: v.storage || "",
    mrp: String(v.mrp ?? ""),
    mop: String(v.mop ?? ""),
    stock: String(v.stock ?? 0),
    sku: v.sku || "",
    image: v.image || "",
    available: v.available !== false,
    sortOrder: String(v.sortOrder ?? 0),
  };
}

function payload(d: Draft) {
  return {
    color: d.color,
    colorHex: d.colorHex,
    swatchImage: d.swatchImage,
    ram: d.ram,
    storage: d.storage,
    mrp: Number(d.mrp) || 0,
    mop: Number(d.mop) || 0,
    stock: Number(d.stock) || 0,
    sku: d.sku,
    image: d.image,
    available: d.available,
    sortOrder: Number(d.sortOrder) || 0,
  };
}

function label(v: AdminVariant) {
  const config = [v.ram ? `${v.ram} RAM` : "", v.storage].filter(Boolean).join(" + ");
  return [config, v.color].filter(Boolean).join(" · ") || "Unnamed variant";
}

export default function VariantManager({
  productId,
  productName,
  onColorsChange,
}: {
  productId: number;
  productName?: string;
  /** Lets the surrounding editor reuse the real colour names (e.g. for tagging photos). */
  onColorsChange?: (colors: string[]) => void;
}) {
  const [items, setItems] = useState<AdminVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await adminFetch(`/api/variants?productId=${productId}`);
      if (!r.ok) throw new Error("failed");
      const d = await r.json();
      const rows = (d.items || []) as AdminVariant[];
      setItems(rows);
      onColorsChange?.(
        Array.from(new Set(rows.map((v) => (v.color || "").trim()).filter(Boolean)))
      );
    } catch {
      setError("Could not load variants.");
    } finally {
      setLoading(false);
    }
  }, [productId, onColorsChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    setBusyId("new");
    setError("");
    setNotice("");
    const r = await adminFetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, ...payload(newDraft) }),
    });
    setBusyId(null);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d?.error || `Could not add variant (${r.status})`);
      return;
    }
    setNewDraft(emptyDraft);
    setAddOpen(false);
    setNotice("Variant added.");
    await load();
  }

  async function update(id: number) {
    setBusyId(id);
    setError("");
    setNotice("");
    const r = await adminFetch(`/api/variants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(draft)),
    });
    setBusyId(null);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d?.error || `Could not save variant (${r.status})`);
      return;
    }
    setEditingId(null);
    setNotice("Variant updated.");
    await load();
  }

  async function remove(v: AdminVariant) {
    if (!window.confirm(`Delete variant "${label(v)}"? Customers will no longer be able to pick it.`)) return;
    setBusyId(v.id);
    setError("");
    setNotice("");
    const r = await adminFetch(`/api/variants/${v.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d?.error || `Could not delete variant (${r.status})`);
      return;
    }
    setNotice("Variant deleted.");
    await load();
  }

  const fields = (d: Draft, set: (next: Draft) => void) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block">
        <span className="adm-eyebrow">Colour</span>
        <input value={d.color} onChange={(e) => set({ ...d, color: e.target.value })} placeholder="Titanium Blue" className="adm-input mt-1 !py-1.5 !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">Swatch hex</span>
        <div className="mt-1 flex items-center gap-2">
          <input value={d.colorHex} onChange={(e) => set({ ...d, colorHex: e.target.value })} placeholder="#1e3a5f" className="adm-input !py-1.5 font-mono-adm !text-[12px]" />
          <span
            aria-hidden="true"
            className="h-6 w-6 shrink-0 rounded-full border border-[var(--adm-line-strong)]"
            style={{ background: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(d.colorHex) ? d.colorHex : "transparent" }}
          />
        </div>
      </label>
      <label className="block">
        <span className="adm-eyebrow">RAM</span>
        <input value={d.ram} onChange={(e) => set({ ...d, ram: e.target.value })} placeholder="12 GB" className="adm-input mt-1 !py-1.5 !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">Storage</span>
        <input value={d.storage} onChange={(e) => set({ ...d, storage: e.target.value })} placeholder="256 GB" className="adm-input mt-1 !py-1.5 !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">MRP (₹)</span>
        <input type="number" min={0} value={d.mrp} onChange={(e) => set({ ...d, mrp: e.target.value })} className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">Selling price (₹)</span>
        <input type="number" min={0} value={d.mop} onChange={(e) => set({ ...d, mop: e.target.value })} className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">Stock</span>
        <input type="number" min={0} value={d.stock} onChange={(e) => set({ ...d, stock: e.target.value })} className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">SKU</span>
        <input value={d.sku} onChange={(e) => set({ ...d, sku: e.target.value })} placeholder="IP17P-256-BLU" className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="block sm:col-span-2">
        <span className="adm-eyebrow">Variant photo URL (shown when this variant is selected)</span>
        <input value={d.image} onChange={(e) => set({ ...d, image: e.target.value })} placeholder="https://…" className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="block sm:col-span-2">
        <span className="adm-eyebrow">Swatch image URL (optional — used instead of the hex colour)</span>
        <input value={d.swatchImage} onChange={(e) => set({ ...d, swatchImage: e.target.value })} placeholder="https://…" className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="block">
        <span className="adm-eyebrow">Display order</span>
        <input type="number" value={d.sortOrder} onChange={(e) => set({ ...d, sortOrder: e.target.value })} className="adm-input mt-1 !py-1.5 font-mono-adm !text-[12px]" />
      </label>
      <label className="mt-1 flex cursor-pointer items-center gap-2 self-end rounded-md border border-[var(--adm-line-strong)] bg-[#fffdf7] px-3 py-1.5 text-[12px] font-semibold text-[var(--adm-muted)]">
        <input type="checkbox" checked={d.available} onChange={(e) => set({ ...d, available: e.target.checked })} className="hidden" />
        <span className={`grid h-3 w-3 place-items-center rounded-sm border border-current ${d.available ? "bg-current" : ""}`} />
        Sellable on the store
      </label>
    </div>
  );

  return (
    <section className="rounded-lg border border-[var(--adm-line-strong)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="adm-eyebrow">Variants ({items.length})</p>
          <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">
            {productName ? `${productName} — ` : ""}each row is one selectable colour + RAM/storage option with its own
            price, stock and photo.
          </p>
        </div>
        <button type="button" onClick={() => setAddOpen((v) => !v)} className="adm-btn !py-1 !text-[11px]">
          {addOpen ? "Cancel" : "Add variant"}
        </button>
      </div>

      {error && <p className="mt-2 text-[12px] text-[var(--adm-rose)]">{error}</p>}
      {notice && !error && <p className="mt-2 text-[12px] text-[var(--adm-pine)]">{notice}</p>}

      {addOpen && (
        <div className="mt-3 rounded-md border border-dashed border-[var(--adm-line-strong)] p-3">
          {fields(newDraft, setNewDraft)}
          <div className="mt-2 flex justify-end">
            <button type="button" disabled={busyId === "new"} onClick={create} className="adm-btn adm-btn--primary !py-1 !text-[11px]">
              {busyId === "new" ? "Adding…" : "Save variant"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">Loading variants…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">
          No variants yet. Without variants the product page sells the product&apos;s own price and stock.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((v) => (
            <li key={v.id} className="rounded-md border border-[var(--adm-line)] bg-[#fffdf7] p-2.5">
              {editingId === v.id ? (
                <>
                  {fields(draft, setDraft)}
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="adm-btn !py-1 !text-[11px]">Cancel</button>
                    <button type="button" disabled={busyId === v.id} onClick={() => update(v.id)} className="adm-btn adm-btn--primary !py-1 !text-[11px]">
                      {busyId === v.id ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 rounded-full border border-[var(--adm-line-strong)]"
                      style={{ background: v.colorHex || "transparent" }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{label(v)}</p>
                      <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">
                        ₹{Number(v.mop).toLocaleString("en-IN")} · MRP ₹{Number(v.mrp).toLocaleString("en-IN")} · stock {v.stock}
                        {v.sku ? ` · ${v.sku}` : ""}
                        {v.available === false ? " · hidden" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(toDraft(v));
                        setEditingId(v.id);
                      }}
                      className="adm-btn !py-1 !text-[11px]"
                    >
                      Edit
                    </button>
                    <button type="button" disabled={busyId === v.id} onClick={() => remove(v)} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
