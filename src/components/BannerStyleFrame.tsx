"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SafeImage from "./SafeImage";

// ---------------------------------------------------------------------
// Premium banner design system.
//
// This is the shared "layered composition" renderer requested by the
// banner-upgrade spec: Background + gradient + product image + badge +
// heading + subtitle + price + CTA + decorative glow, combined
// predictably as  Style + Content Layers + Animation.
//
// It does NOT replace SplitHeroBanner / ProductLedBanner — it is the
// new rendering core those two components delegate to once a banner
// carries a `style` other than "minimal" (existing rows default to
// "minimal", which intentionally renders the old flat layout so no
// pre-upgrade banner changes appearance without an admin opting in).
// ---------------------------------------------------------------------

export type BannerStyle =
  | "minimal"
  | "premium-product"
  | "dark-tech"
  | "light-retail"
  | "sale"
  | "editorial"
  | "glass"
  | "gradient";

export type TextAnimation = "fade" | "fade-up" | "slide" | "stagger" | "pop" | "none";
export type ProductAnimation = "none" | "float" | "glow" | "tilt" | "scale";

export type BannerFrameData = {
  id: number | string;
  link: string;
  badge?: string | null;
  title: string;
  subtitle?: string | null;
  ctaLabel?: string | null;
  image?: string | null; // product / hero art
  imageSide?: string | null; // left | right
  style?: string | null;
  textAnimation?: string | null;
  productAnimation?: string | null;
  // Optional live pricing — only shown when present (product-linked banners)
  price?: string | null;
  mrp?: string | null;
  discountPercent?: number | null;
};

const TEXT_CLASS: Record<string, string> = {
  fade: "banner-text banner-text--fade",
  "fade-up": "banner-text banner-text--fade-up",
  slide: "banner-text banner-text--slide",
  stagger: "banner-text banner-text--stagger",
  pop: "banner-text banner-text--pop",
  none: "banner-text banner-text--fade",
};

const PRODUCT_CLASS: Record<string, string> = {
  none: "",
  float: "banner-product--float",
  glow: "",
  tilt: "banner-product--tilt",
  scale: "banner-product--scale",
};

// Style presets: each returns the surface (background/border/shadow) and
// text-tone classes so the same content layers read correctly against a
// dark or light backdrop, without every banner re-specifying colors.
const STYLE_SURFACE: Record<BannerStyle, { surface: string; heading: string; body: string; badge: string; ctaPrimary: string }> = {
  minimal: {
    surface: "bg-slate-900",
    heading: "text-white",
    body: "text-slate-300",
    badge: "bg-white/10 text-white/90 ring-1 ring-white/20",
    ctaPrimary: "bg-white text-slate-900 hover:bg-slate-100",
  },
  "premium-product": {
    surface: "bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800",
    heading: "text-white",
    body: "text-blue-100",
    badge: "bg-amber-400 text-amber-950",
    ctaPrimary: "bg-white text-blue-800 hover:bg-blue-50",
  },
  "dark-tech": {
    surface: "bg-[#0a0b10]",
    heading: "text-white",
    body: "text-slate-400",
    badge: "bg-white/[0.06] text-blue-300 ring-1 ring-white/10",
    ctaPrimary: "bg-blue-600 text-white hover:bg-blue-500",
  },
  "light-retail": {
    surface: "bg-slate-50",
    heading: "text-slate-900",
    body: "text-slate-600",
    badge: "bg-blue-100 text-blue-800",
    ctaPrimary: "bg-slate-900 text-white hover:bg-blue-700",
  },
  sale: {
    surface: "bg-gradient-to-br from-rose-600 via-rose-600 to-orange-600",
    heading: "text-white",
    body: "text-rose-50",
    badge: "bg-white text-rose-700",
    ctaPrimary: "bg-white text-rose-700 hover:bg-rose-50",
  },
  editorial: {
    surface: "bg-white",
    heading: "text-slate-900",
    body: "text-slate-500",
    badge: "bg-transparent text-blue-700 ring-1 ring-blue-200",
    ctaPrimary: "bg-slate-900 text-white hover:bg-slate-800",
  },
  glass: {
    surface: "bg-slate-900/60 backdrop-blur-xl",
    heading: "text-white",
    body: "text-white/70",
    badge: "bg-white/15 text-white ring-1 ring-white/25",
    ctaPrimary: "bg-white text-slate-900 hover:bg-white/90",
  },
  gradient: {
    surface: "bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500",
    heading: "text-white",
    body: "text-indigo-100",
    badge: "bg-white/15 text-white ring-1 ring-white/25",
    ctaPrimary: "bg-white text-indigo-700 hover:bg-indigo-50",
  },
};

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

