import Link from "next/link";
import SafeImage from "./SafeImage";
import BannerStyleFrame from "./BannerStyleFrame";
import { formatINR, discountPercent } from "@/lib/format";

// Matches (and is satisfied by) the richer row shape getEnrichedBanners
// actually returns — only the fields this component reads are required,
// everything else on the real product row is allowed to pass through.
type RefProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  mrp: string;
  mop: string;
  stock: number;
  primaryImage?: string | null;
  [key: string]: unknown;
};

export type ProductBannerData = {
  id: number;
  title: string;
  subtitle?: string | null;
  ctaLabel?: string | null;
  refProduct: RefProduct | null;
  style?: string | null;
  textAnimation?: string | null;
  productAnimation?: string | null;
  imageSide?: string | null;
  badge?: string | null;
};

// Every number shown here (price, discount, stock) comes from the live
// product row passed in via refProduct — never hard-coded. If the
// referenced product is missing, inactive, or out of stock, the banner
// hides itself instead of showing stale or fabricated info.
//
// When the banner has a non-"minimal" `style` set, delegate to the
// premium layered composition system (BannerStyleFrame), passing the
// live price/MRP/discount through as first-class layers instead of
// hand-rolling the pricing markup here. Existing rows default to
// "minimal" and keep the original layout untouched.
export default function ProductLedBanner({ banner }: { banner: ProductBannerData }) {
  const p = banner.refProduct;
  if (!p || p.stock <= 0) return null;

  const off = discountPercent(p.mrp, p.mop);

  if (banner.style && banner.style !== "minimal") {
    return (
      <BannerStyleFrame
        data={{
          id: banner.id,
          link: `/products/${p.slug}`,
          badge: banner.badge,
          title: banner.title || p.name,
          subtitle: banner.subtitle,
          ctaLabel: banner.ctaLabel,
          image: p.primaryImage,
          imageSide: banner.imageSide,
          style: banner.style,
          textAnimation: banner.textAnimation,
          productAnimation: banner.productAnimation,
          price: formatINR(p.mop),
          mrp: off > 0 ? formatINR(p.mrp) : null,
          discountPercent: off,
        }}
      />
    );
  }

  return (
    <section className="shell band-tight">
      <Link
        href={`/products/${p.slug}`}
        className="group grid grid-cols-1 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800 shadow-xl ring-1 ring-blue-900/40 transition hover:-translate-y-0.5 hover:shadow-2xl sm:grid-cols-2"
      >
        <div className="flex flex-col justify-center gap-3 p-8 text-white sm:p-12">
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-200">{p.brand}</p>
          <h2 className="text-2xl font-black leading-tight tracking-tight sm:text-4xl">{banner.title || p.name}</h2>
          {banner.subtitle && <p className="max-w-sm text-sm text-blue-100">{banner.subtitle}</p>}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black">{formatINR(p.mop)}</span>
            {off > 0 && (
              <>
                <span className="text-sm font-medium text-blue-200 line-through">{formatINR(p.mrp)}</span>
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-black text-white">{off}% OFF</span>
              </>
            )}
          </div>
          <span className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-blue-800 shadow-lg transition group-hover:gap-3">
            {banner.ctaLabel || "Shop Now"} <span className="nudge-x">→</span>
          </span>
        </div>
        <div className="relative min-h-[220px] bg-white/5 sm:min-h-[340px]">
          <SafeImage
            src={p.primaryImage}
            alt={p.name}
            className="object-contain p-8 transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      </Link>
    </section>
  );
}
