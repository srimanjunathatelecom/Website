"use client";

/**
 * Catalogue Health console (client).
 *
 * One screen, four jobs:
 *  1. show the owner a single health % + what is wrong, in plain words;
 *  2. one button — "Fix My Catalogue" — that runs the whole pipeline in the
 *     background with live "Processing 12 / 300" progress (the tab can be
 *     closed; the summary endpoint re-attaches to a running job);
 *  3. the review queue: cards with current vs proposed image, confidence %,
 *     Approve / Reject — the only manual work the owner is asked to do;
 *  4. bulk image upload: drag in files or a ZIP named by SKU, preview the
 *     automatic mapping, apply.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ---------- types (mirror the API payloads) ----------

type Summary = {
  healthPct: number;
  totalProducts: number;
  complete: number;
  missingImages: number;
  placeholderImages: number;
  brokenImages: number;
  missingData: number;
  duplicateCandidates: number;
  needsReview: number;
  autoFixedRecently: number;
  imagesVerified: number;
  notPublishable: number;
};

type Job = {
  id: number;
  type: string;
  status: string;
  totalItems: number;
  processedItems: number;
  counters?: Record<string, number>;
  error?: string | null;
};

type Candidate = { url: string; thumbnail?: string; confidence?: number; sourceDomain?: string; title?: string };

type Issue = {
  id: number;
  productId: number;
  type: string;
  status: string;
  severity: string;
  confidence: number;
  summary: string;
  productName: string;
  productSlug: string;
  currentImage: string;
  proposal?: { kind?: string; candidates?: Candidate[]; note?: string; names?: string[]; missing?: string[] };
  resolvedBy?: string | null;
};

type Settings = {
  dailyCheckEnabled: boolean;
  autoFixEnabled: boolean;
  autoApproveThreshold: number;
  reviewThreshold: number;
  requiredPublishFields: string[];
};

type Capabilities = { imageSearchConfigured: boolean; objectStorageConfigured: boolean };

type MapSuggestion = {
  fileName: string;
  productId: number | null;
  variantId: number | null;
  productName: string;
  variantLabel: string;
  matchedBy: string | null;
  confidence: number;
};

const ISSUE_LABEL: Record<string, string> = {
  missing_image: "No image",
  placeholder_image: "Placeholder image",
  broken_image: "Broken image",
  missing_data: "Missing info",
  duplicate: "Possible duplicate",
  invalid_variant: "Variant pricing",
  not_publishable: "Cannot publish",
};

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

// ---------- component ----------

export default function CatalogueHealth() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [tab, setTab] = useState<"needs_review" | "open" | "auto_fixed">("needs_review");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const d = await jfetch<{ summary: Summary; settings: Settings; capabilities: Capabilities; activeJob: { id: number } | null }>(
        "/api/catalogue/summary"
      );
      setSummary(d.summary);
      setSettings(d.settings);
      setCaps(d.capabilities);
      if (d.activeJob) attachJob(d.activeJob.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load catalogue health.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIssues = useCallback(async (which: typeof tab) => {
    try {
      const d = await jfetch<{ items: Issue[] }>(`/api/catalogue/issues?status=${which}&limit=100`);
      setIssues(d.items);
    } catch {
      /* list stays as-is */
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);
  useEffect(() => {
    loadIssues(tab);
  }, [tab, loadIssues]);

  // ----- job polling -----
  const attachJob = useCallback(
    (jobId: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      const poll = async () => {
        try {
          const d = await jfetch<{ job: Job }>(`/api/catalogue/jobs/${jobId}`);
          setJob(d.job);
          if (!["queued", "running"].includes(d.job.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            loadSummary();
            loadIssues(tab);
          }
        } catch {
          /* transient poll errors are fine */
        }
      };
      poll();
      pollRef.current = setInterval(poll, 2500);
    },
    [loadSummary, loadIssues, tab]
  );
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startFix = async (scope: unknown, label: string) => {
    setBusy("fix");
    setErr("");
    setMsg("");
    setScopeOpen(false);
    try {
      const d = await jfetch<{ jobId: number; alreadyRunning: boolean }>("/api/catalogue/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      setMsg(d.alreadyRunning ? "A job is already running — showing its progress." : `Started: ${label}.`);
      attachJob(d.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setBusy("");
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    try {
      await jfetch(`/api/catalogue/jobs/${job.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      setMsg("Stopping after the current product. Everything already fixed stays fixed.");
    } catch {
      /* ignore */
    }
  };

  const act = async (issue: Issue, action: "approve" | "reject" | "dismiss", candidateUrl?: string) => {
    setBusy(`issue-${issue.id}`);
    setErr("");
    try {
      await jfetch(`/api/catalogue/issues/${issue.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, candidateUrl }),
      });
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      loadSummary();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy("");
    }
  };

  const jobRunning = job && ["queued", "running"].includes(job.status);

  return (
    <div className="space-y-8">
      {err && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{err}</div>}
      {msg && !err && <div className="rounded-md border border-[var(--adm-line)] bg-[var(--adm-paper-2)] px-3 py-2 text-[12.5px]">{msg}</div>}

      {/* ---- score + one-click fix ---- */}
      <section className="adm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <HealthRing pct={summary?.healthPct ?? 0} />
            <div>
              <h2 className="font-display-adm text-xl">Catalogue health</h2>
              <p className="mt-1 max-w-[46ch] text-[12.5px] text-[var(--adm-muted)]">
                {summary
                  ? `${summary.complete} of ${summary.totalProducts} products are complete. ${summary.needsReview} waiting for your review.`
                  : "Checking…"}
              </p>
              {caps && !caps.imageSearchConfigured && (
                <p className="mt-1 max-w-[46ch] font-mono-adm text-[10.5px] text-[var(--adm-muted)]">
                  Automatic image search is off (no IMAGE_SEARCH_API_KEY). Problems are still detected — images can be
                  added by upload, ZIP or URL below.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button className="adm-btn adm-btn--primary" disabled={!!jobRunning || busy === "fix"} onClick={() => startFix("all", "Fix My Catalogue")}>
              {jobRunning ? "Working…" : "Fix My Catalogue"}
            </button>
            <div className="relative">
              <button className="adm-btn !py-1.5 !text-[12px]" disabled={!!jobRunning} onClick={() => setScopeOpen((v) => !v)}>
                Complete Catalogue ▾
              </button>
              {scopeOpen && (
                <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-[var(--adm-line)] bg-[var(--adm-paper)] p-1 shadow-lg">
                  <ScopeBtn label="Only incomplete products" onClick={() => startFix("incomplete", "Complete incomplete products")} />
                  <ScopeBtn label="Everything (full pass)" onClick={() => startFix("all", "Complete the whole catalogue")} />
                  <ScopeBtn label="Scan only (change nothing)" onClick={() => startFix("all-scan-placeholder", "Scan")} scan />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* live progress */}
        {job && (
          <div className="mt-4 rounded-md border border-[var(--adm-line)] bg-[var(--adm-paper-2)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono-adm text-[11px]">
                {jobRunning
                  ? `Processing ${job.processedItems} / ${job.totalItems || "…"} — you can leave this page, work continues.`
                  : job.status === "completed"
                    ? `Done — ${job.processedItems} products processed.`
                    : job.status === "cancelled"
                      ? "Stopped."
                      : `Failed: ${job.error || "unknown error"}`}
              </p>
              {jobRunning && (
                <button className="adm-btn !py-1 !text-[11px]" onClick={cancelJob}>Stop</button>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-[var(--adm-line)]">
              <div
                className="h-full bg-[var(--adm-ink)] transition-all"
                style={{ width: job.totalItems ? `${Math.round((job.processedItems / job.totalItems) * 100)}%` : "8%" }}
              />
            </div>
            {job.counters && (
              <p className="mt-2 font-mono-adm text-[10.5px] text-[var(--adm-muted)]">
                {job.counters.autoFixed || 0} fixed · {job.counters.imagesImported || 0} images imported · {job.counters.needsReview || 0} for review · {job.counters.errors || 0} errors
              </p>
            )}
          </div>
        )}

        {/* counts */}
        {summary && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="No image" value={summary.missingImages} bad />
            <Stat label="Placeholder image" value={summary.placeholderImages} bad />
            <Stat label="Broken image link" value={summary.brokenImages} bad />
            <Stat label="Missing info" value={summary.missingData} bad />
            <Stat label="Possible duplicates" value={summary.duplicateCandidates} bad />
            <Stat label="Active but incomplete" value={summary.notPublishable} bad />
            <Stat label="Waiting for review" value={summary.needsReview} />
            <Stat label="Fixed automatically" value={summary.autoFixedRecently} />
          </div>
        )}
      </section>

      {/* ---- review queue ---- */}
      <section className="adm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display-adm text-xl">Review queue</h2>
          <div className="flex gap-1">
            {(["needs_review", "open", "auto_fixed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1.5 font-mono-adm text-[11px] ${tab === t ? "bg-[var(--adm-ink)] text-[var(--adm-paper)]" : "hover:bg-[var(--adm-paper-2)]"}`}
              >
                {t === "needs_review" ? "Needs your decision" : t === "open" ? "Known problems" : "Fixed automatically"}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[12px] text-[var(--adm-muted)]">
          {tab === "needs_review" && "The system was not sure enough to act alone. Approve or reject each suggestion."}
          {tab === "open" && "Detected problems with no safe automatic fix yet — add an image below or edit the product."}
          {tab === "auto_fixed" && "A log of what was fixed automatically, so nothing happens behind your back."}
        </p>

        <div className="mt-4 space-y-3">
          {issues.length === 0 && (
            <p className="rounded-md border border-dashed border-[var(--adm-line-strong)] p-6 text-center font-mono-adm text-[11.5px] text-[var(--adm-muted)]">
              Nothing here right now.
            </p>
          )}
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} busy={busy === `issue-${issue.id}`} readOnly={tab === "auto_fixed"} onAct={act} />
          ))}
        </div>
      </section>

      {/* ---- bulk image upload ---- */}
      <BulkUpload onDone={() => { loadSummary(); loadIssues(tab); }} />

      {/* ---- settings ---- */}
      {settings && <SettingsCard settings={settings} onSaved={(s) => setSettings(s)} />}
    </div>
  );

  // scope helper uses closures above
  function ScopeBtn({ label, onClick, scan }: { label: string; onClick: () => void; scan?: boolean }) {
    return (
      <button
        className="block w-full rounded px-2.5 py-2 text-left text-[12px] hover:bg-[var(--adm-paper-2)]"
        onClick={() => {
          if (scan) {
            setScopeOpen(false);
            startScanOnly();
          } else onClick();
        }}
      >
        {label}
      </button>
    );
  }

  async function startScanOnly() {
    setBusy("fix");
    setErr("");
    try {
      const d = await jfetch<{ jobId: number }>("/api/catalogue/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "all", mode: "scan" }),
      });
      setMsg("Scan started — nothing will be changed.");
      attachJob(d.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start scan.");
    } finally {
      setBusy("");
    }
  }
}

// ---------- small pieces ----------

function HealthRing({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" aria-label={`Catalogue health ${pct}%`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--adm-line)" strokeWidth="7" />
      <circle
        cx="38" cy="38" r={r} fill="none"
        stroke={pct >= 80 ? "#15803d" : pct >= 50 ? "#b45309" : "#b91c1c"}
        strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="43" textAnchor="middle" className="font-mono-adm" fontSize="15" fontWeight="700" fill="var(--adm-ink)">
        {pct}%
      </text>
    </svg>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--adm-line)] bg-[var(--adm-paper-2)] px-3 py-2">
      <p className={`font-mono-adm text-[18px] font-bold ${bad && value > 0 ? "text-[#b91c1c]" : ""}`}>{value}</p>
      <p className="text-[11px] text-[var(--adm-muted)]">{label}</p>
    </div>
  );
}

function Thumb({ src, label }: { src: string; label: string }) {
  return (
    <div className="w-28 shrink-0">
      <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-md border border-[var(--adm-line)] bg-white">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="font-mono-adm text-[10px] text-[var(--adm-muted)]">none</span>
        )}
      </div>
      <p className="mt-1 text-center font-mono-adm text-[9.5px] text-[var(--adm-muted)]">{label}</p>
    </div>
  );
}

