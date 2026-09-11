import Link from "next/link";
import { usableBannerImage } from "@/lib/bannerImage";
import { renderProductDark, type RenderKind } from "@/lib/productRender";

type Banner = { id: number; title: string; subtitle?: string | null; image?: string | null; link: string };

// Product artwork shown on fallback tiles (no admin image uploaded yet).
// Keyed by tile id so every fallback tile gets art that matches its copy —
// a laptop-gear tile never shows earbuds. Generated SVG data-URLs, so no
// network cost and no invented product photography.
const FALLBACK_ART: Record<number, [RenderKind, string]> = {
  [-1]: ["phone", "sky"],
  [-2]: ["phone-alt", "rose"],
  [-3]: ["earbuds", "violet"],
  [-4]: ["phone", "ink"],
  [-5]: ["phone-alt", "mint"],
  [-6]: ["phone", "amber"],
  [-7]: ["laptop", "sky"],
  [-8]: ["charger", "mint"],
  [-9]: ["speaker", "rose"],
  [-10]: ["phone", "violet"],
  [-11]: ["headphones", "sky"],
  [-12]: ["phone-alt", "amber"],
  [-13]: ["phone", "silver"],
  [-14]: ["cable", "sky"],
  [-15]: ["stand", "mint"],
};

// Admin-created banners without an uploaded image also get artwork, chosen
// from the banner's own copy so the art matches what the tile is selling.
const ART_PALETTES = ["sky", "violet", "mint", "rose", "amber", "ink"];
function artFromCopy(text: string, index: number): [RenderKind, string] {
  const t = text.toLowerCase();
  const palette = ART_PALETTES[index % ART_PALETTES.length];
  if (/earbud|airdope|audio|headphone|sound/.test(t)) return ["earbuds", palette];
  if (/speaker/.test(t)) return ["speaker", palette];
  if (/laptop|ssd|notebook/.test(t)) return ["laptop", palette];
  if (/charger|charging|adapter|watt/.test(t)) return ["charger", palette];
  if (/cable|cord/.test(t)) return ["cable", palette];
  if (/case|cover|protect/.test(t)) return ["case", palette];
  if (/stand|desk/.test(t)) return ["stand", palette];
  if (/accessor/.test(t)) return ["earbuds", palette];
  return [index % 2 ? "phone-alt" : "phone", palette];
}

const FALLBACK_SETS: Banner[][] = [
  [
    { id: -1, title: "New Arrivals", subtitle: "Shop the latest launches", image: null, link: "/products?sort=newest" },
    { id: -2, title: "Top Deals", subtitle: "Biggest discounts today", image: null, link: "/products?minDiscount=20" },
    { id: -3, title: "Accessories", subtitle: "Cases, chargers & more", image: null, link: "/products?category=mobile-accessories" },
  ],
  [
    { id: -4, title: "Flagship Phones", subtitle: "Top-rated performance", image: null, link: "/products?category=mobiles" },
    { id: -5, title: "Budget Picks", subtitle: "Great phones under ₹15,000", image: null, link: "/products?maxPrice=15000" },
    { id: -6, title: "Trade-In Offers", subtitle: "Upgrade and save more", image: null, link: "/services" },
  ],
  [
    { id: -7, title: "Laptop Gear", subtitle: "Chargers, stands & SSDs", image: null, link: "/products?category=laptop-accessories" },
    { id: -8, title: "EMI Available", subtitle: "No-cost card EMIs", image: null, link: "/contact" },
    { id: -9, title: "Bestsellers", subtitle: "What Bengaluru is buying", image: null, link: "/products?sort=newest" },
  ],
  [
    { id: -10, title: "Trending Now", subtitle: "Most-loved this week", image: null, link: "/products" },
    { id: -11, title: "Audio & Cases", subtitle: "Genuine, guaranteed", image: null, link: "/products?category=mobile-accessories" },
    // Repoints at the device-first flow, consistently with the nav and footer
    // defaults. Fallback content only — a real banner row from Admin wins.
    { id: -12, title: "Book a Repair", subtitle: "Same-day expert service", image: null, link: "/repair" },
  ],
  [
    { id: -13, title: "Premium Range", subtitle: "Top-tier flagships", image: null, link: "/products?minPrice=50000" },
    { id: -14, title: "SIM & Cellular", subtitle: "Instant activation", image: null, link: "/contact" },
    { id: -15, title: "Visit Our Stores", subtitle: "2 outlets in Bengaluru", image: null, link: "/contact" },
  ],
];

// Rotating brand-toned gradients so three tiles in a row each have their own
// identity instead of reading as one flat block.
const TONES = [
  "from-blue-900 via-blue-700 to-indigo-800",
  "from-indigo-900 via-indigo-700 to-blue-800",
  "from-slate-900 via-blue-900 to-slate-800",
];

export default function PromoBannerStrip({ banners, fallbackSeed = 0 }: { banners: Banner[]; fallbackSeed?: number }) {
  // If fewer than 3 real banners were uploaded (e.g. a new store with only
  // 1 strip banner added so far), pad the remaining tiles with fallback
  // content instead of stretching 1-2 real banners across a 3-column grid
  // or (as before the fix) repeating the same real banner multiple times.
  const fallbackSet = FALLBACK_SETS[fallbackSeed % FALLBACK_SETS.length];
  const items =
    banners.length >= 3
      ? banners.slice(0, 3)
      : banners.length > 0
        ? [...banners, ...fallbackSet.slice(banners.length, 3)]
        : fallbackSet;

  return (
    <section className="shell band-tight">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((b, i) => {
          // A seeded SVG stand-in is not an image; see lib/bannerImage.
          const image = usableBannerImage(b.image);
          return (
            <Link
              key={b.id}
              href={b.link}
              className="group relative flex h-44 flex-col justify-end overflow-hidden rounded-2xl bg-slate-900 p-6 text-white shadow-sm ring-1 ring-slate-200 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl dark:ring-slate-700 sm:h-48"
            >
              {image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Scrim: the copy below sits on top of a photo now, so it needs
                      a guaranteed contrast floor rather than luck about how dark
                      the uploaded image happens to be. */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" />
                </>
              ) : (
                <>
                  <div className={`absolute inset-0 bg-gradient-to-br ${TONES[i % TONES.length]}`} />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:20px_20px]" />
                  <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG data-URL */}
                  <img
                      src={renderProductDark(...(FALLBACK_ART[b.id] ?? artFromCopy(`${b.title} ${b.subtitle ?? ""}`, i)))}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-4 top-1/2 h-[150%] w-auto -translate-y-1/2 rotate-[8deg] opacity-90 drop-shadow-[0_20px_30px_rgba(2,6,23,0.55)] transition-transform duration-500 group-hover:rotate-[4deg] group-hover:scale-105"
                    />
                </>
              )}

              {/* Copy lives in the DOM in both branches. It used to exist only on
                  the no-image path, which meant an image-backed banner shipped
                  its title to nobody — not the reader, not a screen reader, not a
                  crawler. */}
              <div className="relative">
                <p className="text-lg font-black tracking-tight drop-shadow-sm">{b.title}</p>
                {b.subtitle && <p className="mt-0.5 text-xs font-medium text-white/80">{b.subtitle}</p>}
                <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-[11px] font-black text-blue-900 shadow-sm transition-all group-hover:gap-2">
                  Shop Now <span className="nudge-x">→</span>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
