import Link from "next/link";
import SafeImage from "./SafeImage";

type RefCategory = { id: number; name: string; slug: string; image: string | null };

export type CategoryBannerData = {
  id: number;
  title: string;
  subtitle?: string | null;
  refCategory: RefCategory | null;
};

// Links to the existing category route (/products?category=slug) and
// uses the category's own image. Hides itself if the referenced
// category no longer exists.
export default function CategoryBanner({ banner }: { banner: CategoryBannerData }) {
  const c = banner.refCategory;
  if (!c) return null;

  return (
    <Link
      href={`/products?category=${encodeURIComponent(c.slug)}`}
      className="group relative block h-40 overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-slate-800 dark:ring-slate-700 sm:h-48"
    >
      <SafeImage
        src={c.image}
        alt={c.name}
        className="object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-5">
        <div>
          <p className="text-lg font-black uppercase tracking-tight text-white">{banner.title || c.name}</p>
          {banner.subtitle && <p className="text-xs font-medium text-white/80">{banner.subtitle}</p>}
        </div>
        <span className="nudge-x text-2xl font-black text-white">→</span>
      </div>
    </Link>
  );
}
