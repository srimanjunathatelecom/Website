import Link from "next/link";
import SafeImage from "./SafeImage";

type RefBrand = { id: number; name: string; slug: string; logoUrl: string | null };

export type BrandBannerData = {
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null; // optional background art, distinct from the brand logo
  refBrand: RefBrand | null;
};

// Links to the existing brand filter route (/products?brand=slug), same
// pattern BrandStrip already uses. Hides itself if the referenced brand
// no longer exists or was deactivated.
export default function BrandBanner({ banner }: { banner: BrandBannerData }) {
  const b = banner.refBrand;
  if (!b) return null;

  return (
    <Link
      href={`/products?brand=${encodeURIComponent(b.slug)}`}
      className="group relative flex h-40 items-center justify-between overflow-hidden rounded-2xl bg-slate-900 p-6 shadow-sm ring-1 ring-slate-800 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl sm:h-48"
    >
      {banner.image && (
        <>
          <SafeImage src={banner.image} alt="" className="object-cover opacity-40 transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/70 to-transparent" />
        </>
      )}
      <div className="relative z-10">
        {b.logoUrl ? (
          <div className="relative h-10 w-32">
            <SafeImage src={b.logoUrl} alt={b.name} className="object-contain" fill sizes="150px" />
          </div>
        ) : (
          <p className="text-xl font-black tracking-tight text-white">{b.name}</p>
        )}
        <p className="mt-2 text-lg font-black tracking-tight text-white">{banner.title || `${b.name} Collection`}</p>
        {banner.subtitle && <p className="text-xs font-medium text-white/70">{banner.subtitle}</p>}
      </div>
      <span className="nudge-x relative z-10 text-2xl font-black text-white">→</span>
    </Link>
  );
}
