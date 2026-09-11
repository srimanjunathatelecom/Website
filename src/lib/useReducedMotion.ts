"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the visitor has asked their operating system to reduce motion.
 *
 * Always returns false for the server render and for the first client render,
 * then corrects itself immediately afterwards. That ordering matters: reading
 * matchMedia in a useState initializer instead (as the hero carousel and the
 * video banner both used to) makes the first client render disagree with the
 * server for anyone who has reduced motion switched on. Where the value feeds
 * the markup, that is a hydration mismatch, and React responds by throwing away
 * the server-rendered HTML for that subtree and rebuilding it on the client.
 * The carousel hit exactly that: it hid its progress bar on the first render,
 * which the server had already emitted.
 *
 * Because callers should not animate until this reports back, treat false as
 * "not known to prefer reduced motion" and keep the first paint static where
 * that is cheap to do.
 *
 * The preference is also kept in sync, so changing it in system settings takes
 * effect without a reload. The previous implementations read it once and never
 * looked again.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mq = window.matchMedia(QUERY);
    const sync = () => setReduced(mq.matches);

    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export default useReducedMotion;
