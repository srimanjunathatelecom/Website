"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ServiceCard from "./ServiceCard";
import type { RepairService } from "@/lib/repair/types";

/** Auto-advance interval. Slow enough to read a card before it moves. */
const ADVANCE_MS = 3000;
/** How long a human interaction suppresses auto-advance before it resumes. */
const RESUME_MS = 6000;

/**
 * "Popular Repaired Services" — a scrolling rail above the main grid.
 *
 * It is a shortcut, not a replacement: the full grid stays below it, because a
 * rail can only ever show a handful of repairs and hiding the rest behind a
 * horizontal scroll would make the uncommon repair unfindable. Which repairs
 * appear is entirely the owner's call — it reads the `featured` flag through
 * pickPopularServices, so nothing here names an individual repair.
 *
 * Built on native overflow scrolling rather than a transform track. That decision
 * carries most of the requirements for free and correctly: touch and trackpad
 * swipe work because they are the browser's own gestures, momentum feels native
 * on iOS, and the cards stay real focusable elements in document order rather
 * than clones that a screen reader would read twice. Auto-advance is then just a
 * programmatic scroll on the same element a finger would move.
 *
 * Auto-advance stops for: hover, focus inside the rail, an in-progress touch or
 * scroll, a hidden tab, and prefers-reduced-motion (where it never starts). It
 * resumes a few seconds after the person stops interacting. A rail that keeps
 * sliding while someone is reaching for a card is how mis-taps happen, which is
 * also why nothing here moves on click.
 */
export default function PopularServicesCarousel({
  services,
  onSelect,
  selectedId,
}: {
  services: RepairService[];
  onSelect: (service: RepairService) => void;
  selectedId?: number | null;
}) {
  const railRef = useRef<HTMLUListElement>(null);
  /**
   * Pause lives in a ref, not state, because nothing renders it. As state,
   * every hover, wheel tick, touch and scroll frame re-rendered this component
   * and with it every ServiceCard in the rail — during a plain vertical page
   * scroll, since a wheel over the rail fires here too. A ref changes the
   * behaviour identically and renders nothing.
   */
  const pausedRef = useRef(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Any human input: hold auto-advance, then release it after a quiet period. */
  const holdAutoAdvance = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_MS);
  }, []);

  /**
   * Hold only for a horizontal wheel gesture. A vertical wheel over the rail is
   * someone scrolling the page past it, not someone using the rail, and
   * treating it as interaction meant every tick of an ordinary page scroll
   * cleared and re-armed a timer.
   */
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) holdAutoAdvance();
    },
    [holdAutoAdvance]
  );

  const readEdges = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    // 2px of slack: fractional layout widths mean scrollLeft rarely lands
    // exactly on the maximum, which would leave the right arrow permanently on.
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    // Only commit a change. These two booleans feed one sr-only live region, so
    // re-setting the same value was a wasted render of the whole rail per
    // scroll frame.
    setAtStart((prev) => (prev === start ? prev : start));
    setAtEnd((prev) => (prev === end ? prev : end));
  }, []);

  /** One card plus its gap, measured rather than hardcoded. */
  const step = useCallback(() => {
    const el = railRef.current;
    if (!el) return 200;
    const first = el.querySelector("li");
    const gap = parseFloat(getComputedStyle(el).columnGap || "12") || 12;
    return first ? first.getBoundingClientRect().width + gap : 200;
  }, []);

  const scrollByCards = useCallback(
    (direction: 1 | -1, smooth = true) => {
      const el = railRef.current;
      if (!el) return;
      el.scrollBy({ left: direction * step(), behavior: smooth ? "smooth" : "auto" });
    },
    [step]
  );

  function nudge(direction: 1 | -1) {
    holdAutoAdvance();
    const el = railRef.current;
    if (!el) return;
    // Arrows wrap, so the rail is a loop in both directions rather than a
    // dead end that leaves an arrow visibly doing nothing.
    if (direction === 1 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (direction === -1 && el.scrollLeft <= 2) {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    } else {
      scrollByCards(direction);
    }
  }

  useEffect(() => {
    readEdges();
    const el = railRef.current;
    if (!el) return;

    // Native passive listener, coalesced to one read per frame. As an onScroll
    // prop this ran per scroll event and each run read scrollLeft, clientWidth
    // and scrollWidth, forcing layout mid-scroll.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        readEdges();
      });
    };
    const onResize = () => onScroll();

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [readEdges]);

  // Auto-advance. Skipped entirely under prefers-reduced-motion: a rail that
  // moves on its own is exactly what that setting is asking us not to do.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      // Checked here rather than as an effect dependency, so pausing does not
      // tear down and rebuild the interval or re-render the rail.
      if (pausedRef.current) return;
      // A background tab would otherwise queue up scrolls and jump on return.
      if (document.hidden) return;
      const el = railRef.current;
      if (!el) return;
      // Nothing to advance through if everything already fits on screen.
      if (el.scrollWidth <= el.clientWidth + 2) return;

      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        scrollByCards(1);
      }
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, [scrollByCards]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    []
  );

  if (services.length === 0) return null;

  const arrow =
    "grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors duration-150 " +
    "hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 " +
    "disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <section aria-labelledby="popular-heading" className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2
          id="popular-heading"
          className="text-[15px] font-bold tracking-tight text-slate-900 sm:text-[17px] dark:text-white"
        >
          Popular Repaired Services
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Show previous popular repairs"
            className={arrow}
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Show next popular repairs"
            className={arrow}
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ul
        ref={railRef}
        // aria-hidden would be wrong (these are real, reachable controls), so the
        // rail is announced for what it is and stops moving on focus.
        aria-label="Popular repairs"
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
        onFocusCapture={holdAutoAdvance}
        onTouchStart={holdAutoAdvance}
        onWheel={onWheel}
        onKeyDown={holdAutoAdvance}
        className={
          // No `scroll-smooth` class: that would animate the rail's own native
          // scrolling. The arrow and auto-advance calls pass
          // `behavior: "smooth"` themselves, so deliberate jumps glide and a
          // finger or trackpad stays 1:1 with the content.
          // `overscroll-x-contain` stops a swipe that reaches the rail's end
          // from chaining into the page or the browser's back gesture.
          "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 " +
          // Hidden scrollbar: the arrows and the partly-visible next card already
          // signal that the rail scrolls, and a scrollbar under these cards
          // reads as a rendering artefact. Scrolling itself is untouched.
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        }
      >
        {services.map((service) => (
          <li
            key={service.id}
            className="w-[136px] shrink-0 snap-start sm:w-[150px] lg:w-[160px]"
          >
            <ServiceCard
              service={service}
              onSelect={onSelect}
              selected={selectedId === service.id}
              compact
            />
          </li>
        ))}
      </ul>

      {/* Edge state is exposed for assistive tech without disabling the arrows,
          which still wrap. */}
      <span className="sr-only" aria-live="polite">
        {atStart ? "Start of popular repairs." : atEnd ? "End of popular repairs." : ""}
      </span>
    </section>
  );
}
