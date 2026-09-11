"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

export type ShelfRailHandle = {
  scrollByPage: (direction: -1 | 1) => void;
  atStart: boolean;
  atEnd: boolean;
};

/**
 * One horizontal scroller used by every product shelf, brand strip and
 * category strip on the homepage.
 *
 * Why this exists: each shelf previously implemented its own
 * `overflow-x-auto` div and its own pair of arrow buttons. That produced
 * three problems the redesign fixes here, once:
 *
 *  1. The overflowing card was sliced in half against a hard vertical
 *     edge, which read as a broken layout rather than as "scroll for
 *     more". A CSS mask now fades the overflow out (`.rail-fade`), and
 *     the fade is dropped on whichever side has nothing left to reveal.
 *  2. Arrows were always enabled, so clicking at either extreme did
 *     nothing. They are now disabled at the ends.
 *  3. Arrow styling drifted per shelf (amber / blue / emerald / white).
 *     They all use `.rail-btn` now.
 *
 * Scroll distance is derived from the measured width of the first child
 * rather than a hardcoded pixel value, so one click advances a whole
 * card at every breakpoint.
 */
export default function ShelfRail({
  children,
  ref,
  className = "",
  gapClass = "gap-3 sm:gap-4",
  padClass = "px-1 pb-2 pt-1",
  onEdgeChange,
}: {
  children: ReactNode;
  ref?: Ref<ShelfRailHandle>;
  className?: string;
  gapClass?: string;
  padClass?: string;
  onEdgeChange?: (state: { atStart: boolean; atEnd: boolean }) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // onEdgeChange is held in a ref rather than in measure's dependency
  // array so that `measure` has a stable identity for the lifetime of the
  // component. Without this, the mount effect below re-subscribes its
  // ResizeObserver on every render.
  const onEdgeChangeRef = useRef(onEdgeChange);
  // Synced in an effect rather than assigned during render: writing to a ref
  // mid-render is what React's `react-hooks/refs` rule flags, and it is only
  // ever read from scroll handlers and the ResizeObserver callback, which all
  // run after commit. So an effect is both legal and equivalent here.
  useEffect(() => {
    onEdgeChangeRef.current = onEdgeChange;
  }, [onEdgeChange]);

  // Last values pushed to the parent. Edge state is reported as an object,
  // so emitting on every scroll frame would hand the parent a fresh
  // identity each time; if the parent stores it in state that re-renders
  // this component, which re-runs measure, which emits again — an infinite
  // update loop ("Maximum update depth exceeded"). Emitting only on a real
  // transition breaks the cycle.
  const lastEdge = useRef({ atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    // 2px tolerance absorbs sub-pixel rounding at fractional zoom levels,
    // which otherwise leaves the "next" arrow permanently enabled.
    const nextAtStart = el.scrollLeft <= 2;
    const nextAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setAtStart(nextAtStart);
    setAtEnd(nextAtEnd);
    if (
      nextAtStart !== lastEdge.current.atStart ||
      nextAtEnd !== lastEdge.current.atEnd
    ) {
      lastEdge.current = { atStart: nextAtStart, atEnd: nextAtEnd };
      onEdgeChangeRef.current?.({ atStart: nextAtStart, atEnd: nextAtEnd });
    }
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    measure();
    // ResizeObserver covers both viewport resizes and late-arriving
    // content (brands are fetched client-side, product images change the
    // card height), either of which changes scrollWidth after mount.
    // MutationObserver covers children being added or removed, which does
    // not necessarily resize the rail itself. Watching the DOM instead of
    // putting `children` in the dependency array matters: `children` is a
    // new element object on every parent render, so it would tear down and
    // rebuild both observers constantly.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      ro.disconnect();
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
      measure();
    });
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + 16 : el.clientWidth * 0.8;
    // Advance by whole cards, but never further than one viewport.
    const perPage = Math.max(1, Math.floor((el.clientWidth * 0.9) / step));
    el.scrollBy({ left: direction * step * perPage, behavior: "smooth" });
  }, []);

  useImperativeHandle(ref, () => ({ scrollByPage, atStart, atEnd }), [scrollByPage, atStart, atEnd]);

  return (
    <div
      ref={railRef}
      onScroll={measure}
      className={`rail rail-fade ${gapClass} ${padClass} ${className}`}
      data-at-start={atStart}
      data-at-end={atEnd}
    >
      {children}
    </div>
  );
}

/**
 * Prev/next pair for a ShelfRail. Kept separate from the rail itself so
 * the buttons can live in a section header while the rail sits below it.
 */
export function RailButtons({
  onPrev,
  onNext,
  atStart,
  atEnd,
  tone = "light",
  label = "items",
}: {
  onPrev: () => void;
  onNext: () => void;
  atStart: boolean;
  atEnd: boolean;
  tone?: "light" | "ink";
  label?: string;
}) {
  // A rail that fits entirely on screen has nothing to page through, so
  // showing two dead buttons is just noise. Hide them instead.
  if (atStart && atEnd) return null;
  const toneClass = tone === "ink" ? "rail-btn rail-btn-ink" : "rail-btn";
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={atStart}
        aria-label={`Previous ${label}`}
        className={toneClass}
      >
        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={atEnd}
        aria-label={`Next ${label}`}
        className={toneClass}
      >
        <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}

/**
 * One card-width scale shared by every product shelf. Keeping this in a
 * single constant is what makes DealShelf, BestSellerShelf and ScrollShelf
 * line up on the same grid — previously each declared its own slightly
 * different percentages (18% vs 17% vs 23%), so cards in adjacent
 * sections were visibly different sizes.
 *
 * The trailing partial card is intentional: combined with `.rail-fade` it
 * is the affordance that tells the shopper the row scrolls.
 */
export const SHELF_ITEM = "w-[47%] shrink-0 sm:w-[31.5%] md:w-[24%] lg:w-[18.8%]";
