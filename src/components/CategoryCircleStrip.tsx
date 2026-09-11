"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import SectionHead from "./SectionHead";
import ShelfRail, { RailButtons, type ShelfRailHandle } from "./ShelfRail";

type Cat = { id?: number | string; name: string; slug: string; image?: string | null };

// Fallback images by slug - used when an admin-added category has no image yet
const SLUG_IMAGE_MAP: Record<string, string> = {
  "mobiles": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&auto=format&fit=crop&q=80",
  "mobile-phones": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&auto=format&fit=crop&q=80",
  "smartphones": "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&auto=format&fit=crop&q=80",
  "laptops": "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=300&auto=format&fit=crop&q=80",
  "smart-watches": "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=300&auto=format&fit=crop&q=80",
  "audio-headphones": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&auto=format&fit=crop&q=80",
  "audio": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&auto=format&fit=crop&q=80",
  "mobile-accessories": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&auto=format&fit=crop&q=80",
  "accessories": "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300&auto=format&fit=crop&q=80",
  "chargers-cables": "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=300&auto=format&fit=crop&q=80",
  "cases-covers": "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=300&auto=format&fit=crop&q=80",
  "mobile-service": "https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?w=300&auto=format&fit=crop&q=80",
  "repairs": "https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?w=300&auto=format&fit=crop&q=80",
  "laptop-service": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=300&auto=format&fit=crop&q=80",
  "laptop-accessories": "https://images.unsplash.com/photo-1625723044792-44de16ccb4e9?w=300&auto=format&fit=crop&q=80",
};

// Keyword fallback - matches category name words when slug is unknown too
const NAME_KEYWORD_MAP: Array<{ keywords: string[]; image: string }> = [
  { keywords: ["phone", "mobile", "smartphone"], image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["laptop", "computer", "notebook"], image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["watch", "wearable"], image: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["audio", "headphone", "earphone", "speaker", "sound"], image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["charger", "cable", "wire", "adapter"], image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["case", "cover", "protection"], image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["repair", "service", "fix"], image: "https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?w=300&auto=format&fit=crop&q=80" },
  { keywords: ["accessory", "accessories"], image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300&auto=format&fit=crop&q=80" },
];

// Used only if the database has zero categories at all
const DEFAULT_CATEGORIES: Cat[] = [
  { name: "Smartphones", slug: "mobiles", image: SLUG_IMAGE_MAP["mobiles"] },
  { name: "Laptops", slug: "laptops", image: SLUG_IMAGE_MAP["laptops"] },
  { name: "Smart Watches", slug: "smart-watches", image: SLUG_IMAGE_MAP["smart-watches"] },
  { name: "Audio & Headphones", slug: "audio-headphones", image: SLUG_IMAGE_MAP["audio-headphones"] },
  { name: "Accessories", slug: "accessories", image: SLUG_IMAGE_MAP["accessories"] },
  { name: "Chargers & Cables", slug: "chargers-cables", image: SLUG_IMAGE_MAP["chargers-cables"] },
  { name: "Cases & Covers", slug: "cases-covers", image: SLUG_IMAGE_MAP["cases-covers"] },
  { name: "Repair & Services", slug: "mobile-service", image: SLUG_IMAGE_MAP["mobile-service"] },
];

function resolveImage(cat: Cat): string | null {
  if (cat.image && cat.image.trim() !== "") return cat.image;
  if (cat.slug && SLUG_IMAGE_MAP[cat.slug]) return SLUG_IMAGE_MAP[cat.slug];

  const nameLower = (cat.name || "").toLowerCase();
  for (const entry of NAME_KEYWORD_MAP) {
    if (entry.keywords.some((kw) => nameLower.includes(kw))) return entry.image;
  }
  return null;
}

function initialsFor(name: string) {
  return (name || "")
    .replace(/[^a-z0-9 ]/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// The circle is 84px wide, 96px from `sm` up. Anything wider than 96 CSS px
// (times the device pixel ratio) is downloaded and downscaled for nothing.
const CIRCLE_PX = 96;

/**
 * Builds a DPR srcset for hosts that resize from a `w` query parameter.
 *
 * The fallback images were hardcoded at `?w=300` and painted into an 84px
 * circle — 3.6x more pixels than the box can show, measured at 43kB across four
 * circles and paid for again in decode and downscale on every visit. These are
 * remote URLs, so `next/image` cannot touch them unless the host is in
 * NEXT_PUBLIC_IMAGE_HOSTS; asking the host itself for the right size costs
 * nothing and needs no config.
 *
 * Only the `w` value is rewritten, and only when one is already present, so an
 * admin-supplied URL from any other host is passed through untouched.
 */
function dprSrcSet(src: string): { src: string; srcSet?: string } {
  if (!/[?&]w=\d+/.test(src)) return { src };
  const at = (n: number) => src.replace(/([?&]w=)\d+/, `$1${n}`);
  return {
    src: at(CIRCLE_PX),
    srcSet: `${at(CIRCLE_PX)} 1x, ${at(CIRCLE_PX * 2)} 2x, ${at(CIRCLE_PX * 3)} 3x`,
  };
}

// Circle image with a graceful initials fallback — a broken/blocked
// image URL falls back to the category's initials instead of leaving a
// blank white circle.
function CategoryCircleImage({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;

  if (!showImg) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 text-sm font-black tracking-tight text-blue-700 dark:from-slate-700 dark:to-slate-800 dark:text-blue-300">
        {initialsFor(name) || "SMS"}
      </div>
    );
  }

  const sized = dprSrcSet(src);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sized.src}
      srcSet={sized.srcSet}
      alt={name}
      className="h-full w-full object-cover"
      loading="lazy"
      // Without this the browser may decode on the main thread, which is a
      // stall the visitor feels as the UI briefly locking up.
      decoding="async"
      // Intrinsic size so the circle holds its space before the file lands.
      width={CIRCLE_PX}
      height={CIRCLE_PX}
      onError={() => setFailed(true)}
    />
  );
}

