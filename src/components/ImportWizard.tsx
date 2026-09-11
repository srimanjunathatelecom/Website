"use client";

/**
 * Import Wizard — the admin-facing flow over /api/imports/*.
 *
 * Steps: choose mode → upload file → (fix column mapping if needed) →
 * preview every change → confirm → result. Plus an import history view
 * with per-batch rollback.
 *
 * Design rules baked in (from the inventory-safety spec):
 *  - The MODE IS NEVER GUESSED. The admin must pick what the sheet means
 *    before the file is even read, with plain-language explanations.
 *  - Preview writes nothing. The only button that changes products is
 *    "Apply import", and it shows current stock → new stock first.
 *  - Duplicate-file and stale-sheet warnings surface as explicit choices,
 *    never auto-confirmed.
 */

import { useMemo, useRef, useState } from "react";
import { adminFetch } from "@/lib/adminAuth";
import { MODE_INFO, type ImportMode } from "@/lib/importing/engine";
import { FIELD_LABELS, IMPORT_FIELDS, type ImportField } from "@/lib/importing/mapping";

type Step = "mode" | "upload" | "preview" | "done" | "history";

type PreviewRow = {
  rowNum: number;
  action: string;
  name: string;
  sku: string;
  matchedBy: string;
  changes: { field: string; label: string; from: string; to: string }[];
  stock: { current: number; sheet: number; next: number } | null;
  warnings: string[];
  error: string;
};

type Summary = {
  totalRows: number;
  creates: number;
  updates: number;
  newVariants: number;
  variantUpdates: number;
  conflicts: number;
  errors: number;
  skips: number;
  stockBefore: number;
  stockAfter: number;
  warnings: number;
  staleRows: number;
  missing: { productId: number; variantId: number | null; name: string; sku: string; stock: number }[];
};

const ACTION_BADGE: Record<string, { label: string; cls: string }> = {
  create: { label: "NEW", cls: "bg-[var(--adm-pine)] text-white" },
  update: { label: "UPDATE", cls: "bg-[var(--adm-ink)] text-white" },
  "new-variant": { label: "NEW OPTION", cls: "bg-[var(--adm-pine)] text-white" },
  "variant-update": { label: "OPTION UPDATE", cls: "bg-[var(--adm-ink)] text-white" },
  conflict: { label: "CONFLICT", cls: "bg-[var(--adm-rose)] text-white" },
  error: { label: "PROBLEM", cls: "bg-[var(--adm-rose)] text-white" },
  skip: { label: "NO CHANGE", cls: "bg-[var(--adm-line)] text-[var(--adm-muted)]" },
};

const MODES = Object.keys(MODE_INFO) as ImportMode[];

