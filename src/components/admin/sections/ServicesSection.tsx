"use client";

import { sectionIndex } from "@/lib/adminNav";
import { adminToast } from "@/lib/adminToast";

import { useEffect, useState } from "react";
import React from "react";
import { Check as CheckIcon } from "lucide-react";
import { adminFetch } from "@/lib/adminAuth";
import { uploadMediaFile } from "@/lib/uploadMedia";
import { SectionHeader, useApi, Empty, Field, Check } from "@/components/admin/shared";

export default function Services() {
  const { data, loading, reload } = useApi("/api/services", { transform: (d) => d.items as any[] });
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [busyInstall, setBusyInstall] = useState(false);
  const [autoFill, setAutoFill] = useState(false);

  const rows = data || [];

  // Surface of the imageSource JSON (set by the catalogue installer and the
  // auto-fill workflow) — tells the owner which photos still want a look.
  const sourceInfo = (s: any): { status?: string; name?: string; url?: string; note?: string } => {
    try { return s.imageSource ? JSON.parse(s.imageSource) : {}; } catch { return {}; }
  };
  const reviewCount = rows.filter((s: any) => sourceInfo(s).status === "needs_review").length;
  const missingCount = rows.filter((s: any) => !(s.image || "").trim()).length;

  async function remove(id: number) {
    if (!confirm("Delete this service?")) return;
    await adminFetch(`/api/services/${id}`, { method: "DELETE" });
    reload();
  }

  async function installCatalogue() {
    if (busyInstall) return;
    setBusyInstall(true);
    const r = await adminFetch("/api/services/install-catalogue", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusyInstall(false);
    if (!r.ok) { adminToast(d.error || "Could not install the catalogue.", "bad"); return; }
    adminToast(`Repair catalogue: ${d.created?.length || 0} added, ${d.updated?.length || 0} filled in, ${d.skipped?.length || 0} already complete.`);
    reload();
  }

  return (
    <div>
      <SectionHeader index={sectionIndex("services")} kicker="Service bay" title="Service catalogue.">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAutoFill(true)} className="adm-btn !py-1.5 !text-[12px]">
            Auto-fill images{missingCount > 0 ? ` (${missingCount})` : ""}
          </button>
          <button onClick={installCatalogue} disabled={busyInstall} className="adm-btn !py-1.5 !text-[12px] disabled:opacity-50">
            {busyInstall ? "Installing..." : "Install repair catalogue"}
          </button>
          <button onClick={() => { setEditing(null); setShowNew(true); }} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">+ Add Service</button>
        </div>
      </SectionHeader>

      {reviewCount > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700">
          {reviewCount} service photo{reviewCount > 1 ? "s" : ""} marked “check photo” — open the service, look at the picture, and press “Photo is right” if it matches.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {loading && !data && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>}
        {!loading && rows.length === 0 && <Empty label="No services yet" hint="Press “Install repair catalogue” to load the full mobile-repair list with photos, or add one by hand." />}
        {rows.map((s: any) => {
          const src = sourceInfo(s);
          return (
            <div key={s.id} className="adm-card flex items-start gap-3 p-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--adm-paper-2)]">
                {s.image
                  ? <img src={s.image} alt="" className="h-full w-full object-cover" />
                  : <span className="grid h-full w-full place-items-center font-mono-adm text-[9px] text-[var(--adm-muted)]">NO PHOTO</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display-adm text-[15px]">
                  {s.name}
                  {s.featured ? <span className="ml-2 rounded bg-[var(--adm-pine)]/10 px-1.5 py-0.5 font-mono-adm text-[9px] font-bold uppercase text-[var(--adm-pine)]">Featured</span> : null}
                  {s.status === "hidden" ? <span className="ml-2 rounded bg-[var(--adm-paper-2)] px-1.5 py-0.5 font-mono-adm text-[9px] font-bold uppercase text-[var(--adm-muted)]">Hidden</span> : null}
                </p>
                <p className="clamp-2 mt-1 text-[12px] text-[var(--adm-muted)]">{s.description}</p>
                <p className="mt-1.5 font-mono-adm text-[11px] text-[var(--adm-muted)]">{[s.category, s.deviceTypes, s.turnaround].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 font-mono-adm text-[12px] font-bold text-[var(--adm-pine)]">{s.startPrice}</p>
                {src.status === "needs_review" && (
                  <p className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 font-mono-adm text-[10px] font-bold uppercase text-amber-700">Check photo</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => { setEditing(s); setShowNew(true); }} className="adm-btn !py-1 !text-[11px]">Edit</button>
                <button onClick={() => remove(s.id)} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <ServiceEditor initial={editing} onClose={() => { setShowNew(false); setEditing(null); }} onSaved={reload} />}
      {autoFill && <ServiceAutoFill onClose={() => setAutoFill(false)} onApplied={reload} />}
    </div>
  );
}

/**
 * Auto-Fill Service Images — preview → apply. Scans for services whose
 * photo is missing or points at a file that no longer exists, proposes the
 * best match from the built-in library of licence-verified repair photos,
 * applies the confident ones in one click and leaves doubtful ones as
 * explicit per-row choices. The owner only deals with exceptions.
 */
function ServiceAutoFill({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let alive = true;
    adminFetch("/api/services/auto-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview" }) })
      .then((r) => r.json())
      .then((d) => { if (alive) { setPreview(d); setBusy(false); } })
      .catch(() => { if (alive) { setPreview({ proposals: [] }); setBusy(false); } });
    return () => { alive = false; };
  }, []);

  async function apply(ids?: number[]) {
    if (applying) return;
    setApplying(true);
    const r = await adminFetch("/api/services/auto-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "apply", ...(ids ? { ids } : {}) }) });
    const d = await r.json().catch(() => ({}));
    setApplying(false);
    if (!r.ok) { adminToast(d.error || "Could not apply images.", "bad"); return; }
    adminToast(`${d.applied || 0} photo${(d.applied || 0) === 1 ? "" : "s"} assigned.`);
    onApplied();
    if (ids) {
      // Re-preview so the row disappears from the list instead of going stale.
      setBusy(true);
      const rr = await adminFetch("/api/services/auto-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview" }) });
      setPreview(await rr.json().catch(() => ({ proposals: [] })));
      setBusy(false);
    } else {
      onClose();
    }
  }

  const proposals: any[] = preview?.proposals || [];
  const autoCount = proposals.filter((p) => p.match?.action === "auto").length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <h3 className="font-display-adm text-[20px]">Auto-fill service photos</h3>
        <p className="mt-1 text-[12px] text-[var(--adm-muted)]">
          Finds services with a missing or broken photo and matches them against the built-in library of real, licence-checked repair photos. Nothing is invented — a service with no good match is simply listed.
        </p>

        {busy && <p className="mt-4 font-mono-adm text-[12px] text-[var(--adm-muted)]">Scanning services...</p>}

        {!busy && proposals.length === 0 && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
            Every service already has a working photo — nothing to do.
          </p>
        )}

        {!busy && proposals.length > 0 && (
          <>
            <div className="mt-4 space-y-2">
              {proposals.map((p) => (
                <div key={p.serviceId} className="flex items-center gap-3 rounded-lg border border-[var(--adm-line)] p-2.5">
                  {p.match
                    ? <img src={p.match.file} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                    : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[var(--adm-paper-2)] font-mono-adm text-[9px] text-[var(--adm-muted)]">NONE</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{p.name}</p>
                    <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">
                      {p.reason === "missing" ? "No photo yet" : "Photo file is broken"}
                      {p.match ? ` · match ${Math.round(p.match.confidence * 100)}% · ${p.match.sourceName}` : " · no good match in the library"}
                    </p>
                  </div>
                  {p.match && (
                    p.match.action === "auto"
                      ? <span className="rounded bg-emerald-50 px-2 py-1 font-mono-adm text-[10px] font-bold uppercase text-emerald-700">Will apply</span>
                      : <button onClick={() => apply([p.serviceId])} disabled={applying} className="adm-btn !py-1 !text-[11px] disabled:opacity-50">Use this photo</button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="adm-btn">Close</button>
              {autoCount > 0 && (
                <button onClick={() => apply()} disabled={applying} className="adm-btn adm-btn--primary disabled:opacity-50">
                  {applying ? "Applying..." : `Apply ${autoCount} confident match${autoCount === 1 ? "" : "es"}`}
                </button>
              )}
            </div>
          </>
        )}

        {!busy && proposals.length === 0 && (
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="adm-btn">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceEditor({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(
    initial || {
      name: "", description: "", deviceTypes: "Mobile", startPrice: "Price on inspection",
      turnaround: "Same day", status: "active", sortOrder: 0,
      image: "", imageAlt: "", imageSource: "", category: "", featured: false, badge: "", ctaLabel: "",
    }
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const src: { status?: string; name?: string; url?: string; note?: string } = (() => {
    try { return f.imageSource ? JSON.parse(f.imageSource) : {}; } catch { return {}; }
  })();

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const url = await uploadMediaFile(file).catch(() => "");
    setUploading(false);
    if (!url) { setErr("Could not upload that image. Try a JPG, PNG or WebP under 5 MB."); return; }
    // An owner-uploaded photo is their own choice — no review flag needed.
    setF({ ...f, image: url, imageSource: JSON.stringify({ name: "Uploaded by admin", status: "verified" }) });
    setErr("");
  }

  function confirmPhoto() {
    setF({ ...f, imageSource: JSON.stringify({ ...src, status: "verified", note: undefined }) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    const url = initial ? `/api/services/${initial.id}` : "/api/services";
    const r = await adminFetch(url, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    if (r.ok) { adminToast(`Service ${initial ? "saved" : "added"} — now live on the site.`); onSaved(); onClose(); return; }
    const data = await r.json().catch(() => ({}));
    setErr(data.error || "Could not save service. Please try again.");
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-[14px] bg-[var(--adm-paper)] p-6 shadow-2xl">
        <h3 className="font-display-adm text-[20px]">{initial ? "Edit Service" : "New Service"}</h3>
        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600">{err}</p>}

        <Field label="Name *"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="adm-input" /></Field>
        <Field label="Description"><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="adm-input" /></Field>

        {/* ---- Photo ---- */}
        <div className="rounded-xl border border-[var(--adm-line)] p-3">
          <p className="font-mono-adm text-[10px] font-bold uppercase tracking-wider text-[var(--adm-muted)]">Photo</p>
          <div className="mt-2 flex items-start gap-3">
            <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-[var(--adm-paper-2)]">
              {f.image
                ? <img src={f.image} alt="" className="h-full w-full object-cover" />
                : <span className="grid h-full w-full place-items-center font-mono-adm text-[9px] text-[var(--adm-muted)]">NO PHOTO</span>}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <label className={`adm-btn !py-1 !text-[11px] cursor-pointer ${uploading ? "opacity-50" : ""}`}>
                  {uploading ? "Uploading..." : f.image ? "Replace photo" : "Upload photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={onUpload} disabled={uploading} />
                </label>
                {f.image && (
                  <button type="button" onClick={() => setF({ ...f, image: "", imageAlt: "", imageSource: "" })} className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]">Remove</button>
                )}
              </div>
              <input
                value={f.image || ""}
                onChange={(e) => setF({ ...f, image: e.target.value })}
                placeholder="…or paste an image address (https://… or /images/…)"
                className="adm-input !text-[12px]"
              />
              <input
                value={f.imageAlt || ""}
                onChange={(e) => setF({ ...f, imageAlt: e.target.value })}
                placeholder="Describe the photo (helps screen readers & Google)"
                className="adm-input !text-[12px]"
              />
            </div>
          </div>
          {src.status === "needs_review" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
              <p className="min-w-0 flex-1 text-[11px] font-semibold text-amber-700">{src.note || "Please check this photo matches the repair, then confirm."}</p>
              <button type="button" onClick={confirmPhoto} className="adm-btn !py-1 !text-[11px]"><CheckIcon aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Photo is right</button>
            </div>
          )}
          {src.name && src.status !== "needs_review" && (
            <p className="mt-2 font-mono-adm text-[10px] text-[var(--adm-muted)]">Photo source: {src.name}{src.url ? ` · ${src.url}` : ""}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><input value={f.category || ""} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Display & Glass" className="adm-input" /></Field>
          <Field label="Device types"><input value={f.deviceTypes} onChange={(e) => setF({ ...f, deviceTypes: e.target.value })} className="adm-input" /></Field>
          <Field label="Start price"><input value={f.startPrice} onChange={(e) => setF({ ...f, startPrice: e.target.value })} className="adm-input" /></Field>
          <Field label="Turnaround"><input value={f.turnaround} onChange={(e) => setF({ ...f, turnaround: e.target.value })} className="adm-input" /></Field>
          <Field label="Badge (optional)"><input value={f.badge || ""} onChange={(e) => setF({ ...f, badge: e.target.value })} placeholder="e.g. Most booked" className="adm-input" /></Field>
          <Field label="Button label (optional)"><input value={f.ctaLabel || ""} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} placeholder="Book" className="adm-input" /></Field>
          <Field label="Sort order"><input type="number" value={f.sortOrder ?? 0} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} className="adm-input" /></Field>
          <Field label="Status">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="adm-input">
              <option value="active">Active</option><option value="hidden">Hidden</option>
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <input type="checkbox" checked={Boolean(f.featured)} onChange={(e) => setF({ ...f, featured: e.target.checked })} className="h-4 w-4" />
          Featured — show this repair first on the homepage and spotlight it on the services page
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="adm-btn">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn--primary disabled:opacity-50 disabled:cursor-not-allowed">{busy ? "Saving..." : "Save Service"}</button>
        </div>
      </form>
    </div>
  );
}


