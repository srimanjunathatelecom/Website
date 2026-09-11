"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SafeImage from "../SafeImage";
import { uploadReviewPhoto } from "@/lib/uploadMedia";
import Stars from "../Stars";
import { fetchSession } from "@/lib/session";
import { saveDraft, takeDraft } from "@/lib/formDraft";

const PAGE = 5;

type ApiReview = {
  id: number;
  customerId: number;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  images: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
};

type Payload = {
  items: ApiReview[];
  total: number;
  average: number;
  breakdown: Record<string, number> | null;
  votedIds: number[];
  myReviewId: number | null;
};

function parseImages(raw: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((u) => typeof u === "string" && u.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * Reviews block: aggregate rating, star histogram, paged review cards with
 * verified-purchase badges, photos and a helpful vote, plus the write-review
 * form. Everything comes from /api/reviews — an empty product shows an honest
 * empty state instead of sample reviews.
 */
export default function ReviewsSection({
  productId,
  productSlug,
  productName,
  initialReviews,
}: {
  productId: number;
  productSlug: string;
  productName: string;
  /** Server-rendered first page so the section is not blank before hydration. */
  initialReviews: ApiReview[];
}) {
  const [items, setItems] = useState<ApiReview[]>(initialReviews.slice(0, PAGE));
  const [total, setTotal] = useState(initialReviews.length);
  const [average, setAverage] = useState(
    initialReviews.length ? initialReviews.reduce((s, r) => s + r.rating, 0) / initialReviews.length : 0
  );
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [voted, setVoted] = useState<number[]>([]);
  const [myReviewId, setMyReviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState({ rating: 5, title: "", body: "" });
  // Photos live outside the login draft on purpose: data URLs from the
  // no-R2 fallback are megabytes, and sessionStorage quota would silently
  // eat the shopper's text along with them.
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  // Full-size viewer for review photos; null = closed.
  const [lightbox, setLightbox] = useState<string | null>(null);
  const prefilledPhotos = useRef(false);
  // null while unknown, so the button doesn't flash the wrong label on load.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [formMsg, setFormMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();

  // Note: `loading` is set by the caller so this stays await-first and never
  // triggers a synchronous state update from inside an effect.
  const load = useCallback(
    async (offset: number, replace: boolean) => {
      try {
        const r = await fetch(`/api/reviews?productId=${productId}&limit=${PAGE}&offset=${offset}`);
        if (!r.ok) throw new Error("failed");
        const d: Payload = await r.json();
        setItems((prev) => (replace ? d.items : [...prev, ...d.items]));
        setTotal(d.total || 0);
        setAverage(Number(d.average) || 0);
        setBreakdown(d.breakdown || {});
        setVoted((prev) => Array.from(new Set([...prev, ...(d.votedIds || [])])));
        setMyReviewId(d.myReviewId ?? null);
        // First load only: surface the shopper's already-attached photos in
        // the form. The POST endpoint replaces the whole images list on every
        // submit, so without this an "update" that only fixed a typo would
        // silently strip the photos off the review.
        if (!prefilledPhotos.current && d.myReviewId) {
          const mine = d.items.find((x) => x.id === d.myReviewId);
          if (mine) {
            const own = parseImages(mine.images);
            if (own.length) setPhotos(own);
          }
          prefilledPhotos.current = true;
        }
      } catch {
        setLoadError("Reviews could not be loaded right now.");
      } finally {
        setLoading(false);
      }
    },
    [productId]
  );

  // Refresh on mount to pick up the aggregate figures, vote state and the
  // signed-in shopper's own review, none of which are in the server payload.
  useEffect(() => {
    // `load` is await-first: every state update happens after the fetch
    // resolves, so this cannot cascade renders during commit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(0, true);
  }, [load]);

  /**
   * Works out whether the shopper is signed in, so the form can say what will
   * happen before they spend time writing, and restores a draft they were
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
      const draft = takeDraft<typeof form>(`review:${productId}`);
      if (draft) {
        setForm((f) => ({ ...f, ...draft }));
        setFormMsg({ tone: "ok", text: "We kept what you wrote. Post it whenever you're ready." });
      }
    })();
    return () => {
      alive = false;
    };
    // Runs once per product.
  }, [productId]);

  // Escape closes the photo viewer — the overlay also closes on click, but
  // keyboard users shouldn't be trapped behind a mouse-only control.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const MAX_PHOTOS = 4;

  async function addPhotos(list: FileList | null) {
    if (!list || list.length === 0) return;
    // Signed-out shoppers would only hit a 401 after waiting for uploads;
    // send them to log in first, keeping the text they wrote.
    if (signedIn === false) {
      bounceToLogin(form);
      return;
    }
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(list).slice(0, room);
      if (picked.length < list.length) {
        setPhotoErr(`Up to ${MAX_PHOTOS} photos per review.`);
      }
      const uploaded: string[] = [];
      // Sequential on purpose: parallel uploads of 4 phone photos saturate a
      // weak connection and all four stall; one at a time shows steady progress.
      for (const f of picked) {
        if (!f.type.startsWith("image/")) {
          setPhotoErr("Only image files can be attached.");
          continue;
        }
        uploaded.push(await uploadReviewPhoto(f));
      }
      if (uploaded.length) setPhotos((p) => [...p, ...uploaded].slice(0, MAX_PHOTOS));
    } catch (e) {
      setPhotoErr(e instanceof Error && e.message ? e.message : "Photo upload failed. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function markHelpful(id: number) {
    if (voted.includes(id)) return;
    try {
      const r = await fetch("/api/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, helpful: true }),
      });
      if (r.status === 401) {
        router.push(`/login?redirect=/products/${productSlug}`);
        return;
      }
      const d = await r.json();
      if (!r.ok) return;
      setVoted((v) => [...v, id]);
      setItems((list) =>
        list.map((x) => (x.id === id ? { ...x, helpfulCount: Number(d.helpfulCount ?? x.helpfulCount) } : x))
      );
    } catch {
      // A failed vote leaves the count untouched rather than showing a fake increment.
    }
  }

  /**
   * Sends the shopper to log in without throwing away what they wrote. The
   * draft is picked back up by the mount effect when they return.
   */
  const draftKey = `review:${productId}`;

  function bounceToLogin(draft: typeof form) {
    saveDraft(draftKey, draft);
    router.push(`/login?redirect=/products/${productSlug}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    // Already known to be signed out: no point posting just to be refused.
    if (signedIn === false) {
      bounceToLogin(form);
      return;
    }
    setSubmitting(true);
    setFormMsg(null);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, ...form, images: photos }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) {
        // Session expired between load and submit.
        bounceToLogin(form);
        return;
      }
      if (!r.ok) {
        setFormMsg({ tone: "err", text: d.error || "Could not post your review." });
        return;
      }
      setFormMsg({ tone: "ok", text: d.updated ? "Your review was updated." : "Thanks! Your review was posted." });
      setForm({ rating: 5, title: "", body: "" });
      setPhotos([]);
      setPhotoErr("");
      await load(0, true);
    } catch {
      setFormMsg({ tone: "err", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const counted = Object.values(breakdown).reduce((s, n) => s + Number(n || 0), 0);

  return (
    <section id="reviews" className="w-full scroll-mt-24">
      <div className="mb-5 flex items-end justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <h2 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">Ratings &amp; reviews</h2>
        <span className="text-sm font-semibold text-slate-500">
          {total} review{total === 1 ? "" : "s"}
        </span>
      </div>

      {total > 0 && (
        <div className="mb-6 flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
          <div className="shrink-0 text-center sm:w-40">
            <p className="text-[34px] font-extrabold leading-none text-slate-900 dark:text-white">
              {average.toFixed(1)}
            </p>
            <div className="mt-1.5 flex justify-center">
              <Stars value={Math.round(average)} size={16} />
            </div>
            <p className="mt-1 text-[12px] font-semibold text-slate-500">
              {total} rating{total === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = Number(breakdown[String(star)] || 0);
              const pct = counted > 0 ? Math.round((n / counted) * 100) : 0;
              return (
                <li key={star} className="flex items-center gap-2.5 text-[12px]">
                  <span className="w-10 shrink-0 font-semibold text-slate-600 dark:text-slate-400">{star} star</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                      role="img"
                      aria-label={`${star} star: ${n} of ${counted} reviews`}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right font-semibold text-slate-500">{n}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="w-full space-y-4">
        {loadError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-600 dark:border-rose-900 dark:bg-rose-950/40">
            {loadError}
          </p>
        )}
        {!loadError && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <p className="font-semibold text-slate-500">No reviews yet. Be the first to review {productName}.</p>
          </div>
        )}
        {items.map((r) => {
          const photos = parseImages(r.images);
          const didVote = voted.includes(r.id);
          return (
            <article key={r.id} className="w-full rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 font-bold text-slate-500 dark:bg-slate-800">
                    {(r.customerName || "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {r.customerName || "Customer"}
                      {r.id === myReviewId && <span className="ml-1.5 text-[11px] font-semibold text-blue-600">(you)</span>}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <Stars value={r.rating} size={14} />
              </div>

              {r.verifiedPurchase && (
                <p className="mt-3 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Verified Purchase
                </p>
              )}

              {r.title && <p className="mt-3 text-[15px] font-bold text-slate-900 dark:text-white">{r.title}</p>}
              {r.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.body}</p>}

              {photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {photos.map((u, i) => (
                    <button
                      key={`${r.id}-${i}`}
                      type="button"
                      onClick={() => setLightbox(u)}
                      aria-label={`Enlarge photo ${i + 1} from ${r.customerName}'s review`}
                      className="relative h-16 w-16 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 transition hover:ring-2 hover:ring-blue-500 dark:border-slate-700"
                    >
                      <SafeImage src={u} alt={`Photo ${i + 1} from ${r.customerName}'s review`} className="h-full w-full object-cover" sizes="64px" />
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => markHelpful(r.id)}
                  disabled={didVote || r.id === myReviewId}
                  aria-pressed={didVote}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={didVote ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4.6-7.2A1.5 1.5 0 0 1 14 4v5h4.6a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.2 20H7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {didVote ? "Marked helpful" : "Helpful"}
                </button>
                {r.helpfulCount > 0 && (
                  <span className="text-[12px] font-semibold text-slate-500">
                    {r.helpfulCount} found this helpful
                  </span>
                )}
              </div>
            </article>
          );
        })}

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
            {loading ? "Loading…" : `Load more reviews (${total - items.length} left)`}
          </button>
        )}
      </div>

      <form onSubmit={submit} className="mt-8 w-full rounded-2xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {myReviewId ? "Update your review" : "Write a review"}
        </h3>
        {/* Said before they start writing, not after they press the button. */}
        {signedIn === false && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            You&rsquo;ll need to log in to post. We&rsquo;ll keep what you&rsquo;ve written.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="rv-rating" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Rate this product
          </label>
          <select
            id="rv-rating"
            value={form.rating}
            onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 py-2.5 pl-4 pr-8 text-sm font-bold outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>
            ))}
          </select>
        </div>
        <label htmlFor="rv-title" className="sr-only">Review title</label>
        <input
          id="rv-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={160}
          placeholder="Summarise your experience (optional)"
          className="mt-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
        />
        <label htmlFor="rv-body" className="sr-only">Your review</label>
        <textarea
          id="rv-body"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          required
          rows={4}
          maxLength={4000}
          placeholder="What did you like or dislike?"
          className="mt-3 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
        />
        {/* Photo attachments — the single highest-trust signal a review can
            carry. Uploads are downscaled client-side, so even on hostel Wi-Fi
            four photos go up in seconds. */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((u, i) => (
              <span key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <SafeImage src={u} alt={`Your photo ${i + 1}`} className="h-full w-full object-cover" sizes="64px" />
                <button
                  type="button"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-slate-900/80 text-[11px] font-bold leading-none text-white hover:bg-rose-600"
                >
                  ×
                </button>
              </span>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className={`grid h-16 w-16 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-300 text-center text-[10px] font-bold text-slate-500 transition hover:border-blue-500 hover:text-blue-600 dark:border-slate-600 ${photoBusy ? "pointer-events-none opacity-50" : ""}`}>
                {photoBusy ? "…" : "+ Photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  className="sr-only"
                  disabled={photoBusy}
                  onChange={(e) => {
                    void addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
            Add up to {MAX_PHOTOS} photos of the product (optional). Real photos help other buyers most.
          </p>
          {photoErr && <p className="mt-1 text-[12px] font-bold text-rose-500">{photoErr}</p>}
        </div>
        <button
          type="submit"
          disabled={submitting || photoBusy}
          className="mt-4 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold tracking-wide text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {submitting
            ? "Posting…"
            : signedIn === false
              ? "Log in to post your review"
              : myReviewId
                ? "Update review"
                : "Submit review"}
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

      {/* Full-size photo viewer. A fixed overlay rather than a route or a
          library: click anywhere or press Escape to dismiss. */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review photo"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL
              photos bypass the optimizer anyway; plain img keeps the viewer
              free of layout constraints. */}
          <img src={lightbox} alt="Review photo, enlarged" className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl" />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close photo"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl font-bold text-white transition hover:bg-white/25"
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}
