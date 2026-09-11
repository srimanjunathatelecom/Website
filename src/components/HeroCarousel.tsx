"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "@/lib/useReducedMotion";
import HeroAmbient from "./HeroAmbient";

type Banner = {
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  /** Optional portrait/square crop served below 640px. Falls back to `image`. */
  mobileImage?: string | null;
  /**
   * Optional looping background video (MP4/WebM). When set, the slide plays
   * it muted and continuously while active; `image` doubles as the poster and
   * as the fallback if the video fails to load or the visitor prefers
   * reduced motion. The banners table has carried this column for a while —
   * mid-page video banners used it — but the hero, the one place a moving
   * picture earns its bandwidth, never read it until now.
   */
  videoUrl?: string | null;
  link: string;
  ctaLabel?: string | null;
  badge?: string | null;
  style?: string | null;
  textAnimation?: string | null;
  transition?: string | null;
  autoplayMs?: number | null;
};

// Deterministic on-brand gradient tiles keyed by title, so a banner whose
// image URL 404s (or was never uploaded) still shows a finished-looking
// slide with its own title instead of a blank/broken box.
const FALLBACK_GRADIENTS = [
  "from-blue-700 via-blue-600 to-indigo-700",
  "from-indigo-700 via-blue-700 to-slate-900",
  "from-slate-900 via-blue-800 to-indigo-700",
];

