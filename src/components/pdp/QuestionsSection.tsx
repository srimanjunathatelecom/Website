"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircleQuestion, Store, Clock, Trash2 } from "lucide-react";
import { fetchSession } from "@/lib/session";
import { saveDraft, takeDraft } from "@/lib/formDraft";

const PAGE = 5;

export type ApiQuestion = {
  id: number;
  productId: number;
  customerId: number;
  customerName: string;
  body: string;
  answer: string;
  answeredBy: string;
  answeredAt: string | null;
  status: string;
  createdAt: string;
};

type Payload = {
  items: ApiQuestion[];
  total: number;
  answered: number;
  mine: ApiQuestion[];
  signedIn: boolean;
};

function when(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * "Questions about this product": published shopper questions with the store's
 * answers, plus an ask form. Everything comes from /api/questions — a product
 * nobody has asked about shows an honest empty state, and a question is only
 * visible here once the store has published it.
 */
export default function QuestionsSection({
  productId,
  productSlug,
  productName,
  initialQuestions,
}: {
  productId: number;
  productSlug: string;
  productName: string;
  /** Server-rendered first page so the section isn't blank before hydration. */
  initialQuestions: ApiQuestion[];
}) {
  const [items, setItems] = useState<ApiQuestion[]>(initialQuestions.slice(0, PAGE));
  const [total, setTotal] = useState(initialQuestions.length);
  const [answered, setAnswered] = useState(initialQuestions.filter((q) => q.answer).length);
  const [mine, setMine] = useState<ApiQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [draft, setDraft] = useState("");
  // null while unknown, so the button doesn't flash the wrong label on load.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const router = useRouter();

  // Await-first, exactly like the reviews list: every state update happens
  // after the request resolves, so this never updates state during a commit.
  const load = useCallback(
    async (offset: number, replace: boolean) => {
      try {
        const r = await fetch(`/api/questions?productId=${productId}&limit=${PAGE}&offset=${offset}`);
        if (!r.ok) throw new Error("failed");
        const d: Payload = await r.json();
        setItems((prev) => (replace ? d.items : [...prev, ...d.items]));
        setTotal(d.total || 0);
        setAnswered(d.answered || 0);
        setMine(d.mine || []);
      } catch {
        setLoadError("Questions could not be loaded right now.");
      } finally {
        setLoading(false);
      }
    },
    [productId]
  );

  // Refreshed on mount to pick up the shopper's own unpublished questions,
  // which are deliberately absent from the cached server payload.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(0, true);
  }, [load]);

  /**
   * Works out whether the shopper is signed in, so the form can say what will
   * happen before they spend time writing, and restores a question they were
   * carrying back from the login page.
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await fetchSession();
      if (!alive) return;
      // Await-first, like `load` above: every state update happens after the
      // fetch resolves, so this cannot cascade renders during commit.
      setSignedIn(!!session.customer);
      const saved = takeDraft<string>(`question:${productId}`);
      if (saved) {
        setDraft(saved);
        setFormMsg({ tone: "ok", text: "We kept what you wrote. Post it whenever you're ready." });
      }
    })();
    return () => {
      alive = false;
    };
    // Runs once per product.
  }, [productId]);

  /**
   * Sends the shopper to log in without throwing away what they wrote. The
   * question is picked back up by the mount effect when they return.
   */
  function bounceToLogin(text: string) {
    saveDraft(`question:${productId}`, text);
    router.push(`/login?redirect=/products/${productSlug}`);
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    // Already known to be signed out: no point posting just to be refused.
    if (signedIn === false) {
      bounceToLogin(draft);
      return;
    }
    setSubmitting(true);
    setFormMsg(null);
    try {
      const r = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, body: draft }),
      });
      if (r.status === 401) {
        // Session expired between load and submit.
        bounceToLogin(draft);
        return;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFormMsg({ tone: "err", text: d.error || "Could not send your question." });
        return;
      }
      setDraft("");
      setFormMsg({
        tone: "ok",
        text: "Thanks — the store will reply, and your question appears here once it's answered.",
      });
      await load(0, true);
    } catch {
      setFormMsg({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function withdraw(id: number) {
    try {
      const r = await fetch("/api/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) return;
      setMine((list) => list.filter((q) => q.id !== id));
    } catch {
      // Leaving the question in place is better than pretending it was removed.
    }
  }

  return (
    <section id="questions" className="w-full scroll-mt-24">
      <div className="mb-5 flex items-end justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
          Questions about this product
        </h2>
        {total > 0 && (
          <span className="text-sm font-semibold text-slate-500">
            {answered} answered of {total}
          </span>
        )}
      </div>

      {/* The shopper's own questions still in moderation. Shown only to them. */}
      {mine.length > 0 && (
        <ul className="mb-5 space-y-2">
          {mine.map((q) => (
            <li
              key={q.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/30"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  {q.status === "rejected" ? (
                    "Not published by the store"
                  ) : (
                    <>
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      Your question — awaiting a reply
                    </>
                  )}
                </p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{q.body}</p>
              </div>
              <button
                type="button"
                onClick={() => withdraw(q.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="w-full space-y-4">
        {loadError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/40">
            {loadError}
          </p>
        )}

        {!loadError && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <MessageCircleQuestion className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="mt-2 font-semibold text-slate-500">
              No questions yet. Ask anything about {productName} and the store will answer.
            </p>
          </div>
        )}

        {items.map((q) => (
          <article
            key={q.id}
            className="w-full rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500 dark:bg-slate-800"
              >
                Q
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-slate-900 dark:text-white">{q.body}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  Asked by {q.customerName || "a customer"}
                  {when(q.createdAt) ? ` · ${when(q.createdAt)}` : ""}
                </p>
              </div>
            </div>

            {q.answer ? (
              <div className="mt-3 flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                >
                  <Store className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {q.answer}
                  </p>
                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Answered by {q.answeredBy || "the store"}
                    {when(q.answeredAt) ? ` · ${when(q.answeredAt)}` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Awaiting an answer from the store
              </p>
            )}
          </article>
        ))}

        {items.length < total && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadError("");
              void load(items.length, false);
            }}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-400 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
          >
            {loading ? "Loading…" : `Load more questions (${total - items.length} left)`}
          </button>
        )}
      </div>

      <form
        onSubmit={ask}
        className="mt-8 w-full rounded-2xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/50"
      >
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ask a question</h3>
        <p className="mt-1 text-[13px] text-slate-500">
          Questions go to the store team and appear here with their reply.
          {/* Said before they start writing, not after they press the button. */}
          {signedIn === false && " You'll need to log in to post — we'll keep what you've written."}
        </p>
        <label htmlFor="qa-body" className="sr-only">
          Your question about {productName}
        </label>
        <textarea
          id="qa-body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          required
          rows={3}
          minLength={10}
          maxLength={1000}
          placeholder="e.g. Does this come with a charger in the box?"
          className="mt-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={submitting || draft.trim().length < 10}
          className="mt-4 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold tracking-wide text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {submitting ? "Sending…" : signedIn === false ? "Log in to post your question" : "Post question"}
        </button>
        {formMsg && (
          <p
            aria-live="polite"
            className={`mt-3 text-sm font-bold ${formMsg.tone === "ok" ? "text-emerald-600" : "text-rose-500"}`}
          >
            {formMsg.text}
          </p>
        )}
      </form>
    </section>
  );
}
