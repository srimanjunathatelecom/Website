"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";

export type CinematicHeroSlide = {
  id: number;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  image?: string | null;
  mobileImage?: string | null;
  videoUrl?: string | null;
  link: string;
  ctaLabel?: string | null;
  contentPosition?: string | null; // left | center | right
  overlayStrength?: string | null; // soft | medium | strong
  mobileVideo?: boolean | null;
  transition?: string | null; // fade | slide | scale | fade-slide
  autoplayMs?: number | null;
};

const POSITION_CLASS: Record<string, string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

// Scrim strength. Every option keeps a strong floor at the copy edge and
// lightens away from it, so footage stays visible while the headline
// always clears contrast.
const OVERLAY_CLASS: Record<string, string> = {
  soft: "from-black/65 via-black/25 to-black/5",
  medium: "from-black/80 via-black/45 to-black/15",
  strong: "from-black/90 via-black/65 to-black/30",
};

const TRANSITION_STATE: Record<string, (active: boolean) => string> = {
  fade: (a) => (a ? "opacity-100" : "opacity-0"),
  slide: (a) => (a ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"),
  scale: (a) => (a ? "opacity-100 scale-100" : "opacity-0 scale-[1.06]"),
  "fade-slide": (a) => (a ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"),
};

/**
 * Full-bleed cinematic hero driven entirely by Admin > Promo Banners
 * (slot `hero_video`). Renders nothing at all when no banner is assigned
 * to that slot — video is never forced, and the existing hero carousel
 * below stays the storefront's front door until a shopkeeper opts in.
 *
 * Performance rules baked in:
 *  - the <video> element only mounts once the hero is actually in view;
 *  - it pauses whenever it scrolls out of view or the tab is hidden;
 *  - phones get the still image unless the banner explicitly opts into
 *    mobile video, so no one pays for a background film on mobile data;
 *  - prefers-reduced-motion users get the still image and no autoplay.
 */
function HeroMedia({
  slide,
  active,
  allowVideo,
}: {
  slide: CinematicHeroSlide;
  active: boolean;
  allowVideo: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const showVideo = allowVideo && active && Boolean(slide.videoUrl) && !videoFailed;
  const poster = slide.image || slide.mobileImage || undefined;

  // Pause an inactive slide's video rather than leaving several decoding
  // in parallel behind the visible one.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) el.play().catch(() => {});
    else el.pause();
  }, [active]);

  if (showVideo) {
    return (
      <>
        <video
          ref={videoRef}
          src={slide.videoUrl as string}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* Poster stays underneath as the first paint, so there is never a
            black flash while the first video frame decodes. */}
        <span aria-hidden className="absolute inset-0 -z-10 bg-slate-950" />
      </>
    );
  }

  if (!poster || imgFailed) {
    return (
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-900 to-indigo-800"
      />
    );
  }

  return (
    <picture>
      {slide.mobileImage && <source media="(max-width: 640px)" srcSet={slide.mobileImage} />}
      <img
        src={poster}
        alt={slide.title}
        onError={() => setImgFailed(true)}
        fetchPriority={active ? "high" : "low"}
        className={`absolute inset-0 h-full w-full object-cover object-center ${active ? "hero-cine-zoom" : ""}`}
      />
    </picture>
  );
}

