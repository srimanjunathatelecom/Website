"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { renderProductDark } from "@/lib/productRender";
import type { HomeShowcaseConfig } from "@/lib/homepageShowcase";

/**
 * Scroll-driven cinematic showcase. The section is ~3 viewports tall; the
 * scene pins while the visitor scrolls, the device art breathes with the
 * scroll and the copy advances through admin-authored "chapters".
 *
 * Deliberately dependency-free: progress comes from one rAF-throttled
 * scroll handler writing CSS custom properties, and every visual move is a
 * GPU transform/opacity, so it stays smooth on mid-range phones.
 *
 * Honesty rules:
 *  - prefers-reduced-motion (and short viewports) get a static, fully
 *    readable stacked layout — nothing pins, nothing animates;
 *  - all copy, the image, link and chapters come from Admin > Homepage CMS.
 */
export default function TechShowcase({ config }: { config: HomeShowcaseConfig }) {
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const chapters = config.chapters;
  const count = chapters.length;
  const deviceSrc =
    config.image && !imgFailed
      ? config.image
      : renderProductDark("phone", "sky");

  useEffect(() => {
    if (reduced) return;
    const wrap = wrapRef.current;
    const scene = sceneRef.current;
    if (!wrap || !scene) return;

    let raf = 0;
    // Last value written to --sp. Writing a custom property invalidates style
    // for every descendant that reads it, and seven rules here do, so a write
    // that changes nothing is a full subtree style recalculation for free.
    // Tracing a homepage scroll showed 203 recalculations totalling 844ms,
    // largely from this: once the section is above or below the viewport the
    // progress clamps to 0 or 1 and then gets rewritten on every single frame
    // of the remaining page scroll, with no visual difference whatsoever.
    let lastWritten = -1;

    const update = () => {
      raf = 0;
      const rect = wrap.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      const p = Math.min(1, Math.max(0, -rect.top / total));
      // 4dp is the precision actually rendered; comparing at the same
      // precision is what makes the redundant-write check exact.
      const rounded = Math.round(p * 1e4) / 1e4;
      if (rounded !== lastWritten) {
        lastWritten = rounded;
        scene.style.setProperty("--sp", rounded.toFixed(4));
      }
      // Chapter buckets: equal slices of the pinned scroll.
      const idx = Math.min(count - 1, Math.floor(p * count));
      setChapter((prev) => (prev === idx ? prev : idx));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    // Only listen while the section is anywhere near the viewport. Previously
    // this ran a getBoundingClientRect and a custom-property write on every
    // frame of the whole 5400px page, including the majority of it where this
    // section is nowhere on screen. The observer margin keeps a viewport of
    // slack on each side so the parallax is already correct by the time the
    // section is visible, rather than snapping into place on the first frame.
    let listening = false;
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        update();
      } else {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      }
    };

    const io = new IntersectionObserver(
      (entries) => listen(entries.some((e) => e.isIntersecting)),
      { rootMargin: "100% 0px 100% 0px" }
    );
    io.observe(wrap);

    return () => {
      io.disconnect();
      listen(false);
    };
  }, [reduced, count]);

  if (!count) return null;

  /* ------------------------------------------------------------------ */
  /* Reduced motion / no-JS-friendly static layout                       */
  /* ------------------------------------------------------------------ */
  if (reduced) {
    return (
      <section className="tsx-shell" aria-label={config.title}>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-16 sm:px-6">
          <p className="tsx-eyebrow">{config.eyebrow}</p>
          <h2 className="tsx-title">{config.title}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {chapters.map((c, i) => (
              <div key={i} className="tsx-static-card">
                {c.kicker && <p className="tsx-kicker">{c.kicker}</p>}
                <h3 className="text-[20px] font-extrabold tracking-tight text-white">{c.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-300">{c.body}</p>
                {c.stat && (
                  <p className="mt-4 text-[26px] font-black text-sky-300">
                    {c.stat} <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{c.statLabel}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
          {config.ctaLabel && (
            <Link href={config.link || "/products"} className="tsx-cta mt-10">
              {config.ctaLabel} →
            </Link>
          )}
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Scroll-pinned cinematic layout                                      */
  /* ------------------------------------------------------------------ */
  return (
    <section ref={wrapRef} className="tsx-wrap" aria-label={config.title}>
      <div ref={sceneRef} className="tsx-scene">
        {/* Ambient background: hue-shifting glow + faint grid, all GPU. */}
        <div className="tsx-glow" aria-hidden />
        <div className="tsx-grid-lines" aria-hidden />

        <div className="relative mx-auto grid h-full w-full max-w-[1280px] grid-cols-1 items-center gap-6 px-5 sm:px-8 md:grid-cols-[1.05fr_1fr] md:gap-10">
          {/* Device art — pinned, breathing with scroll. */}
          <div className="tsx-device-col" aria-hidden>
            <div className="tsx-device">
              {/* eslint-disable-next-line @next/next/no-img-element -- default
                  artwork is an inline SVG data-URL, which next/image cannot
                  optimise; admin-supplied URLs may be any remote host. */}
              <img src={deviceSrc} alt="" onError={() => setImgFailed(true)} className="tsx-device-img" draggable={false} />
              <div className="tsx-device-ring" />
              <div className="tsx-device-ring tsx-device-ring--2" />
            </div>
          </div>

          {/* Copy column — chapters crossfade as scroll advances. */}
          <div className="relative">
            <p className="tsx-eyebrow">{config.eyebrow}</p>
            <h2 className="tsx-title">{config.title}</h2>
            {config.subtitle && <p className="mt-2 text-[14px] text-slate-400 sm:text-[15px]">{config.subtitle}</p>}

            <div className="relative mt-8 min-h-[240px] sm:min-h-[220px]">
              {chapters.map((c, i) => (
                <div
                  key={i}
                  className={`tsx-chapter ${i === chapter ? "tsx-chapter--on" : ""}`}
                  aria-hidden={i !== chapter}
                >
                  {c.kicker && <p className="tsx-kicker">{c.kicker}</p>}
                  <h3 className="text-[26px] font-extrabold leading-tight tracking-tight text-white sm:text-[34px]">{c.title}</h3>
                  <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-slate-300 sm:text-[16px]">{c.body}</p>
                  {c.stat && (
                    <p className="mt-5 text-[34px] font-black leading-none text-sky-300 sm:text-[42px]">
                      {c.stat}
                      <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{c.statLabel}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Chapter progress rail. */}
            <div className="mt-6 flex items-center gap-2" role="presentation">
              {chapters.map((_, i) => (
                <span key={i} className={`tsx-dot ${i === chapter ? "tsx-dot--on" : ""}`} />
              ))}
            </div>

            {config.ctaLabel && (
              <Link href={config.link || "/products"} className="tsx-cta mt-8">
                {config.ctaLabel} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
