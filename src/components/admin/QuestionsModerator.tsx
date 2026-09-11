"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminAuth";

/**
 * Moderation queue for shopper questions asked on product pages.
 *
 * A question starts as "pending" and is invisible on the storefront. From here
 * the store writes the answer and publishes it, or rejects it. Publishing and
 * answering are separate actions on purpose: a question can be published while
 * the answer is still being worked out, and an answer can be saved as a draft
 * before it goes live.
 */

type AdminQuestion = {
  id: number;
  productId: number;
  productName: string;
  productSlug: string;
  customerId: number;
  customerName: string;
  body: string;
  answer: string;
  answeredBy: string;
  answeredAt: string | null;
  status: string;
  createdAt: string;
};

const TABS = [
  { key: "pending", label: "Awaiting reply" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PAGE = 20;

function when(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function QuestionsModerator() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [items, setItems] = useState<AdminQuestion[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  // `append` keeps already-loaded rows and adds the next page; a plain reload
  // (after answering or deleting) re-reads from the start.
  const load = useCallback(async (which: TabKey, offset = 0, append = false) => {
    setError("");
    try {
      const r = await adminFetch(`/api/questions?status=${which}&limit=${PAGE}&offset=${offset}`);
      if (!r.ok) throw new Error("failed");
      const d = await r.json();
      const rows = (d.items || []) as AdminQuestion[];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setCounts(d.counts || {});
      setTotal(d.total || 0);
      // Seed each editor with the answer already stored, so an existing reply
      // can be corrected instead of retyped. Drafts being edited on rows
      // already on screen are preserved when paging.
      setDrafts((prev) => {
        const next = append ? { ...prev } : {};
        for (const q of rows) if (next[q.id] === undefined) next[q.id] = q.answer || "";
        return next;
      });
    } catch {
      setError("Could not load questions.");
    } finally {
      setLoading(false);
      setPaging(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tab);
  }, [load, tab]);

  async function patch(id: number, payload: Record<string, unknown>, successText: string) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const r = await adminFetch("/api/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d?.error || `Could not update the question (${r.status}).`);
        return;
      }
      setNotice(successText);
      await load(tab);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(q: AdminQuestion) {
    if (!window.confirm("Delete this question permanently?")) return;
    setBusyId(q.id);
    setError("");
    setNotice("");
    try {
      const r = await adminFetch("/api/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: q.id }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d?.error || `Could not delete the question (${r.status}).`);
        return;
      }
      setNotice("Question deleted.");
      await load(tab);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setLoading(true);
                setNotice("");
              }}
              aria-pressed={active}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                active
                  ? "bg-[var(--adm-ink)] text-[var(--adm-paper)]"
                  : "border border-[var(--adm-line-strong)] text-[var(--adm-muted)] hover:bg-[var(--adm-paper-2)]"
              }`}
            >
              {t.label}
              <span className="ml-1.5 font-mono-adm text-[10px] opacity-70">{counts[t.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 text-[12px] text-[var(--adm-rose)]">{error}</p>}
      {notice && !error && <p className="mt-3 text-[12px] text-[var(--adm-pine)]">{notice}</p>}

      {loading ? (
        <p className="mt-4 font-mono-adm text-[11px] text-[var(--adm-muted)]">Loading questions…</p>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-dashed border-[var(--adm-line-strong)] bg-[#fffdf7] p-10 text-center">
          <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">
            {tab === "pending"
              ? "No questions waiting for a reply."
              : tab === "published"
                ? "Nothing published yet. Answer a waiting question to publish it."
                : "No rejected questions."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((q) => {
            const draft = drafts[q.id] ?? "";
            const busy = busyId === q.id;
            return (
              <li key={q.id} className="adm-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="adm-eyebrow">
                      {q.productSlug ? (
                        <Link href={`/products/${q.productSlug}#questions`} className="underline">
                          {q.productName}
                        </Link>
                      ) : (
                        q.productName
                      )}
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-[var(--adm-ink)]">{q.body}</p>
                    <p className="mt-1 font-mono-adm text-[10px] text-[var(--adm-muted)]">
                      {q.customerName || "Customer"} · {when(q.createdAt)}
                      {q.answeredBy ? ` · answered by ${q.answeredBy} ${when(q.answeredAt)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`adm-pill shrink-0 ${
                      q.status === "published"
                        ? "!text-[var(--adm-pine)]"
                        : q.status === "rejected"
                          ? "!text-[var(--adm-rose)]"
                          : ""
                    }`}
                  >
                    {q.status}
                  </span>
                </div>

                <label className="mt-3 block">
                  <span className="adm-eyebrow">Store answer (shown on the product page)</span>
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                    rows={3}
                    maxLength={2000}
                    placeholder="Answer the shopper's question factually — stock, compatibility, warranty, what's in the box…"
                    className="adm-input mt-1 !text-[13px]"
                  />
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patch(q.id, { answer: draft }, "Answer saved (not published).")}
                    className="adm-btn !py-1 !text-[11px]"
                  >
                    Save answer
                  </button>
                  {q.status !== "published" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        patch(
                          q.id,
                          { answer: draft, status: "published" },
                          draft.trim()
                            ? "Answer published on the product page."
                            : "Question published without an answer."
                        )
                      }
                      className="adm-btn adm-btn--pine !py-1 !text-[11px]"
                    >
                      {draft.trim() ? "Answer & publish" : "Publish unanswered"}
                    </button>
                  )}
                  {q.status === "published" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        patch(q.id, { answer: draft, status: "published" }, "Published answer updated.")
                      }
                      className="adm-btn adm-btn--pine !py-1 !text-[11px]"
                    >
                      Update published answer
                    </button>
                  )}
                  {q.status !== "pending" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => patch(q.id, { status: "pending" }, "Moved back to the queue.")}
                      className="adm-btn !py-1 !text-[11px]"
                    >
                      Unpublish
                    </button>
                  )}
                  {q.status !== "rejected" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => patch(q.id, { status: "rejected" }, "Question rejected.")}
                      className="adm-btn !py-1 !text-[11px]"
                    >
                      Reject
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(q)}
                    className="adm-btn !py-1 !text-[11px] !text-[var(--adm-rose)]"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && total > items.length && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono-adm text-[11px] text-[var(--adm-muted)]">
            Showing {items.length} of {total}
          </p>
          <button
            type="button"
            disabled={paging}
            onClick={() => {
              setPaging(true);
              void load(tab, items.length, true);
            }}
            className="adm-btn !py-1 !text-[11px]"
          >
            {paging ? "Loading…" : `Load ${Math.min(PAGE, total - items.length)} older`}
          </button>
        </div>
      )}
    </div>
  );
}
