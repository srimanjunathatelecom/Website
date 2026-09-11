"use client";

import { useCallback, useRef } from "react";

/**
 * Pointer-tracking 3D tilt + sheen for cards. Progressive enhancement:
 * attach the returned handlers and the `tilt-scope` / `tilt-sheen`
 * classes; without JS (or with reduced motion, handled in CSS) the card
 * simply doesn't tilt.
 *
 * Writes CSS custom properties directly on the element — no React state,
 * no re-render per mousemove — and clamps the angle so cards feel like
 * physical objects rather than a gimmick.
 */
export function useTilt(maxDeg = 5) {
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return; // touch scrolling must never tilt
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        el.style.setProperty("--tilt-x", `${((0.5 - py) * maxDeg * 2).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${((px - 0.5) * maxDeg * 2).toFixed(2)}deg`);
        el.style.setProperty("--sheen-x", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--sheen-y", `${(py * 100).toFixed(1)}%`);
        el.style.setProperty("--sheen-o", "1");
      });
    },
    [maxDeg]
  );

  const onPointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
    el.style.setProperty("--sheen-o", "0");
  }, []);

  return { onPointerMove, onPointerLeave };
}
