"use client";

/**
 * Homepage "Popular Repaired Services" — an image-led editorial rail, built
 * to feel different from the product shelves. Intentionally separate from
 * ServicesShowcase (the full /services storefront) — both read the same
 * services table, but this is a teaser rail and that is the full experience:
 *
 *   · One oversized spotlight tile (the first featured repair) opens the
 *     rail, followed by a rhythm of two card shapes — full-bleed overlay
 *     tiles and stacked photo cards — so the strip reads as a composed
 *     collage rather than N copies of one card.
 *   · The rail scrolls horizontally with scroll-snap; arrows and a live
 *     progress bar mirror position. Hover lifts the card and slowly zooms
 *     the photograph.
 *   · Reveal/zoom/lift animations all collapse under
 *     prefers-reduced-motion (globals.css handles reveal; scrolling and
 *     transforms are gated here).
 *
 * Everything rendered is real data from Admin > Services: name, category,
 * starting price, turnaround and the licence-verified photo. Copy framing
 * comes from Admin > Homepage CMS. No prices or claims are invented here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import AutoImage from "@/components/AutoImage";
import Reveal from "@/components/Reveal";

type Service = {
  id: number;
  name: string;
  description: string;
  startPrice: string;
  turnaround: string;
  image?: string | null;
  imageAlt?: string | null;
  category?: string | null;
  featured?: boolean | null;
  badge?: string | null;
  ctaLabel?: string | null;
};

export default function RepairServicesShowcase({
  services,
  eyebrow,
  title,
  subtitle,
  buttonLabel,
}: {
  services: Service[];
  eyebrow: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);

  // Trigger the stagger-in reveal the first time the rail scrolls into view.
  // The CSS keeps children at opacity 0 until the container carries `.in`;
  // prefers-reduced-motion users get everything visible immediately via the
  // reduced-motion override in globals.css, so this is purely progressive.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fallback when the browser lacks IntersectionObserver
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Featured repairs first (admin's picks), then the rest in admin order.
  // Only services that actually have a photo belong in a photo rail.
  const items = useMemo(() => {
    const withImage = services.filter((s) => s.image);
    return [...withImage.filter((s) => s.featured), ...withImage.filter((s) => !s.featured)].slice(0, 12);
  }, [services]);

  const onScroll = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 0);
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft < max - 8);
  }, []);

  useEffect(() => {
    onScroll();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onScroll, items.length]);

  const nudge = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: reduced ? "auto" : "smooth" });
  };

  if (items.length === 0) return null;
  const [spotlight, ...rest] = items;

  return (
    <section className="shell band-tight" aria-labelledby="repair-showcase-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-700 dark:text-blue-300">{eyebrow}</p>
          <h2 id="repair-showcase-title" className="font-display mt-2 text-[26px] font-extrabold leading-[1.1] tracking-[-0.025em] [text-wrap:balance] sm:text-[34px]">
            {title}
          </h2>
          <p className="mt-2 max-w-[54ch] text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/services"
            className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-5 py-2.5 text-[13px] font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 sm:inline-flex dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {buttonLabel} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => nudge(-1)}
            disabled={!canLeft}
            aria-label="Scroll repairs left"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            disabled={!canRight}
            aria-label="Scroll repairs right"
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>

      <Reveal variant="none">
        <div
          ref={railRef}
          onScroll={onScroll}
          className={`no-scrollbar stagger-in ${inView ? "in" : ""} mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scroll-padding-inline:4px]`}
        >
          {/* Spotlight tile — the admin's first featured repair on a big stage. */}
          <Link
            href="/services"
            className="group relative h-[340px] w-[min(86vw,540px)] shrink-0 snap-start overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-900/10 sm:h-[380px]"
          >
            <AutoImage
              src={spotlight.image as string}
              alt={spotlight.imageAlt || spotlight.name}
              sizes="(max-width: 640px) 86vw, 540px"
              className={`object-cover ${reduced ? "" : "transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"}`}
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5" />
            {spotlight.badge ? (
              <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-900">
                {spotlight.badge}
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
              {spotlight.category ? (
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-sky-300">{spotlight.category}</p>
              ) : null}
              <h3 className="font-display mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{spotlight.name}</h3>
              <p className="clamp-2 mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-slate-200">{spotlight.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-sm font-black text-emerald-300">{spotlight.startPrice}</span>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-300">
                  <Clock aria-hidden className="h-3 w-3" /> {spotlight.turnaround}
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-black text-slate-900 transition group-hover:bg-sky-400">
                  {spotlight.ctaLabel || "Book this repair"} <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </Link>

          {/* The rest alternate between overlay tiles and stacked photo cards. */}
          {rest.map((s, i) =>
            i % 3 === 1 ? (
              <Link
                key={s.id}
                href="/services"
                className="group relative h-[340px] w-[240px] shrink-0 snap-start overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-slate-900/10 sm:h-[380px] sm:w-[270px]"
              >
                <AutoImage
                  src={s.image as string}
                  alt={s.imageAlt || s.name}
                  sizes="270px"
                  className={`object-cover ${reduced ? "" : "transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]"}`}
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  {s.category ? (
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">{s.category}</p>
                  ) : null}
                  <h3 className="mt-1 text-[15px] font-extrabold leading-snug text-white">{s.name}</h3>
                  <p className="mt-1 text-[13px] font-black text-emerald-300">{s.startPrice}</p>
                </div>
              </Link>
            ) : (
              <Link
                key={s.id}
                href="/services"
                className={`group flex h-[340px] w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white ring-1 ring-transparent transition-all duration-300 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/[0.08] sm:h-[380px] sm:w-[270px] dark:border-slate-800 dark:bg-slate-900 ${
                  reduced ? "" : "hover:-translate-y-1"
                }`}
              >
                <div className="relative h-[62%] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <AutoImage
                    src={s.image as string}
                    alt={s.imageAlt || s.name}
                    sizes="270px"
                    className={`object-cover ${reduced ? "" : "transition-transform duration-[1200ms] ease-out group-hover:scale-[1.08]"}`}
                  />
                  {s.badge ? (
                    <span className="absolute left-3 top-3 rounded-full bg-slate-900/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                      {s.badge}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  {s.category ? (
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">{s.category}</p>
                  ) : null}
                  <h3 className="mt-1 text-[15px] font-extrabold leading-snug">{s.name}</h3>
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <div>
                      <p className="text-[13px] font-black text-emerald-600 dark:text-emerald-400">{s.startPrice}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Clock aria-hidden className="h-3 w-3" /> {s.turnaround}
                      </p>
                    </div>
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-white transition group-hover:bg-blue-700 dark:bg-white dark:text-slate-900 dark:group-hover:bg-blue-400">
                      <ArrowUpRight aria-hidden className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          )}

          {/* Closing CTA card so the rail ends on an action, not a cut-off. */}
          <Link
            href="/services"
            className="group grid h-[340px] w-[220px] shrink-0 snap-start place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-800 p-6 text-center text-white sm:h-[380px]"
          >
            <span>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 transition group-hover:bg-white/25">
                <ArrowRight aria-hidden className="h-5 w-5" />
              </span>
              <span className="mt-4 block text-lg font-extrabold leading-snug">{buttonLabel}</span>
              <span className="mt-1 block text-[12px] font-semibold text-blue-100">
                {services.length} repairs · book in under a minute
              </span>
            </span>
          </Link>
        </div>
      </Reveal>

      {/* Scroll progress — mirrors rail position; also a visual cue that
          the strip scrolls at all. */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-[width] duration-150"
          style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }}
        />
      </div>

      <Link
        href="/services"
        className="mt-2.5 inline-flex min-h-6 items-center gap-1.5 py-1.5 text-[13px] font-bold text-blue-700 hover:underline sm:hidden dark:text-blue-300"
      >
        {buttonLabel} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
