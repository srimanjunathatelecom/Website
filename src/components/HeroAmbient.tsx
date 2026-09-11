"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Ambient depth layer for the hero: a sparse field of drifting light
 * particles on a canvas, plus a periodic diagonal light sweep (CSS).
 *
 * Budget rules:
 *  - desktop-with-a-mouse only (`pointer: fine` + >= 768px) — phones never
 *    pay for it;
 *  - the rAF loop only runs while the hero is on screen and the tab is
 *    visible;
 *  - ~36 particles, additive blending, no shadows/blur per frame;
 *  - prefers-reduced-motion renders nothing at all.
 */
export default function HeroAmbient() {
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine) and (min-width: 768px)").matches) return;

    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; tw: number };
    let parts: P[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let t = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!parts.length) {
        parts = Array.from({ length: 36 }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.6 + Math.random() * 1.8,
          vx: -0.06 + Math.random() * 0.12,
          vy: -0.16 - Math.random() * 0.2,
          a: 0.12 + Math.random() * 0.3,
          tw: Math.random() * Math.PI * 2,
        }));
      }
    };

    const frame = () => {
      if (!running) return;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        const tw = 0.6 + 0.4 * Math.sin(t * 1.4 + p.tw);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(190, 219, 255, ${(p.a * tw).toFixed(3)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
      { threshold: 0.05 }
    );
    io.observe(host);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", resize);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div ref={hostRef} className="hero-ambient" aria-hidden>
      <canvas ref={canvasRef} />
      <div className="hero-sweep" />
    </div>
  );
}
