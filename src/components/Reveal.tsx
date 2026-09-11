"use client";

import { useEffect, useRef } from "react";

// variant picks the entrance style; "fade" (translateY, the original and
// still the default) | "slide-left" | "slide-right" | "scale" | "none"
// (opacity only). Every existing <Reveal> call omits this prop and keeps
// rendering exactly as before. prefers-reduced-motion is handled once,
// globally, in globals.css for all variants.
type RevealVariant = "fade" | "slide-left" | "slide-right" | "scale" | "none";

const VARIANT_CLASS: Record<RevealVariant, string> = {
  fade: "reveal",
  "slide-left": "reveal-slide-left",
  "slide-right": "reveal-slide-right",
  scale: "reveal-scale",
  none: "reveal-none",
};

export default function Reveal({
  children,
  className = "",
  delay = 0,
  variant = "fade",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setTimeout(() => el.classList.add("in"), delay);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`${VARIANT_CLASS[variant]} ${className}`}>
      {children}
    </div>
  );
}
