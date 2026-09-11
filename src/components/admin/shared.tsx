"use client";

import { clearAdminSession } from "@/lib/adminAuth";

/**
 * Helpers shared by the admin dashboard shell and its lazy-loaded sections.
 * Extracted from AdminDashboard.tsx so each section chunk only ships what
 * it uses.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import React from "react";
import { adminFetch, buildDownloadUrl, copyToClipboard } from "@/lib/adminAuth";

export function SectionHeader({ index, title, kicker, children }: { index: string; title: string; kicker?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="adm-eyebrow">{index} / {kicker || "Section"}</p>
          <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">{title}</h1>
        </div>
        {children}
      </div>
      <hr className="adm-rule mt-4" />
    </div>
  );
}

export function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return val;
}

export function StatCard({ label, value, prefix = "", suffix = "", sub, fill, fillColor = "var(--adm-pine)", tone = "ink" }: any) {
  const animated = useCountUp(value);
  const toneColor = tone === "pine" ? "var(--adm-pine)" : tone === "amber" ? "var(--adm-amber)" : tone === "rose" ? "var(--adm-rose)" : "var(--adm-ink)";
  const display = Number.isInteger(value) ? Math.round(animated).toLocaleString("en-IN") : animated.toFixed(0);

  return (
    <div className="adm-card relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <p className="adm-eyebrow">{label}</p>
        <span className="font-mono-adm text-[10px] text-[var(--adm-muted)]">{tone.toUpperCase()}</span>
      </div>
      <p className="adm-count mt-3 font-mono-adm text-[34px] font-bold leading-none tracking-tight" style={{ color: toneColor }}>
        {prefix}{display}{suffix}
      </p>
      {sub && <p className="mt-2 text-[12px] text-[var(--adm-muted)]">{sub}</p>}
      {typeof fill === "number" && (
        <div className="adm-bar mt-4 h-[3px] w-full overflow-hidden rounded-full bg-[var(--adm-line)]">
          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, fill))}%`, background: fillColor }} />
        </div>
      )}
    </div>
  );
}

export function useApi<T = any>(url: string, opts?: { poll?: number; transform?: (d: any) => T }) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Every call site passes `opts` as an inline object literal, so its identity
  // changes on every render. Holding it in a ref is what lets `load` below be a
  // stable callback: read directly, `opts.transform` would have to be a
  // dependency, `load` would be rebuilt each render, and the effect that depends
  // on it would refetch in a loop.
  const optsRef = useRef(opts);
  // Synced in an effect rather than assigned during render, which React 19
  // rightly rejects. useRef's initial value covers the first pass, and this
  // effect is declared before the fetching one so the ref is current by the
  // time load() runs.
  useEffect(() => {
    optsRef.current = opts;
  });

  const load = useCallback(async () => {
    try {
      const r = await adminFetch(url);
      if (r.status === 401) {
        clearAdminSession();
        window.location.replace("/admin/login");
        return;
      }
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      const transform = optsRef.current?.transform;
      setData(transform ? transform(d) : d);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // Fetch-on-mount, with optional polling.
    load();
    if (opts?.poll) {
      const t = setInterval(load, opts.poll);
      return () => clearInterval(t);
    }
  }, [load, opts?.poll]);

  return { data, loading, error, reload: load };
}

export function Empty({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="adm-card flex flex-col items-center gap-2 p-10 text-center">
      <p className="font-mono-adm text-[11px] uppercase tracking-[0.2em] text-[var(--adm-muted)]">No records</p>
      <p className="font-display-adm text-lg">{label}</p>
      {hint && <p className="max-w-sm text-[13px] text-[var(--adm-muted)]">{hint}</p>}
    </div>
  );
}

export function StatusDot({ tone }: { tone: "good" | "warn" | "bad" | "neutral" }) {
  const color = tone === "good" ? "var(--adm-pine)" : tone === "warn" ? "var(--adm-amber)" : tone === "bad" ? "var(--adm-rose)" : "var(--adm-muted)";
  return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />;
}


export function ExportTile({ kind, title, meta }: { kind: "stock" | "customers" | "orders" | "margins" | "coupon-usage" | "all"; title: string; meta: string }) {
  const files = useMemo(() => {
    if (kind === "all") {
      return [
        { path: "/api/export/stock",     name: `sms-stock-${stamp()}.csv` },
        { path: "/api/export/customers", name: `sms-customers-${stamp()}.csv` },
        { path: "/api/export/orders",    name: `sms-orders-${stamp()}.csv` },
        { path: "/api/export/margins",   name: `sms-margins-${stamp()}.csv` },
        { path: "/api/export/coupon-usage", name: `sms-coupon-usage-${stamp()}.csv` },
      ];
    }
    const map = {
      stock:     { path: "/api/export/stock",     name: `sms-stock-${stamp()}.csv` },
      customers: { path: "/api/export/customers", name: `sms-customers-${stamp()}.csv` },
      orders:    { path: "/api/export/orders",    name: `sms-orders-${stamp()}.csv` },
      margins:   { path: "/api/export/margins",   name: `sms-margins-${stamp()}.csv` },
      "coupon-usage": { path: "/api/export/coupon-usage", name: `sms-coupon-usage-${stamp()}.csv` },
    } as const;
    return [map[kind]];
  }, [kind]);

  const [copied, setCopied] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function handleCopy(url: string, key: string) {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  function handleDownload() {
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  }

  return (
    <div className="adm-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display-adm text-[15px] leading-tight">{title}</p>
          <p className="mt-0.5 text-[11px] text-[var(--adm-muted)]">{meta}</p>
        </div>
        <span className="adm-pill adm-pill--good"><StatusDot tone="good" /> live</span>
      </div>
      <div className="space-y-1.5">
        {files.map((f) => {
          const url = buildDownloadUrl(f.path, f.name);
          const key = f.path;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <a
                href={url}
                download={f.name}
                onClick={handleDownload}
                className="adm-btn adm-btn--pine flex-1 justify-center !py-1.5 !text-[12px]"
                title={`Download ${f.name}`}
              >
                  {files.length > 1 ? shortName(f.name) : "Download CSV"}
              </a>
              <button
                onClick={() => window.open(url, "_blank", "noopener")}
                className="adm-btn !py-1.5 !px-2 !text-[11px]"
                title="Open in new tab"
              >Open</button>
              <button
                onClick={() => handleCopy(url, key)}
                className="adm-btn !py-1.5 !px-2 !text-[11px]"
                title="Copy download link"
              >{copied === key ? "Copied" : "Copy"}</button>
            </div>
          );
        })}
      </div>
      {downloaded && (
        <p className="font-mono-adm text-[10px] text-[var(--adm-pine)]">
            Download started. If nothing appears, click Open.
        </p>
      )}
    </div>
  );
}

export function stamp() { return new Date().toISOString().slice(0, 10).replace(/-/g, ""); }
export function shortName(n: string) { return n.replace(/^sms-/, "").replace(/-\d{8}\.csv$/, ""); }
export function inr(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN"); }


export function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${active ? "border-[var(--adm-ink)] bg-[var(--adm-ink)] text-[var(--adm-paper)]" : "border-[var(--adm-line-strong)] bg-[#fffdf7] text-[var(--adm-muted)] hover:border-[var(--adm-ink)] hover:text-[var(--adm-ink)]"}`}
    >
      {children}
    </button>
  );
}


export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="adm-eyebrow">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition ${checked ? "border-[var(--adm-ink)] bg-[var(--adm-ink)] text-[var(--adm-paper)]" : "border-[var(--adm-line-strong)] bg-[#fffdf7] text-[var(--adm-muted)]"}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="hidden" />
      <span className={`grid h-3 w-3 place-items-center rounded-sm border ${checked ? "border-white bg-white text-[var(--adm-ink)]" : "border-current"}`}>
        <span className={`h-1.5 w-1.5 bg-current ${checked ? "block" : "hidden"}`}></span>
      </span>
      {label}
    </label>
  );
}

// Small "paste a URL, click Add" control used to append an image to a gallery
// array — distinct from a normal Field since it doesn't hold a bound value,
// it clears itself after each successful add.
export function UrlAddField({ onAdd }: { onAdd: (url: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <Field label="Add image by URL">
      <div className="flex gap-1.5">
        <input
          type="text"
          inputMode="url"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="adm-input font-mono-adm !text-[11px]"
        />
        <button
          type="button"
          onClick={() => { if (val.trim()) { onAdd(val); setVal(""); } }}
          className="adm-btn !py-1.5 !px-3 !text-[11px] shrink-0"
        >
          Add
        </button>
      </div>
    </Field>
  );
}


export function StatusTable<T extends { id: number }>({ apiPath, statuses, poll = 12000, render, empty }: any) {
  const { data, loading, reload } = useApi(apiPath, { poll, transform: (d) => d.items as T[] });

  async function update(id: number, status: string) {
    const r = await adminFetch(`${apiPath}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Couldn't update status.");
    }
    reload();
  }

  const rows = data || [];

  return (
    <div className="overflow-x-auto rounded-[14px] border border-[var(--adm-line)] bg-[#fffdf7]">
      {loading && !data ? (
        <p className="px-5 py-10 text-center font-mono-adm text-[12px] text-[var(--adm-muted)]">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center"><Empty label={empty} /></div>
      ) : (
        <ul className="divide-y divide-[var(--adm-line)]">
          {rows.map((r: any) => (
            <li key={r.id} className="adm-row px-5 py-4">
              {render(r, (s: string) => update(r.id, s))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatusSelect({ value, onChange, options }: { value: string; onChange: (s: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="adm-input !py-1 !text-[12px] !w-auto font-mono-adm">
      {options.map((s) => <option key={s}>{s}</option>)}
    </select>
  );
}

