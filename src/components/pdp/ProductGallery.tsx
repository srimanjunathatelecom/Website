"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import SafeImage from "../SafeImage";
import type { ProductMedia } from "@/lib/queries";

/**
 * PDP media gallery.
 *
 * All media comes from `product_images` (admin-managed): ordering, alt text,
 * the optional `variantColor` association and `mediaType` ("image" | "video").
 * Nothing is generated here — if a product has no media the empty state shows.
 *
 * Layout: vertical thumbnail rail on desktop, horizontal strip on mobile,
 * fixed aspect-ratio stage so the page never shifts while images load.
 */
export default function ProductGallery({
  media,
  productName,
  activeColor,
  children,
}: {
  media: ProductMedia[];
  productName: string;
  /** Selected colour — filters the gallery to that colour's media when any exists. */
  activeColor?: string;
  /** Overlay controls (wishlist / share) rendered on top of the stage. */
  children?: React.ReactNode;
}) {
  const stageId = useId();

  // Media associated with the selected colour wins; entries with no colour are
  // shared across colours and are always kept so a product that only has
  // generic photos still shows a full gallery.
  const items = useMemo(() => {
    const all = (media || []).filter((m) => m && m.url);
    const color = (activeColor || "").trim().toLowerCase();
    if (!color) return all;
    const forColor = all.filter((m) => (m.variantColor || "").trim().toLowerCase() === color);
    if (!forColor.length) return all.filter((m) => !(m.variantColor || "").trim());
    const shared = all.filter((m) => !(m.variantColor || "").trim());
    return [...forColor, ...shared];
  }, [media, activeColor]);

  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touchStart = useRef<number | null>(null);
  const thumbRail = useRef<HTMLDivElement | null>(null);

  const count = items.length;
  const safeIndex = count ? Math.min(index, count - 1) : 0;
  const current = items[safeIndex];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((i) => (i + delta + count) % count);
      setZoom(null);
    },
    [count]
  );

  // Arrow keys drive the gallery whenever the lightbox is open; Escape closes it.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox, go]);

  // Keep the active thumbnail in view when navigating with the arrows.
  useEffect(() => {
    const rail = thumbRail.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>(`[data-thumb="${safeIndex}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [safeIndex]);

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!current || current.mediaType === "video") return;
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }

  const isVideo = current?.mediaType === "video";

  function Thumb({ m, i }: { m: ProductMedia; i: number }) {
    return (
      <button
        type="button"
        data-thumb={i}
        onClick={() => {
          setIndex(i);
          setZoom(null);
        }}
        aria-label={`Show media ${i + 1} of ${count}${m.mediaType === "video" ? " (video)" : ""}`}
        aria-current={i === safeIndex}
        className={`relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border-2 bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:h-14 md:w-14 ${
          i === safeIndex
            ? "border-slate-900 shadow-sm dark:border-white"
            : "border-slate-200 opacity-60 hover:opacity-100 dark:border-slate-700"
        }`}
      >
        {m.mediaType === "video" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <SafeImage
            src={m.url}
            alt=""
            className="h-full w-full object-contain mix-blend-multiply dark:mix-blend-normal"
            sizes="56px"
          />
        )}
      </button>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex w-full flex-row overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
        {/* Desktop: vertical thumbnail rail */}
        {count > 1 && (
          <div
            ref={thumbRail}
            className="scrollbar-hide hidden max-h-[560px] w-[64px] shrink-0 flex-col items-center gap-3 overflow-y-auto px-2 py-5 md:flex md:w-[76px]"
          >
            {items.map((m, i) => (
              <Thumb key={`${m.id}-${i}`} m={m} i={i} />
            ))}
          </div>
        )}

        <div
          className="group relative flex aspect-square min-w-0 flex-1 items-center justify-center overflow-hidden p-6 sm:aspect-[4/5] sm:p-10"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setZoom(null)}
          aria-live="polite"
          id={stageId}
        >
          {!current ? (
            <div className="flex flex-col items-center justify-center gap-2 text-xs font-semibold text-slate-300 dark:text-slate-700">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              No product image yet
            </div>
          ) : isVideo ? (
            <video
              key={current.url}
              src={current.url}
              controls
              playsInline
              preload="metadata"
              aria-label={current.alt || `${productName} video`}
              className="h-full w-full rounded-lg object-contain"
            />
          ) : (
            <>
              <SafeImage
                src={current.url}
                alt={current.alt || productName}
                priority={safeIndex === 0}
                sizes="(max-width: 768px) 100vw, 45vw"
                className="h-full w-full object-contain mix-blend-multiply transition-transform duration-300 ease-out dark:mix-blend-normal"
              />
              {/* Desktop hover zoom: a magnified layer positioned at the cursor. */}
              {zoom && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 hidden bg-white bg-contain bg-no-repeat opacity-0 transition-opacity duration-150 group-hover:opacity-100 md:block dark:bg-slate-900"
                  style={{
                    backgroundImage: `url(${current.url})`,
                    backgroundSize: "200%",
                    backgroundPosition: `${zoom.x}% ${zoom.y}%`,
                  }}
                />
              )}
            </>
          )}

          {/* Prev / next */}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous media"
                className="absolute left-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:bg-slate-800/90 dark:text-slate-200"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next media"
                className="absolute right-2 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 shadow-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:bg-slate-800/90 dark:text-slate-200"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </>
          )}

          {/* Counter */}
          {count > 0 && (
            <span className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-bold text-white">
              {safeIndex + 1} / {count}
            </span>
          )}

          {/* Fullscreen */}
          {current && !isVideo && (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              aria-label="View image full screen"
              className="absolute bottom-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-600 shadow-md transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:bg-slate-800/90 dark:text-slate-300"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}

          {children}
        </div>
      </div>

      {/* Mobile: horizontal thumbnail strip */}
      {count > 1 && (
        <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 md:hidden">
          {items.map((m, i) => (
            <Thumb key={`m-${m.id}-${i}`} m={m} i={i} />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} image ${safeIndex + 1} of ${count}`}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Close full screen view"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
          <div
            className="relative h-full max-h-[80vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <SafeImage
              src={current.url}
              alt={current.alt || productName}
              sizes="100vw"
              className="h-full w-full object-contain"
            />
          </div>
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" /></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label="Next image"
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" strokeLinecap="round" /></svg>
              </button>
            </>
          )}
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
            {safeIndex + 1} / {count}
          </span>
        </div>
      )}

    </div>
  );
}