export default function CinematicHero({ slides }: { slides: CinematicHeroSlide[] }) {
  const items = slides.filter((s) => s.videoUrl || s.image || s.mobileImage);
  const [i, setI] = useState(0);
  const [inView, setInView] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Shared with the hero carousel and the video banner so all three read the
  // preference the same hydration-safe way.
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Read once on mount and then kept in sync, so a rotated tablet is
  // respected without polling.
  useEffect(() => {
    const mqMobile = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsMobile(mqMobile.matches);
    sync();
    mqMobile.addEventListener("change", sync);
    return () => mqMobile.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setInView(Boolean(entries[0]?.isIntersecting)), {
      rootMargin: "100px",
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const goTo = useCallback(
    (idx: number) => setI(((idx % items.length) + items.length) % items.length),
    [items.length]
  );

  const current = items[i];
  const intervalMs = current?.autoplayMs || 7000;

  useEffect(() => {
    if (items.length <= 1 || !inView || reducedMotion) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, inView, reducedMotion, intervalMs]);

  if (items.length === 0 || !current) return null;

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 45) goTo(delta < 0 ? i + 1 : i - 1);
    touchStartX.current = null;
  }

  const position = POSITION_CLASS[current.contentPosition || "left"] || POSITION_CLASS.left;
  const overlay = OVERLAY_CLASS[current.overlayStrength || "medium"] || OVERLAY_CLASS.medium;

  return (
    <section
      ref={rootRef}
      className="hero-cine relative isolate w-full overflow-hidden bg-slate-950"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-label="Featured"
    >
      <div className="relative h-[76vh] min-h-[440px] w-full sm:h-[70vh] sm:min-h-[520px] sm:max-h-[720px]">
        {items.map((s, idx) => {
          const state = (TRANSITION_STATE[s.transition || "fade"] || TRANSITION_STATE.fade)(idx === i);
          // Video is allowed when: this slide has one, the hero is on
          // screen, motion is not reduced, and we are either on a larger
          // screen or the banner explicitly opted into mobile playback.
          const allowVideo = inView && !reducedMotion && (!isMobile || s.mobileVideo === true);
          return (
            <div
              key={s.id}
              aria-hidden={idx !== i}
              className={`absolute inset-0 transition-all duration-[900ms] ease-out motion-reduce:transition-none ${state}`}
            >
              <HeroMedia slide={s} active={idx === i} allowVideo={allowVideo} />
            </div>
          );
        })}

        {/* Readability scrim: vertical on mobile (copy sits low), angled on
            desktop so it reads as lighting rather than a grey sheet. */}
        <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-tr ${overlay}`} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950/80 to-transparent" />

        {/* Content. Keyed on the slide index so the entrance animation
            replays for each slide instead of only the first. */}
        <div className="absolute inset-0 flex items-end pb-16 sm:items-center sm:pb-0">
          <div className="shell w-full">
            <div key={current.id} className={`hero-cine-copy flex max-w-2xl flex-col gap-3 sm:gap-4 ${position} ${current.contentPosition === "center" ? "mx-auto" : current.contentPosition === "right" ? "ml-auto" : ""}`}>
              {current.badge && (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white backdrop-blur-md sm:text-[11px]">
                  <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {current.badge}
                </span>
              )}

              {/* h2, not h1: this headline belongs to a slide and is
                  replaced as the hero advances. The page's stable h1 lives
                  in app/page.tsx. Styling is entirely class-driven, so the
                  tag change is invisible. */}
              <h2 className="font-display text-[30px] font-black leading-[1.03] tracking-[-0.035em] text-white [text-wrap:balance] drop-shadow-[0_4px_28px_rgba(0,0,0,0.55)] sm:text-[52px] lg:text-[64px]">
                {current.title}
              </h2>

              {current.subtitle && (
                <p className="max-w-[46ch] text-[14px] leading-relaxed text-white/85 drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] sm:text-[17px]">
                  {current.subtitle}
                </p>
              )}

              {current.ctaLabel && (
                <Link
                  href={current.link}
                  className="shine-on-hover mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-black tracking-wide text-slate-900 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03] sm:px-8 sm:py-3.5 sm:text-[14px]"
                >
                  {current.ctaLabel} <span className="nudge-x">→</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {items.length > 1 && (
          <div className="absolute inset-x-0 bottom-5 z-20">
            <div className="shell flex items-center gap-2.5">
              {items.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => goTo(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  aria-current={idx === i}
                  className="hero-cine-bar"
                  data-active={idx === i}
                />
              ))}
              <span className="ml-1 text-[11px] font-bold tabular-nums text-white/55">
                {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