function fallbackGradient(seed: string) {
  let hash = 0;
  for (let idx = 0; idx < seed.length; idx++) hash = (hash * 31 + seed.charCodeAt(idx)) >>> 0;
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

// Per-slide entrance/exit treatment. Admin picks this via the banner's
// `transition` field; "fade" (the original behavior) stays the default
// so existing hero banners are visually unchanged.
const TRANSITION_CLASS: Record<string, (active: boolean) => string> = {
  fade: (active) => (active ? "opacity-100" : "opacity-0"),
  slide: (active) => (active ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6"),
  scale: (active) => (active ? "opacity-100 scale-100" : "opacity-0 scale-[1.04]"),
  "fade-slide": (active) => (active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"),
};

function BannerSlide({ b, active, eager }: { b: Banner; active: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const showImg = b.image && !failed;
  // Reduced-motion visitors get the poster image — a silently looping film
  // is exactly the kind of movement they asked to switch off.
  const showVideo = Boolean(b.videoUrl) && !videoFailed && !reducedMotion;
  const hasOverlayContent = Boolean(b.badge || b.subtitle || b.ctaLabel);
  const transitionFn = TRANSITION_CLASS[b.transition || "fade"] || TRANSITION_CLASS.fade;

  // Only the active slide's video decodes; inactive slides sit paused so
  // three video banners don't mean three simultaneous decode loops.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) el.play().catch(() => {/* autoplay veto → poster stays */});
    else el.pause();
  }, [active, showVideo]);

  return (
    <div className={`absolute inset-0 transition-all duration-700 ease-out ${transitionFn(active)}`} aria-hidden={!active}>
      {showVideo ? (
        <video
          ref={videoRef}
          src={b.videoUrl as string}
          poster={b.image || undefined}
          muted
          loop
          playsInline
          autoPlay={active}
          preload={active ? "auto" : "metadata"}
          onError={() => setVideoFailed(true)}
          aria-label={b.title}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : showImg ? (
        // <picture> rather than a second <img>: the browser picks one
        // source and only downloads that, so a phone never pays for the
        // wide desktop crop. `mobileImage` was already stored and
        // validated by the banners API but had no consumer until now.
        <picture>
          {b.mobileImage && <source media="(max-width: 640px)" srcSet={b.mobileImage} />}
          <img
            src={b.image as string}
            alt={b.title}
            onError={() => setFailed(true)}
            // The first slide is the page's LCP element — tell the browser
            // to fetch it ahead of everything else instead of discovering
            // it late inside a client component. Later slides stay lazy.
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className={`absolute inset-0 h-full w-full object-cover object-center block m-0 p-0 ${active ? "banner-ken-burns" : ""}`}
          />
        </picture>
      ) : (
        // No image: a tinted panel stands in for the artwork. It only prints
        // the title when the overlay below is not going to print it too —
        // otherwise a banner saved with text but no image yet (the normal
        // state while a shopkeeper is still setting one up) showed its
        // headline twice, once greyed behind the scrim and once in the
        // overlay.
        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${fallbackGradient(b.title || "banner")} px-6 text-center`}>
          {!hasOverlayContent && (
            <span className="text-base font-black tracking-tight text-white drop-shadow sm:text-2xl md:text-3xl">
              {b.title || "Shop Now"}
            </span>
          )}
        </div>
      )}

      {/* Layered text overlay — only when the banner actually carries a
          badge/subtitle/CTA beyond the bare title, so a plain legacy
          hero banner (image + title only) keeps its original minimal
          look instead of gaining an unrequested overlay. */}
      {hasOverlayContent && (
        <>
          {/* Scrim strength is defined once in globals.css (.hero-scrim):
              bottom-up on mobile where the copy sits under the image, and
              left-to-right on desktop where it sits beside it. The old
              inline gradient was too weak in its mid-stops, so headlines
              over a light banner lost contrast halfway across. */}
          <div className="hero-scrim pointer-events-none absolute inset-0" />
          <div className="hero-copy absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[1280px] flex-col items-start gap-2 px-5 pb-14 sm:inset-y-0 sm:justify-center sm:gap-4 sm:px-10 sm:pb-10 lg:px-14">
            <div className="flex w-full flex-col items-start gap-2.5 sm:max-w-[58%] sm:gap-4">
            {b.badge && (
              <span className="inline-flex items-center rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-950 shadow-sm sm:text-[11px]">
                {b.badge}
              </span>
            )}
            {/* Balanced wrapping keeps a two-line headline from breaking
                as one long line plus a single orphaned word. */}
            {/* Words animate in on their own short stagger rather than the
                whole block fading as one flat unit. The headline is the only
                element on the page given this treatment, so it reads as the
                page's opening emphasis instead of decoration, and it is
                keyed to the slide so it replays when the slide changes.
                Each word stays a normal inline text node, so selection,
                translation and screen readers are unaffected. */}
            <h2 className="font-display max-w-[20ch] text-[30px] font-extrabold leading-[1.03] tracking-[-0.035em] text-white [text-wrap:balance] drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)] sm:text-[46px] md:text-[58px] lg:text-[68px]">
              {(() => {
                const words = (b.title || "").split(" ").filter(Boolean);
                return words.map((word, wi) => (
                  // The space is deliberately a text node *outside* the span.
                  // `display: inline-block` (needed to transform each word)
                  // trims whitespace at its own edges, so a trailing space
                  // inside the span is dropped and the headline renders as
                  // one run-together string.
                  <span key={`${wi}-${word}`}>
                    <span
                      className="hero-word"
                      style={{ animationDelay: `${Math.min(wi * 60, 420)}ms` }}
                    >
                      {word}
                    </span>
                    {wi < words.length - 1 ? " " : null}
                  </span>
                ));
              })()}
            </h2>
            {b.subtitle && (
              <p className="max-w-[46ch] text-[14px] leading-relaxed text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-[17px] md:text-[18px]">
                {b.subtitle}
              </p>
            )}
            {b.ctaLabel && (
              <span className="group/cta mt-2.5 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-bold tracking-wide text-slate-900 shadow-lg shadow-black/25 transition-transform duration-200 sm:px-7 sm:py-3.5 sm:text-[15px]">
                {b.ctaLabel} <span className="nudge-x">→</span>
              </span>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type HeroProps = {
  banners: Banner[];
  /** Real store copy from Admin > Settings, used only when no hero banner exists. */
  fallbackTitle?: string;
  fallbackSubtitle?: string;
};

/**
 * When the shopkeeper has not uploaded a hero banner yet (a brand-new install,
 * every banner deactivated, or a banner query that failed), this used to render
 * a single placeholder slide titled "Shop Now" with no image. That produced a
 * ~680px tall empty gradient with one word floating in it, so the whole first
 * screen — the most valuable space on the site — told a visitor nothing and
 * offered one unlabelled destination.
 *
 * The fallback now uses copy the shop has actually written (store settings
 * tagline) and links to the two things customers come here for. It is sized to
 * its content rather than to the viewport, so an unconfigured hero is a compact
 * band instead of a blank screen. Nothing here is invented: the headline falls
 * back to the same default string the rest of the homepage already uses.
 */
function HeroFallback({ fallbackTitle, fallbackSubtitle }: HeroProps) {
  return (
    <section className="relative w-full bg-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 py-14 text-center sm:py-20">
        <h1 className="text-2xl font-black tracking-tight text-white text-balance sm:text-4xl">
          {fallbackTitle || "Real Prices. Real Savings. Every Day."}
        </h1>
        {fallbackSubtitle && (
          <p className="max-w-xl text-sm text-white/75 text-pretty sm:text-base">{fallbackSubtitle}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/products"
            className="rounded-full bg-white px-7 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-white/90"
          >
            Shop phones &amp; laptops
          </Link>
          <Link
            href="/repair"
            className="rounded-full border border-white/35 px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            Book a repair
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HeroCarousel(props: HeroProps) {
  // Branch in a wrapper rather than returning early inside the carousel: the
  // carousel body owns several hooks, and an early return above them would be a
  // conditional hook call.
  return props.banners.length ? <HeroSlides {...props} /> : <HeroFallback {...props} />;
}

function HeroSlides({ banners }: HeroProps) {
  const items = banners;

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // Read via the shared hook so the first client render matches the server.
  // This used to be a useState initializer that called matchMedia directly,
  // which made the progress bar below disappear on the very first client
  // render for reduced-motion visitors while the server had already rendered
  // it — a hydration mismatch that made React rebuild the whole hero.
  const reducedMotion = useReducedMotion();
  const touchStartX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const intervalMs = items[i]?.autoplayMs || 5000;

  const goTo = useCallback((idx: number) => setI(((idx % items.length) + items.length) % items.length), [items.length]);
  const next = useCallback(() => goTo(i + 1), [goTo, i]);
  const prev = useCallback(() => goTo(i - 1), [goTo, i]);

  // Autoplay — pauses on hover, on a background tab, and entirely for
  // prefers-reduced-motion users (who get a static first slide plus
  // manual controls instead of an auto-rotating carousel).
  useEffect(() => {
    if (items.length <= 1 || paused || reducedMotion) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, paused, reducedMotion, intervalMs]);

  useEffect(() => {
    function onVisibility() {
      setPaused(typeof document !== "undefined" ? document.hidden : false);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) (delta < 0 ? next : prev)();
    touchStartX.current = null;
  }

  // The old hero was a full-bleed 5.6:1 strip — roughly 250px tall on a
  // 1400px screen — which left the headline, subtitle and CTA fighting
  // for a sliver of vertical space and made the banner read as an ad bar
  // rather than the front of a shop. The aspect ratios below are much
  // closer to square at every breakpoint (about 390px tall on desktop)
  // while staying wide enough that a standard ~4:1 banner the shopkeeper
  // uploads is only marginally cropped at the sides.
  return (
    <section className="relative w-full">
      <div
        ref={rootRef}
        className="group/hero relative w-full overflow-hidden bg-slate-900 outline-none h-[62vh] min-h-[400px] max-h-[560px] sm:h-[70vh] sm:max-h-[620px] lg:h-[74vh] lg:max-h-[680px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Promotional banners"
      >
        {items.map((b, idx) => (
          <Link key={b.id} href={b.link} aria-label={b.title || "View offer"} aria-hidden={idx !== i} tabIndex={idx === i ? 0 : -1} className="absolute inset-0 z-10" style={{ zIndex: idx === i ? 10 : 0, pointerEvents: idx === i ? "auto" : "none" }}>
            <BannerSlide b={b} active={idx === i} eager={idx === 0} />
          </Link>
        ))}

        {/* Depth layer above the slides, below the controls: drifting light
            particles + a periodic light sweep. Desktop-only, pauses
            off-screen, renders nothing for reduced motion. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <HeroAmbient />
        </div>

        {items.length > 1 && (
          <>
            {/* Arrows stay faintly visible at rest on pointer devices so
                it is obvious the hero is a carousel before you hover; the
                old fully-transparent buttons hid that entirely. */}
            <button
              onClick={prev}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white opacity-0 ring-1 ring-white/25 backdrop-blur-md transition-all duration-200 hover:bg-black/55 focus-visible:opacity-100 group-hover/hero:opacity-100 sm:opacity-60 md:left-5"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
            </button>
            <button
              onClick={next}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white opacity-0 ring-1 ring-white/25 backdrop-blur-md transition-all duration-200 hover:bg-black/55 focus-visible:opacity-100 group-hover/hero:opacity-100 sm:opacity-60 md:right-5"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
            </button>

            {/* Dots moved on top of the hero. They previously sat on a pale
                slate strip below it, which read as a stray empty band
                between the hero and the next section. */}
            {/* gap-0: each dot button now carries its own 24px touch target,
                so the visual spacing between pills comes from that padding
                rather than from a flex gap stacked on top of it. */}
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-0 pb-2.5 sm:justify-end sm:pr-5 md:pr-7">
              <span className="mr-1 hidden text-[11px] font-bold tabular-nums text-white/60 sm:inline">
                {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
              {items.map((b, idx) => (
                <button
                  key={b.id}
                  onClick={(e) => { e.preventDefault(); goTo(idx); }}
                  aria-label={`Go to slide ${idx + 1}`}
                  aria-current={idx === i}
                  className="hero-dot"
                  data-active={idx === i}
                />
              ))}
            </div>

            {/* Progress indicator for the active slide's autoplay interval */}
            {!paused && !reducedMotion && (
              <div className="absolute inset-x-0 top-0 z-20 h-[3px] bg-black/15">
                <div key={i} className="hero-progress-bar h-full bg-white/90" style={{ animationDuration: `${intervalMs}ms` }} />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