export default function ImportWizard({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<ImportMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  // Mapping-correction state (shown when the server can't identify columns,
  // or when the admin opens "check columns" on the preview).
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [allowNameMatch, setAllowNameMatch] = useState(false);

  // Preview state
  const [importId, setImportId] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [rowsTruncated, setRowsTruncated] = useState(0);
  const [previousImports, setPreviousImports] = useState<{ id: number; committedAt: string; adminName: string }[]>([]);
  const [reconcileMissing, setReconcileMissing] = useState<"ignore" | "zero" | "hide">("ignore");

  // Confirmation gates raised by commit (duplicate file / stale sheet)
  const [gate, setGate] = useState<{ kind: string; message: string } | null>(null);
  const confirmedRef = useRef<{ allowDuplicateFile?: boolean; allowStale?: boolean }>({});

  // Result state
  const [result, setResult] = useState<{ message: string; conflicts: { name: string; sku: string; dbValue: number; sheetValue: number }[] } | null>(null);

  // History state
  const [history, setHistory] = useState<any[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  async function loadHistory() {
    setHistoryBusy(true);
    try {
      const r = await adminFetch("/api/imports");
      const d = await r.json().catch(() => ({}));
      setHistory(Array.isArray(d.batches) ? d.batches : []);
    } finally {
      setHistoryBusy(false);
    }
  }
  // History is loaded when the admin navigates to it (openHistory), not in
  // an effect — avoids a redundant render pass and keeps lint happy.
  function openHistory() {
    setStep("history");
    loadHistory();
  }

  async function upload(withMapping?: Record<string, string>) {
    const file = fileRef.current?.files?.[0];
    if (!file || !mode) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      if (allowNameMatch) fd.append("allowNameMatch", "1");
      if (withMapping) fd.append("mapping", JSON.stringify(withMapping));
      const r = await adminFetch("/api/imports/preview", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.needsMapping) {
          // Server couldn't identify the columns — show the manual mapper.
          setHeaders(d.headers || []);
          setMapping(d.mapping || {});
          setShowMapping(true);
          setError(d.error || "Please match the columns below.");
          return;
        }
        setError(d.error || "The file could not be read.");
        return;
      }
      setImportId(d.importId);
      setSummary(d.summary);
      setRows(d.rows || []);
      setRowsTruncated(d.rowsTruncated || 0);
      setHeaders(d.headers || []);
      setMapping(d.mapping || {});
      setPreviousImports(d.previousImports || []);
      setFileName(d.fileName || file.name);
      confirmedRef.current = {};
      setGate(null);
      setShowMapping(false);
      setStep("preview");
    } catch {
      setError("Network problem while uploading — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!importId) return;
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { ...confirmedRef.current };
      if (mode === "reconcile") body.reconcileMissing = reconcileMissing;
      const r = await adminFetch(`/api/imports/${importId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.needsConfirmation) {
        setGate({ kind: d.needsConfirmation, message: d.error });
        return;
      }
      if (!r.ok) {
        setError(d.error || "The import could not be applied.");
        return;
      }
      setResult({ message: d.message || "Import applied.", conflicts: d.conflicts || [] });
      setStep("done");
      onImported();
    } catch {
      setError("Network problem while applying — the import was NOT applied twice. Check the history before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function rollback(id: number) {
    if (!confirm("Undo this import? Stock added by it is removed, changed details are restored, and products it created are hidden. Later sales are kept.")) return;
    setHistoryBusy(true);
    try {
      const r = await adminFetch(`/api/imports/${id}/rollback`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) alert(d.error || "Rollback failed.");
      else alert(d.message || "Import undone.");
      await loadHistory();
      onImported();
    } finally {
      setHistoryBusy(false);
    }
  }

  const stockDelta = useMemo(() => (summary ? summary.stockAfter - summary.stockBefore : 0), [summary]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-[14px] bg-[var(--adm-paper)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--adm-line)] p-5">
          <div>
            <h3 className="font-display-adm text-[20px]">
              {step === "history" ? "Import history." : "Import stock & products."}
            </h3>
            {step !== "history" && mode && step !== "mode" && (
              <p className="mt-0.5 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                Mode: {MODE_INFO[mode].label}
                {fileName ? ` · ${fileName}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step !== "history" ? (
              <button onClick={openHistory} className="adm-btn !py-1 !px-2.5 !text-[12px]">History</button>
            ) : (
              <button onClick={() => setStep(importId ? "preview" : "mode")} className="adm-btn !py-1 !px-2.5 !text-[12px]">Back</button>
            )}
            <button onClick={onClose} className="adm-btn !py-1 !px-2.5 !text-[12px]">Close</button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-[var(--adm-rose)] bg-[#fff7f5] p-3 text-[13px] text-[var(--adm-rose)] whitespace-pre-wrap">{error}</div>
          )}

          {/* STEP 1 — mode. Never guessed: the admin must say what the sheet means. */}
          {step === "mode" && (
            <div>
              <p className="mb-3 text-[13px] text-[var(--adm-muted)]">
                First, tell us what your sheet contains. This decides what a stock number in the file means — it is never guessed.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setStep("upload"); setError(""); }}
                    className={`rounded-lg border p-3 text-left transition hover:border-[var(--adm-ink)] ${mode === m ? "border-[var(--adm-ink)]" : "border-[var(--adm-line)]"}`}
                  >
                    <p className="text-[14px] font-semibold">{MODE_INFO[m].label}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--adm-muted)]">{MODE_INFO[m].explain}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2 — upload (+ manual column mapping when needed) */}
          {step === "upload" && mode && (
            <div>
              <div className="mb-4 rounded-lg border border-[var(--adm-line)] p-3">
                <p className="text-[13px] font-semibold">{MODE_INFO[mode].label}</p>
                <p className="mt-1 text-[12px] text-[var(--adm-muted)]">{MODE_INFO[mode].explain}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={`/api/imports/templates/${mode}`} download className="adm-btn !py-1 !px-2.5 !text-[11px]">Download template (.xlsx)</a>
                  <button onClick={() => { setMode(null); setStep("mode"); }} className="adm-btn !py-1 !px-2.5 !text-[11px]">Change mode</button>
                </div>
              </div>

              <label className="block rounded-lg border-2 border-dashed border-[var(--adm-line)] p-6 text-center cursor-pointer hover:border-[var(--adm-ink)]">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || "")}
                />
                <p className="text-[14px] font-semibold">{fileName || "Choose a .csv or .xlsx file"}</p>
                <p className="mt-1 text-[12px] text-[var(--adm-muted)]">Excel exports from this admin re-import directly. Max 8 MB / 5000 rows.</p>
              </label>

              <label className="mt-3 flex items-start gap-2 text-[12px] text-[var(--adm-muted)]">
                <input type="checkbox" checked={allowNameMatch} onChange={(e) => setAllowNameMatch(e.target.checked)} className="mt-0.5" />
                <span>
                  Also match rows by product name when there is no ID/SKU/barcode (only exact, unique name matches are used — otherwise the row is flagged for review).
                </span>
              </label>

              {showMapping && (
                <MappingEditor headers={headers} mapping={mapping} onChange={setMapping} />
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => upload(showMapping ? mapping : undefined)}
                  disabled={busy}
                  className="adm-btn adm-btn--primary !py-1.5 !text-[13px]"
                >
                  {busy ? "Reading file…" : "Upload & preview (nothing is changed yet)"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — preview */}
          {step === "preview" && summary && (
            <div>
              {previousImports.length > 0 && (
                <div className="mb-3 rounded-lg border border-[var(--adm-rose)] bg-[#fff7f5] p-3 text-[13px]">
                  <p className="font-semibold text-[var(--adm-rose)]">This file appears to have already been imported.</p>
                  <p className="mt-1 text-[12px] text-[var(--adm-muted)]">
                    {previousImports.map((p) => `#${p.id} by ${p.adminName || "admin"} on ${p.committedAt ? new Date(p.committedAt).toLocaleString("en-IN") : "—"}`).join(" · ")}
                    {" — "}applying it again will repeat its changes (e.g. add the same stock twice). You will be asked to confirm.
                  </p>
                </div>
              )}
              {summary.staleRows > 0 && (
                <div className="mb-3 rounded-lg border border-[#b8860b] bg-[#fffbe8] p-3 text-[13px]">
                  <p className="font-semibold text-[#8a6d0b]">{summary.staleRows} item(s) changed in the shop AFTER this sheet was made.</p>
                  <p className="mt-1 text-[12px] text-[var(--adm-muted)]">The rows are marked below. Full-stock rows for those items will be skipped as conflicts unless the numbers still agree.</p>
                </div>
              )}

              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile label="New products" value={summary.creates + summary.newVariants} />
                <SummaryTile label="Updates" value={summary.updates + summary.variantUpdates} />
                <SummaryTile label="Problems" value={summary.errors + summary.conflicts} tone={summary.errors + summary.conflicts > 0 ? "bad" : undefined} />
                <SummaryTile label="No change" value={summary.skips} />
              </div>

              <div className="mb-3 rounded-lg border border-[var(--adm-line)] p-3 text-[13px]">
                <span className="font-semibold">Total stock:</span>{" "}
                <span className="font-mono-adm">{summary.stockBefore}</span> now →{" "}
                <span className="font-mono-adm font-bold">{summary.stockAfter}</span> after import{" "}
                <span className={`font-mono-adm ${stockDelta > 0 ? "text-[var(--adm-pine)]" : stockDelta < 0 ? "text-[var(--adm-rose)]" : "text-[var(--adm-muted)]"}`}>
                  ({stockDelta >= 0 ? "+" : ""}{stockDelta})
                </span>
              </div>

              {mode === "reconcile" && summary.missing.length > 0 && (
                <div className="mb-3 rounded-lg border border-[var(--adm-line)] p-3 text-[13px]">
                  <p className="font-semibold">{summary.missing.length} catalogue item(s) are not in this sheet.</p>
                  <p className="mt-1 text-[12px] text-[var(--adm-muted)]">Nothing is deleted. Choose what to do with them:</p>
                  <div className="mt-2 flex flex-col gap-1 text-[12px]">
                    <label className="flex items-center gap-2"><input type="radio" checked={reconcileMissing === "ignore"} onChange={() => setReconcileMissing("ignore")} /> Leave them exactly as they are</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={reconcileMissing === "zero"} onChange={() => setReconcileMissing("zero")} /> Set their stock to 0 (they stay visible)</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={reconcileMissing === "hide"} onChange={() => setReconcileMissing("hide")} /> Set stock to 0 AND hide them from the storefront</label>
                  </div>
                  <ul className="mt-2 max-h-28 overflow-y-auto font-mono-adm text-[11px] text-[var(--adm-muted)]">
                    {summary.missing.slice(0, 50).map((mi) => (
                      <li key={`${mi.productId}-${mi.variantId ?? "p"}`}>{mi.name} ({mi.sku || "no SKU"}) — stock {mi.stock}</li>
                    ))}
                    {summary.missing.length > 50 && <li>…and {summary.missing.length - 50} more.</li>}
                  </ul>
                </div>
              )}

              {summary.errors > 0 && importId && (
                <div className="mb-3 text-[12px]">
                  <a href={`/api/imports/${importId}?format=errors`} download className="adm-btn !py-1 !px-2.5 !text-[11px]">
                    Download problem report ({summary.errors} row{summary.errors === 1 ? "" : "s"})
                  </a>
                </div>
              )}

              <details className="mb-3" open={false}>
                <summary className="cursor-pointer text-[12px] text-[var(--adm-muted)]">Check how columns were matched</summary>
                <MappingEditor headers={headers} mapping={mapping} onChange={setMapping} />
                <button onClick={() => upload(mapping)} disabled={busy} className="adm-btn mt-2 !py-1 !px-2.5 !text-[11px]">
                  {busy ? "Re-reading…" : "Re-run preview with corrected columns"}
                </button>
              </details>

              <div className="overflow-x-auto rounded-lg border border-[var(--adm-line)]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--adm-line)] text-left font-mono-adm text-[10px] uppercase text-[var(--adm-muted)]">
                      <th className="p-2">Row</th>
                      <th className="p-2">What happens</th>
                      <th className="p-2">Product</th>
                      <th className="p-2">Changes</th>
                      <th className="p-2">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const badge = ACTION_BADGE[r.action] || ACTION_BADGE.skip;
                      return (
                        <tr key={r.rowNum} className="border-b border-[var(--adm-line)] align-top">
                          <td className="p-2 font-mono-adm text-[var(--adm-muted)]">{r.rowNum}</td>
                          <td className="p-2"><span className={`rounded px-1.5 py-0.5 font-mono-adm text-[10px] ${badge.cls}`}>{badge.label}</span></td>
                          <td className="p-2">
                            <p className="font-semibold">{r.name || "—"}</p>
                            <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">{r.sku || ""}{r.matchedBy ? ` · matched by ${r.matchedBy}` : ""}</p>
                          </td>
                          <td className="p-2">
                            {r.error && <p className="text-[var(--adm-rose)]">{r.error}</p>}
                            {r.changes.slice(0, 4).map((c) => (
                              <p key={c.field} className="font-mono-adm text-[11px]">{c.label}: {c.from || "—"} → <strong>{c.to || "—"}</strong></p>
                            ))}
                            {r.changes.length > 4 && <p className="font-mono-adm text-[10px] text-[var(--adm-muted)]">…and {r.changes.length - 4} more field(s)</p>}
                            {r.warnings.map((w, i) => (
                              <p key={i} className="mt-0.5 text-[11px] text-[#8a6d0b]">{w}</p>
                            ))}
                          </td>
                          <td className="p-2 font-mono-adm">
                            {r.stock ? <>{r.stock.current} → <strong>{r.stock.next}</strong></> : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rowsTruncated > 0 && (
                <p className="mt-2 text-[11px] text-[var(--adm-muted)]">Showing the first {rows.length} rows — {rowsTruncated} more are included in the import and visible in History.</p>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <button onClick={() => { setStep("upload"); setError(""); }} className="adm-btn !py-1.5 !text-[12px]">Back</button>
                <button
                  onClick={commit}
                  disabled={busy || summary.totalRows === summary.errors}
                  className="adm-btn adm-btn--primary !py-1.5 !text-[13px]"
                  title={summary.totalRows === summary.errors ? "Every row has a problem — nothing can be applied." : ""}
                >
                  {busy ? "Applying…" : `Apply import (${summary.creates + summary.newVariants + summary.updates + summary.variantUpdates} change${summary.creates + summary.newVariants + summary.updates + summary.variantUpdates === 1 ? "" : "s"})`}
                </button>
              </div>
            </div>
          )}

          {/* Confirmation gates raised by commit */}
          {gate && (
            <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={() => setGate(null)}>
              <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[14px] bg-[var(--adm-paper)] p-5 shadow-2xl">
                <h4 className="font-display-adm text-[17px]">
                  {gate.kind === "duplicate_file" ? "Import this file again?" : "Sheet is older than your latest stock changes"}
                </h4>
                <p className="mt-2 text-[13px] text-[var(--adm-muted)]">{gate.message}</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setGate(null)} className="adm-btn !py-1.5 !text-[12px]">Cancel</button>
                  {gate.kind === "duplicate_file" && (
                    <button onClick={() => { setGate(null); openHistory(); }} className="adm-btn !py-1.5 !text-[12px]">View previous import</button>
                  )}
                  <button
                    onClick={() => {
                      if (gate.kind === "duplicate_file") confirmedRef.current.allowDuplicateFile = true;
                      if (gate.kind === "stale_file") confirmedRef.current.allowStale = true;
                      setGate(null);
                      commit();
                    }}
                    className="adm-btn adm-btn--primary !py-1.5 !text-[12px]"
                  >
                    {gate.kind === "duplicate_file" ? "Yes, import again" : "Yes, apply anyway"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — result */}
          {step === "done" && result && (
            <div>
              <div className="rounded-lg border border-[var(--adm-pine)] bg-[#f4faf6] p-4 text-[13px]">
                <p className="font-semibold text-[var(--adm-pine)]">{result.message}</p>
              </div>
              {result.conflicts.length > 0 && (
                <div className="mt-3 rounded-lg border border-[var(--adm-rose)] bg-[#fff7f5] p-3 text-[13px]">
                  <p className="font-semibold text-[var(--adm-rose)]">Not applied (stock moved since the preview):</p>
                  <ul className="mt-1 font-mono-adm text-[11px]">
                    {result.conflicts.map((c, i) => (
                      <li key={i}>{c.name} ({c.sku || "no SKU"}): shop has {c.dbValue}, sheet said {c.sheetValue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={openHistory} className="adm-btn !py-1.5 !text-[12px]">View history</button>
                <button onClick={onClose} className="adm-btn adm-btn--primary !py-1.5 !text-[12px]">Done</button>
              </div>
            </div>
          )}

          {/* History view */}
          {step === "history" && (
            <div>
              {historyBusy && <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading…</p>}
              {!historyBusy && history.length === 0 && <p className="text-[13px] text-[var(--adm-muted)]">No imports yet.</p>}
              <ul className="divide-y divide-[var(--adm-line)]">
                {history.map((b) => (
                  <li key={b.id} className="flex items-start justify-between gap-3 py-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">#{b.id} · {b.fileName}</p>
                      <p className="mt-0.5 font-mono-adm text-[11px] text-[var(--adm-muted)]">
                        {MODE_INFO[b.mode as ImportMode]?.label || b.mode} · {b.status === "committed" ? "applied" : b.status === "rolled_back" ? "undone" : b.status} · {b.adminName || "admin"} · {new Date(b.createdAt).toLocaleString("en-IN")}
                      </p>
                      {b.summary && (
                        <p className="font-mono-adm text-[11px] text-[var(--adm-muted)]">
                          {b.summary.creates + (b.summary.newVariants || 0)} new · {b.summary.updates + (b.summary.variantUpdates || 0)} updates · {b.summary.errors} problems
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {b.summary?.errors > 0 && (
                        <a href={`/api/imports/${b.id}?format=errors`} download className="adm-btn !py-1 !px-2 !text-[11px]">Problems</a>
                      )}
                      {b.status === "committed" && (
                        <button onClick={() => rollback(b.id)} className="adm-btn !border-[var(--adm-rose)] !py-1 !px-2 !text-[11px] !text-[var(--adm-rose)] hover:!bg-[var(--adm-rose)] hover:!text-white">
                          Undo
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className={`rounded-lg border p-2.5 text-center ${tone === "bad" && value > 0 ? "border-[var(--adm-rose)]" : "border-[var(--adm-line)]"}`}>
      <p className={`font-display-adm text-[20px] ${tone === "bad" && value > 0 ? "text-[var(--adm-rose)]" : ""}`}>{value}</p>
      <p className="font-mono-adm text-[10px] uppercase text-[var(--adm-muted)]">{label}</p>
    </div>
  );
}

/** Column → field mapper: one dropdown per column in the admin's file. */
function MappingEditor({ headers, mapping, onChange }: { headers: string[]; mapping: Record<string, string>; onChange: (m: Record<string, string>) => void }) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--adm-line)] p-3">
      <p className="mb-2 text-[12px] text-[var(--adm-muted)]">Match each column in your file to what it contains. Columns set to “Ignore” are left alone.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {headers.map((h, i) => (
          <label key={i} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-mono-adm" title={h}>{h || `Column ${i + 1}`}</span>
            <select
              value={mapping[String(i)] || ""}
              onChange={(e) => {
                const next = { ...mapping };
                if (e.target.value) next[String(i)] = e.target.value;
                else delete next[String(i)];
                onChange(next);
              }}
              className="adm-input !w-auto !py-1 !text-[11px]"
            >
              <option value="">Ignore</option>
              {IMPORT_FIELDS.map((f: ImportField) => (
                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
