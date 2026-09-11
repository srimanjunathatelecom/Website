"use client";

import Link from "next/link";
import SafeImage from "./SafeImage";
import SectionHead from "./SectionHead";

// Shown only when Admin -> Shop by Brand is still empty, so a brand-new install
// has something to look at. Once the owner saves even one brand, this list is
// never rendered — it must never appear alongside or instead of real data,
// because it advertises brands this shop may not stock.
const DEFAULT_BRANDS = [
  { name: "Apple",     slug: "Apple",     bgColor: "#f8fafc" },
  { name: "Vivo",      slug: "Vivo",      bgColor: "#eff6ff" },
  { name: "Oppo",      slug: "Oppo",      bgColor: "#f0fdf4" },
  { name: "Samsung",   slug: "Samsung",   bgColor: "#e6f4f1" },
  { name: "Redmi",     slug: "Redmi",     bgColor: "#fef2f2" },
  { name: "Realme",    slug: "Realme",    bgColor: "#fef3c7" },
  { name: "Itel",      slug: "Itel",      bgColor: "#fff1f2" },
  { name: "Poco",      slug: "Poco",      bgColor: "#fef9c3" },
  { name: "Nokia",     slug: "Nokia",     bgColor: "#f0f9ff" },
  { name: "HMD",       slug: "HMD",       bgColor: "#faf5ff" },
  { name: "OnePlus",   slug: "OnePlus",   bgColor: "#fee2e2" },
  { name: "Jio Phone", slug: "Jio",       bgColor: "#e0f2fe", label: "Jio" },
  { name: "AI+",       slug: "AI+",       bgColor: "#f1f5f9" },
];

type BrandDef = {
  name: string;
  slug: string;
  bgColor: string;
  /** Optional short display name; the DB stores null when unset. */
  label?: string | null;
  logoUrl?: string | null;
};

function Logo({ brand }: { brand: BrandDef }) {
  // If you uploaded an image via the Admin Dashboard, render it immediately
  if (brand.logoUrl) {
    return <SafeImage src={brand.logoUrl} alt={brand.name} className="h-9 w-auto max-w-[92px] object-contain sm:h-10" fill={false} width={160} height={48} />;
  }

  // Fallback to your custom hardcoded styling
  const name = brand.label || brand.name;
  const map: Record<string, React.ReactElement> = {
    Apple: (
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-slate-800 sm:h-9 sm:w-9 dark:text-slate-100" fill="currentColor" aria-hidden>
        <path d="M16.5 12.6c0-2.5 2-3.7 2.1-3.8-1.1-1.6-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.8-3.2-.8-1.6 0-3.2.9-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3.1 2.4 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8 2.2-1.2 3-2.4c.9-1.4 1.3-2.7 1.3-2.7-.1 0-2.7-1-2.7-3.8zm-2.6-7c.7-.8 1.1-2 1-3.2-1 0-2.2.7-2.9 1.5-.7.7-1.2 1.9-1 3.1 1.1.1 2.2-.6 2.9-1.4z" />
      </svg>
    ),
    Vivo: <span className="text-[19px] font-black text-blue-600 sm:text-[23px]">vivo</span>,
    Oppo: <span className="text-[19px] font-black text-emerald-700 sm:text-[23px]">OPPO</span>,
    Samsung: <span className="text-[15px] font-black tracking-tight text-blue-800 sm:text-[18px]">SAMSUNG</span>,
    Redmi: <span className="text-[18px] font-black tracking-tight text-rose-600 sm:text-[22px]">Redmi</span>,
    Realme: <span className="text-[17px] font-black text-amber-600 sm:text-[21px]">realme</span>,
    Itel: <span className="text-[18px] font-black text-red-600 sm:text-[22px]">itel</span>,
    Poco: <span className="text-[18px] font-black tracking-widest text-amber-500 sm:text-[22px]">POCO</span>,
    Nokia: <span className="text-[16px] font-black tracking-wider text-blue-900 sm:text-[19px]">NOKIA</span>,
    HMD: <span className="text-[18px] font-black tracking-wider text-purple-700 sm:text-[22px]">HMD</span>,
    OnePlus: <span className="text-[15px] font-black text-rose-600 sm:text-[18px]">OnePlus</span>,
    Jio: <span className="text-[19px] font-black text-blue-600 sm:text-[23px]">Jio</span>,
    "AI+": <span className="text-[19px] font-black text-slate-800 sm:text-[23px]">AI+</span>,
  };
  return map[name] ?? <span className="text-base font-bold">{name}</span>;
}