// The layered text stack: badge -> heading -> subtitle -> price -> CTA.
// Only renders layers that actually have content, per spec section 5
// ("do not require every banner to use every layer").
function TextStack({
  data,
  tone,
  inView,
}: {
  data: BannerFrameData;
  tone: (typeof STYLE_SURFACE)[BannerStyle];
  inView: boolean;
}) {
  const textAnim = data.textAnimation || "fade-up";
  const cls = TEXT_CLASS[textAnim] || TEXT_CLASS["fade-up"];

  return (
    <div className={`${cls} ${inView ? "in" : ""} flex flex-col items-start gap-3`}>
      {data.badge && (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${tone.badge}`}>
          {data.badge}
        </span>
      )}
      <h2 className={`text-2xl font-black leading-[1.05] tracking-tight sm:text-4xl ${tone.heading}`}>{data.title}</h2>
      {data.subtitle && <p className={`max-w-sm text-sm sm:text-base ${tone.body}`}>{data.subtitle}</p>}
      {(data.price || data.mrp) && (
        <div className="flex items-baseline gap-2">
          {data.price && <span className={`text-3xl font-black ${tone.heading}`}>{data.price}</span>}
          {data.mrp && <span className={`text-sm font-medium line-through ${tone.body}`}>{data.mrp}</span>}
          {!!data.discountPercent && data.discountPercent > 0 && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-white">{data.discountPercent}% OFF</span>
          )}
        </div>
      )}
      {data.ctaLabel !== "" && (
        <span
          className={`mt-1 inline-flex w-fit items-center gap-2 rounded-full px-6 py-3 text-sm font-black shadow-lg transition group-hover:gap-3 ${tone.ctaPrimary}`}
        >
          {data.ctaLabel || "Shop Now"} <span className="nudge-x">→</span>
        </span>
      )}
    </div>
  );
}

// The product/art side: image with the configured product-side treatment
// (float / glow / tilt / scale), settling into place on entrance.
function ProductStack({ data, inView }: { data: BannerFrameData; inView: boolean }) {
  const productAnim = data.productAnimation || "none";
  const wrapperCls = PRODUCT_CLASS[productAnim] || "";

  return (
    <div className="relative flex h-full items-center justify-center p-6 sm:p-10">
      {productAnim === "glow" && <span className="banner-product-glow" aria-hidden="true" />}
      <div className={`banner-product-enter ${inView ? "in" : ""} relative h-full w-full max-w-[360px] ${wrapperCls}`}>
        <SafeImage src={data.image} alt={data.title} className="object-contain drop-shadow-2xl" />
      </div>
    </div>
  );
}

// Public entry point: pick the composition (split-with-art vs. text-only
// full-bleed) based on whether an image is present, and render the
// chosen style's surface underneath the shared layer stack.
export default function BannerStyleFrame({ data }: { data: BannerFrameData }) {
  const { ref, inView } = useInView<HTMLAnchorElement>();
  const styleKey = (data.style as BannerStyle) || "minimal";
  const tone = STYLE_SURFACE[styleKey] || STYLE_SURFACE.minimal;
  const imageRight = (data.imageSide ?? "right") !== "left";
  const hasImage = !!data.image;

  return (
    <section className="shell band-tight">
      <Link
        ref={ref}
        href={data.link}
        className={`group relative grid grid-cols-1 overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-2xl ${tone.surface} ${
          hasImage ? "sm:grid-cols-2" : ""
        } ${hasImage && !imageRight ? "sm:[direction:rtl]" : ""}`}
      >
        {/* Decorative ambient glow for dark styles — purely cosmetic,
            sits behind everything, never intercepts clicks. */}
        {(styleKey === "dark-tech" || styleKey === "premium-product") && (
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-blue-500/20 blur-[90px]" aria-hidden="true" />
        )}

        <div
          className={`relative flex flex-col justify-center gap-4 p-8 sm:p-12 ${hasImage && !imageRight ? "sm:[direction:ltr]" : ""}`}
        >
          <TextStack data={data} tone={tone} inView={inView} />
        </div>

        {hasImage && (
          <div className={`relative min-h-[220px] sm:min-h-[340px] ${!imageRight ? "sm:[direction:ltr]" : ""}`}>
            <ProductStack data={data} inView={inView} />
          </div>
        )}
      </Link>
    </section>
  );
}
