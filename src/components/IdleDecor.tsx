"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Pauses decorative `infinite` CSS animations while they are off screen.
 *
 * Why this exists, measured rather than assumed: a trace of one homepage scroll
 * showed 812ms of style recalculation, and switching every animation off with
 * `animation: none !important` cut that to 323ms. So roughly 60% of the style
 * cost during a scroll was animations — and the page carries 38 elements with
 * `infinite` animations, including a brand marquee over 668,000px and a hero
 * sweep over 641,000px. Those keep ticking style and re-rasterising for the
 * entire length of a 5400px page, almost all of which they are nowhere near.
 *
 * The fix is deliberately not "delete the animations". Paused animations resume
 * from exactly where they stopped, so a marquee that scrolls back into view
 * carries on rather than jumping, and anything actually on screen animates
 * exactly as designed. Nothing visible changes; the invisible work stops.
 *
 * Rather than hardcode a list of class names that would rot the moment someone
 * adds a new decoration, the animated elements are discovered at runtime via
 * `document.getAnimations()`, which returns every running animation and its
 * target directly. The first version of this walked all ~1750 elements calling
 * getComputedStyle, and measurably made things worse: total long-task time on a
 * homepage scroll went from 1152ms to 1527ms, so the fix was paying for itself
 * with a stall. getAnimations() needs no DOM walk and no style reads.
 *
 * Only `infinite` animations are touched. One-shot entrance animations are left
 * alone: they finish on their own and pausing them offscreen would mean a
 * section that never appears to arrive.
 */
export default function IdleDecor() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;
    // Nothing to pause: reduced-motion users already have these off.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const observed = new Set<Element>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // `.style` rather than a class so this cannot fight a stylesheet, and
          // so removing the component removes every trace of it.
          (entry.target as HTMLElement).style.animationPlayState = entry.isIntersecting
            ? ""
            : "paused";
        }
      },
      // A viewport of slack: start animating slightly before it is visible so
      // nothing is caught mid-pause at the edge of the screen.
      { rootMargin: "50% 0px 50% 0px" }
    );

    const scan = () => {
      if (cancelled) return;
      if (typeof document.getAnimations !== "function") return;

      for (const anim of document.getAnimations()) {
        const effect = anim.effect;
        // Only keyframe effects have a target element to observe.
        if (!effect || !(effect instanceof KeyframeEffect)) continue;
        const target = effect.target;
        if (!(target instanceof HTMLElement)) continue;
        if (observed.has(target)) continue;
        if (effect.getComputedTiming().iterations !== Infinity) continue;
        observed.add(target);
        io.observe(target);
      }
    };

    // Wait for the page to settle: scanning mid-hydration would both measure
    // the wrong DOM and compete with work the visitor is waiting on.
    // Safari has no requestIdleCallback, so fall back to a timer.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const idle: number = hasIdle
      ? window.requestIdleCallback(scan, { timeout: 2000 })
      : window.setTimeout(scan, 800);

    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      // Hand every element back exactly as it was found.
      for (const el of observed) (el as HTMLElement).style.animationPlayState = "";
      io.disconnect();
    };
  }, [pathname]);

  return null;
}
