"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SafeImage from "./SafeImage";
import { useReducedMotion } from "@/lib/useReducedMotion";

export type VideoBannerData = {
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null; // poster / fallback frame
  videoUrl?: string | null;
  link: string;
  ctaLabel?: string | null;
};

// Muted autoplay video, `image` doubles as poster and as the fallback
// shown to prefers-reduced-motion users (who never get the <video> at
// all) and to anyone whose video fails to load. Only mounts the video
// once the section scrolls near-into view, so it never competes with
// above-the-fold load priority.
export default function VideoBanner({ banner }: { banner: VideoBannerData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  // Shared hook rather than a matchMedia call in a useState initializer: the
  // initializer version disagreed with the server on the first client render
  // for reduced-motion visitors, and it read the preference once and never
  // noticed it changing.
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!banner.videoUrl && !banner.image) return null;

  const showVideo = banner.videoUrl && shouldLoad && !reducedMotion && !failed;

  return (
    <section ref={ref} className="shell band-tight">
      <Link href={banner.link} className="group relative block h-64 overflow-hidden rounded-3xl bg-slate-900 shadow-xl sm:h-96">
        {showVideo ? (
          <video
            src={banner.videoUrl!}
            poster={banner.image || undefined}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <SafeImage src={banner.image} alt={banner.title} className="object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">{banner.title}</h2>
          {banner.subtitle && <p className="mt-1 max-w-md text-sm text-white/85">{banner.subtitle}</p>}
          <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-black text-slate-900 shadow-lg transition group-hover:gap-3">
            {banner.ctaLabel || "Shop Now"} <span className="nudge-x">→</span>
          </span>
        </div>
      </Link>
    </section>
  );
}