function BrandTile({ b, ghost }: { b: BrandDef; ghost?: boolean }) {
  return (
    <Link
      href={`/products?brand=${encodeURIComponent(b.name)}`}
      className="group/brand flex w-[104px] shrink-0 flex-col items-center gap-2 sm:w-[124px]"
      aria-hidden={ghost || undefined}
      tabIndex={ghost ? -1 : undefined}
    >
      {/* Uniform white tile with a hairline ring; the brand's admin-set
          colour stays as a soft glow behind the logo. */}
      <div className="relative grid h-[76px] w-full place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-all duration-200 group-hover/brand:-translate-y-1 group-hover/brand:shadow-lg group-hover/brand:shadow-slate-900/10 group-hover/brand:ring-blue-200 sm:h-[86px] dark:bg-slate-900 dark:ring-slate-700 dark:group-hover/brand:ring-blue-800">
        <span
          className="pointer-events-none absolute -bottom-8 h-24 w-24 rounded-full opacity-60 blur-2xl transition-opacity duration-300 group-hover/brand:opacity-100"
          style={{ background: b.bgColor }}
        />
        <span className="relative grid place-items-center px-3 opacity-80 saturate-[0.85] transition-all duration-200 group-hover/brand:opacity-100 group-hover/brand:saturate-100">
          <Logo brand={b} />
        </span>
      </div>
      <span className="truncate text-[12px] font-bold tracking-tight text-slate-600 transition-colors group-hover/brand:text-blue-700 dark:text-slate-300 sm:text-[13px]">
        {b.name}
      </span>
    </Link>
  );
}

export default function BrandStrip({ brands: brandsFromServer }: { brands?: BrandDef[] }) {

  // The admin's brands are read on the server and passed in, so the first
  // paint is already correct. Previously this component rendered the hardcoded
  // fallback list and then fetched /api/brands on mount, so every visitor
  // watched thirteen placeholder brands (OPPO, POCO, NOKIA, itel, HMD, Jio,
  // AI+ — none of them configured in this store) appear and then vanish, with
  // the rail resizing under the cursor. The fallback is now used only when the
  // shop genuinely has no brands saved yet.
  const brands: BrandDef[] =
    brandsFromServer && brandsFromServer.length > 0 ? brandsFromServer : DEFAULT_BRANDS;

  return (
    <section className="shell band-tight">
      <div className="surface p-4 sm:p-6">
        <SectionHead
          eyebrow="Authorised stock"
          title="Shop by brand"
          subtitle="Every handset is sealed, brand-warranted and billed with GST."
          href="/products"
          hrefLabel="All brands"
          className="mb-4 sm:mb-5"
        />

        {/* Continuous marquee: the track holds two copies of the brand list
            and translates -50%, so the loop is seamless at any width. The
            second copy is aria-hidden and untabbable. Hover/focus pauses;
            reduced-motion turns it into a plain scrollable row (CSS). */}
        <div className="brand-marquee" aria-label="Brands">
          <div
            className="brand-marquee-track pb-1 pt-1"
            style={{ "--marquee-s": `${Math.max(24, brands.length * 3.2)}s` } as React.CSSProperties}
          >
            {brands.map((b) => (
              <BrandTile key={b.slug} b={b} />
            ))}
            {brands.map((b) => (
              <BrandTile key={`ghost-${b.slug}`} b={b} ghost />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