function IssueCard({
  issue, busy, readOnly, onAct,
}: {
  issue: Issue;
  busy: boolean;
  readOnly: boolean;
  onAct: (i: Issue, a: "approve" | "reject" | "dismiss", candidateUrl?: string) => void;
}) {
  const candidates = issue.proposal?.candidates || [];
  const [chosen, setChosen] = useState(candidates[0]?.url || "");
  const isImage = ["missing_image", "placeholder_image", "broken_image"].includes(issue.type);
  const approvable = !readOnly && (candidates.length > 0 || issue.proposal?.kind === "remove_broken");

  return (
    <div className="rounded-md border border-[var(--adm-line)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold">{issue.productName || `Product #${issue.productId}`}</p>
          <p className="mt-0.5 text-[12px] text-[var(--adm-muted)]">{issue.summary}</p>
          <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">
            {ISSUE_LABEL[issue.type] || issue.type}
            {issue.confidence > 0 && ` · ${issue.confidence}% confidence`}
            {issue.severity === "critical" && " · important"}
            {readOnly && issue.resolvedBy ? ` · by ${issue.resolvedBy}` : ""}
          </p>
          {issue.proposal?.note && <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">{issue.proposal.note}</p>}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-2">
            {approvable && (
              <button className="adm-btn adm-btn--primary !py-1.5 !text-[12px]" disabled={busy} onClick={() => onAct(issue, "approve", chosen || undefined)}>
                {busy ? "…" : "Approve"}
              </button>
            )}
            <button className="adm-btn !py-1.5 !text-[12px]" disabled={busy} onClick={() => onAct(issue, "reject")}>Reject</button>
            <button className="adm-btn !py-1.5 !text-[12px]" disabled={busy} onClick={() => onAct(issue, "dismiss")}>Not a problem</button>
          </div>
        )}
      </div>

      {isImage && (candidates.length > 0 || issue.currentImage) && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <Thumb src={issue.currentImage} label="Current" />
          {candidates.slice(0, 3).map((c) => (
            <button
              key={c.url}
              type="button"
              onClick={() => setChosen(c.url)}
              className={`rounded-md ${chosen === c.url ? "ring-2 ring-[var(--adm-ink)]" : ""}`}
              title={c.sourceDomain || c.url}
            >
              <Thumb src={c.thumbnail || c.url} label={`${c.confidence ?? "?"}% · ${c.sourceDomain || "source"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- bulk upload ----------

function BulkUpload({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<MapSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => /\.(jpe?g|png|webp|avif|gif|zip)$/i.test(f.name));
    setFiles((prev) => [...prev, ...ok].slice(0, 300));
    setSuggestions(null);
    setNote("");
    setErr("");
  };

  const preview = async () => {
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("mode", "preview");
      for (const f of files) fd.append("files", f, f.name);
      const res = await fetch("/api/catalogue/images/bulk", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Preview failed.");
      setSuggestions(d.suggestions);
      setNote(`${d.matched} of ${d.totalFiles} file(s) matched a product automatically.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!suggestions) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("mode", "apply");
      for (const f of files) fd.append("files", f, f.name);
      fd.set(
        "mapping",
        JSON.stringify(
          suggestions
            .filter((s) => s.productId)
            .map((s) => ({ fileName: s.fileName, productId: s.productId, variantId: s.variantId }))
        )
      );
      const res = await fetch("/api/catalogue/images/bulk", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed.");
      setNote(`${d.applied} image(s) added${d.failed ? `, ${d.failed} failed` : ""}.`);
      setFiles([]);
      setSuggestions(null);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="adm-card p-5">
      <h2 className="font-display-adm text-xl">Add images in bulk</h2>
      <p className="mt-1 max-w-[62ch] text-[12px] text-[var(--adm-muted)]">
        Name files by SKU (for example <span className="font-mono-adm">S25-BLU-256-01.jpg</span>) and drop them here —
        or a whole ZIP. The system matches each file to the right product and variant; you confirm before anything is saved.
        JPG, PNG, WEBP, AVIF and ZIP are accepted; every file is checked server-side before it is stored.
      </p>

      <div
        className={`mt-4 grid place-items-center rounded-[14px] border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-[var(--adm-ink)] bg-[var(--adm-paper-2)]" : "border-[var(--adm-line-strong)]"}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <p className="font-mono-adm text-[11.5px] text-[var(--adm-muted)]">
          Drag images or a ZIP here, or{" "}
          <button type="button" className="underline" onClick={() => inputRef.current?.click()}>browse files</button>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.zip,image/jpeg,image/png,image/webp,image/avif,application/zip"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        {files.length > 0 && (
          <p className="mt-2 font-mono-adm text-[11px]">{files.length} file(s) selected</p>
        )}
      </div>

      {err && <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">{err}</p>}
      {note && !err && <p className="mt-3 font-mono-adm text-[11.5px]">{note}</p>}

      {files.length > 0 && !suggestions && (
        <button className="adm-btn adm-btn--primary mt-3" disabled={busy} onClick={preview}>
          {busy ? "Matching…" : "Match files to products"}
        </button>
      )}

      {suggestions && (
        <div className="mt-4">
          <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--adm-line)]">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-[var(--adm-paper-2)] font-mono-adm text-[10px] uppercase">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Matched product</th>
                  <th className="px-3 py-2">How</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.fileName} className="border-t border-[var(--adm-line)]">
                    <td className="px-3 py-2 font-mono-adm text-[11px]">{s.fileName}</td>
                    <td className="px-3 py-2">
                      {s.productId ? (
                        <>
                          {s.productName}
                          {s.variantLabel && <span className="text-[var(--adm-muted)]"> · {s.variantLabel}</span>}
                        </>
                      ) : (
                        <span className="text-[#b91c1c]">No match — will be skipped</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono-adm text-[10px] text-[var(--adm-muted)]">
                      {s.matchedBy === "variantSku" ? `variant SKU · ${s.confidence}%` : s.matchedBy === "productSku" ? `product SKU · ${s.confidence}%` : s.matchedBy === "name" ? `name · ${s.confidence}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="adm-btn adm-btn--primary" disabled={busy || suggestions.every((s) => !s.productId)} onClick={apply}>
              {busy ? "Saving…" : `Save ${suggestions.filter((s) => s.productId).length} matched image(s)`}
            </button>
            <button className="adm-btn" disabled={busy} onClick={() => { setSuggestions(null); setFiles([]); setNote(""); }}>
              Start over
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- settings ----------

const FIELD_LABELS: Record<string, string> = {
  name: "Name", brand: "Brand", categoryId: "Category", mop: "Selling price", mrp: "MRP",
  image: "Real image", description: "Description", specifications: "Specifications", sku: "SKU",
};

function SettingsCard({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const save = async (next: Settings) => {
    setS(next);
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/catalogue/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save.");
      onSaved(d.settings);
      setS(d.settings);
      setNote("Saved.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="adm-card p-5">
      <h2 className="font-display-adm text-xl">Automation settings</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-[12.5px]">
          <input type="checkbox" checked={s.autoFixEnabled} disabled={busy} onChange={(e) => save({ ...s, autoFixEnabled: e.target.checked })} className="mt-0.5" />
          <span>
            <span className="font-semibold">Fix safe problems automatically</span>
            <span className="block text-[11.5px] text-[var(--adm-muted)]">Missing SEO text, image descriptions, and high-confidence official images. Prices and stock are never touched.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[12.5px]">
          <input type="checkbox" checked={s.dailyCheckEnabled} disabled={busy} onChange={(e) => save({ ...s, dailyCheckEnabled: e.target.checked })} className="mt-0.5" />
          <span>
            <span className="font-semibold">Daily health check</span>
            <span className="block text-[11.5px] text-[var(--adm-muted)]">Scan the whole catalogue once a day and send one grouped notification with anything that needs you.</span>
          </span>
        </label>
        <label className="block text-[12.5px]">
          <span className="font-semibold">Auto-approve images at</span>
          <span className="block text-[11.5px] text-[var(--adm-muted)]">Matches at or above this confidence are applied without asking (80–100).</span>
          <input
            type="number" min={80} max={100}
            className="adm-input mt-1 w-24"
            value={s.autoApproveThreshold}
            disabled={busy}
            onChange={(e) => setS({ ...s, autoApproveThreshold: Number(e.target.value) })}
            onBlur={() => save(s)}
          />
        </label>
        <div className="text-[12.5px]">
          <span className="font-semibold">A product may be published only if it has:</span>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {Object.keys(FIELD_LABELS).map((f) => (
              <label key={f} className="flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={s.requiredPublishFields.includes(f)}
                  disabled={busy || f === "name" || f === "mop"}
                  onChange={(e) => {
                    const fields = e.target.checked
                      ? [...s.requiredPublishFields, f]
                      : s.requiredPublishFields.filter((x) => x !== f);
                    save({ ...s, requiredPublishFields: fields });
                  }}
                />
                {FIELD_LABELS[f]}
              </label>
            ))}
          </div>
        </div>
      </div>
      {note && <p className="mt-3 font-mono-adm text-[11px] text-[var(--adm-muted)]">{note}</p>}
    </section>
  );
}
