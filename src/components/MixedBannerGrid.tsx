import Link from "next/link";
import SafeImage from "./SafeImage";
import { usableBannerImage } from "@/lib/bannerImage";

export type GridBannerData = {
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  link: string;
  size?: string | null; // "large" | "small" — only these two matter for layout here
};

// One large tile + up to two small tiles stacked beside it (spec section
// 10/G: "large + small mixed grid"). Composition is driven entirely by
// how many banners are actually passed in — 1 banner renders as a single
// full-width tile, 2 as large+1 small, 3+ as large+2 small. Never pads
// with placeholder tiles.
export default function MixedBannerGrid({ banners }: { banners: GridBannerData[] }) {
  const items = banners.slice(0, 3);
  if (items.length === 0) return null;

  const [large, ...smalls] = items;

  return (
    <section className="shell band-tight">
      <div className={`grid grid-cols-1 gap-3 ${smalls.length > 0 ? "sm:grid-cols-3" : ""}`}>
        <Tile banner={large} className={smalls.length > 0 ? "sm:col-span-2 h-56 sm:h-full" : "h-56 sm:h-72"} />
        {smalls.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-rows-2">
            {smalls.map((b) => (
              <Tile key={b.id} banner={b} className="h-40 sm:h-full" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Tile({ banner, className = "" }: { banner: GridBannerData; className?: string }) {
  return (
    <Link
      href={banner.link}
      className={`group relative block overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200 transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-slate-800 dark:ring-slate-700 ${className}`}
    >
      {usableBannerImage(banner.image) ? (
        <SafeImage src={usableBannerImage(banner.image)!} alt={banner.title} className="object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-800" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="text-base font-black tracking-tight text-white sm:text-lg">{banner.title}</p>
        {banner.subtitle && <p className="text-xs font-medium text-white/80">{banner.subtitle}</p>}
      </div>
    </Link>
  );
}