export default function CategoryCircleStrip({ categories }: { categories?: Cat[] }) {
  const railRef = useRef<ShelfRailHandle>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  // Always prefer live DB data (kept in sync with the admin dashboard).
  // Only fall back to defaults if the database truly has no categories yet.
  const rawList = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  const uniqueCategories = Array.from(
    new Map(rawList.filter((cat) => Boolean(cat?.slug)).map((item) => [item.slug, item])).values()
  ).map((cat) => ({ ...cat, image: resolveImage(cat) }));

  return (
    <section className="border-b border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="shell band">
        <SectionHead
          eyebrow="Browse the range"
          title="Shop by category"
          subtitle="Phones, laptops, wearables, audio and everything in between — in stock at both Bengaluru outlets."
          href="/products"
          hrefLabel="All products"
          className="mb-5 sm:mb-6"
          actions={
            <RailButtons
              onPrev={() => railRef.current?.scrollByPage(-1)}
              onNext={() => railRef.current?.scrollByPage(1)}
              atStart={edge.atStart}
              atEnd={edge.atEnd}
              label="categories"
            />
          }
        />

        <ShelfRail ref={railRef} onEdgeChange={setEdge} gapClass="gap-4 sm:gap-6" padClass="pb-1 pt-1">
          {/* "All items" reuses the exact circle geometry of a real
              category rather than the old blue-outlined odd-one-out, so
              the row reads as one consistent set. */}
          <Link
            href="/products"
            className="category-rise group/item flex w-[84px] shrink-0 flex-col items-center gap-2.5 text-center sm:w-[96px]"
            style={{ ["--i" as string]: 0 }}
          >
            <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-900/15 ring-1 ring-blue-700/20 transition-all duration-200 group-hover/item:-translate-y-1 group-hover/item:shadow-lg group-hover/item:shadow-blue-900/25 sm:h-[96px] sm:w-[96px]">
              <LayoutGrid className="h-7 w-7" strokeWidth={1.9} />
            </div>
            <span className="text-[12px] font-bold leading-tight tracking-tight text-slate-800 transition-colors group-hover/item:text-blue-700 dark:text-slate-200 sm:text-[13px]">
              All items
            </span>
          </Link>

          {uniqueCategories.map((c, i) => (
            <Link
              key={c.slug}
              href={`/products?category=${c.slug}`}
              className="category-rise group/item flex w-[84px] shrink-0 flex-col items-center gap-2.5 text-center sm:w-[96px]"
              style={{ ["--i" as string]: i + 1 }}
            >
              <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full bg-slate-100 shadow-sm ring-1 ring-slate-200 transition-all duration-200 group-hover/item:-translate-y-1 group-hover/item:shadow-lg group-hover/item:shadow-slate-900/10 group-hover/item:ring-2 group-hover/item:ring-blue-500 sm:h-[96px] sm:w-[96px] dark:bg-slate-800 dark:ring-slate-700">
                <CategoryCircleImage src={c.image} name={c.name} />
                {/* Faint inner edge keeps light product shots from bleeding
                    into the white page background. */}
                <span className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-slate-900/5" />
              </div>
              <span className="line-clamp-2 text-[12px] font-bold leading-tight tracking-tight text-slate-800 transition-colors group-hover/item:text-blue-700 dark:text-slate-200 sm:text-[13px]">
                {c.name}
              </span>
            </Link>
          ))}
        </ShelfRail>
      </div>
    </section>
  );
}
