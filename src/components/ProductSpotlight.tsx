import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import Reveal from "@/components/Reveal";
import { parseSpecGroups } from "@/lib/productContent";
import { formatINR } from "@/lib/format";

/**
 * "Product spotlight" — a full-width flagship stage for ONE product, the
 * homepage's hero-product moment. The admin picks the product in
 * Admin > Homepage CMS (or leaves it on automatic = first featured item).
 *
 * Spec chips floating around the device are parsed from the product's own
 * specifications field — real data, and the section simply shows fewer
 * chips if the admin hasn't filled specs in. Price, MRP and stock are the
 * live database values.
 */

type SpotlightProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  mrp: string;
  mop: string;
  stock: number;
  primaryImage?: string | null;
  specifications?: string | null;
  highlights?: string | null;
};

type MiniAccessory = {
  id: number;
  slug: string;
  name: string;
  mop: string;
  primaryImage?: string | null;
};

export default function ProductSpotlight({
  eyebrow,
  product,
  accessories,
}: {
  eyebrow: string;
  product: SpotlightProduct;
  accessories: MiniAccessory[];
}) {
  const mrp = Number(product.mrp);
  const mop = Number(product.mop);
  const off = mrp > mop && mrp > 0 ? Math.round(((mrp - mop) / mrp) * 100) : 0;

  // Up to four short spec rows become floating chips around the device.
  const chips = parseSpecGroups(product.specifications)
    .flatMap((g) => g.rows)
    .filter((r) => r.value && r.value !== "Yes" && r.value.length <= 26 && r.label.length <= 18)
    .slice(0, 4);

  const chipSpots = [
    "left-2 top-6 sm:left-0 sm:top-10",
    "right-0 top-20 sm:-right-4 sm:top-24",
    "bottom-24 left-0 sm:-left-6 sm:bottom-28",
    "bottom-6 right-2 sm:bottom-10 sm:right-0",
  ];

  return (
    <section className="relative overflow-hidden bg-[#0b1120] text-white">
      <span aria-hidden className="aurora opacity-40">
        <span className="-top-24 left-1/4 h-96 w-96 bg-indigo-500/25" />
        <span className="-bottom-32 right-[8%] h-80 w-80 bg-blue-500/20" />
      </span>
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        {/* Device stage with floating real-spec chips */}
        <Reveal className="relative order-2 mx-auto w-full max-w-md lg:order-1">
          <div aria-hidden className="absolute inset-x-8 bottom-2 top-10 rounded-[40%] bg-blue-500/15 blur-3xl" />
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-white ring-1 ring-white/15">
            <SafeImage
              src={product.primaryImage}
              alt={product.name}
              sizes="(max-width: 1024px) 90vw, 40vw"
              className="scale-90 object-contain"
            />
          </div>
          {chips.map((c, i) => (
            <span
              key={c.label}
              className={`absolute ${chipSpots[i]} max-w-[46%] rounded-xl bg-slate-900/90 px-3 py-2 shadow-lg shadow-black/30 ring-1 ring-white/20`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-300">{c.label}</span>
              <span className="block truncate text-xs font-black text-white">{c.value}</span>
            </span>
          ))}
        </Reveal>

        {/* Story + price */}
        <div className="order-1 lg:order-2">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-sky-400">{eyebrow}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-400">{product.brand}</p>
          <h2 className="font-display mt-1 text-3xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            {product.name}
          </h2>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-black tracking-tight sm:text-4xl">{formatINR(mop)}</span>
            {off > 0 && (
              <>
                <span className="text-base font-semibold text-slate-400 line-through">{formatINR(mrp)}</span>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-400 ring-1 ring-emerald-400/30">
                  {off}% off — save {formatINR(mrp - mop)}
                </span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-[12px] font-semibold text-slate-400">
            Our price is the MOP — what you&apos;d pay at the counter, not a made-up MRP discount.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/products/${product.slug}`}
              className="rounded-full bg-white px-7 py-3 text-sm font-black text-slate-900 shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:bg-sky-400"
            >
              {product.stock > 0 ? "Get it today →" : "View product →"}
            </Link>
            <Link
              href="/products?category=mobiles"
              className="rounded-full border border-white/25 px-7 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Compare phones
            </Link>
          </div>

          {/* Complete the setup — real accessories, small and quiet */}
          {accessories.length > 0 && (
            <div className="mt-8 border-t border-white/10 pt-5">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">
                Complete the setup
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {accessories.map((a) => (
                  <Link
                    key={a.id}
                    href={`/products/${a.slug}`}
                    className="group flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] py-1.5 pl-1.5 pr-3.5 transition hover:-translate-y-0.5 hover:border-sky-400/50 hover:bg-white/10"
                  >
                    <span className="relative h-9 w-9 overflow-hidden rounded-lg bg-white">
                      <SafeImage src={a.primaryImage} alt="" sizes="36px" className="object-contain p-0.5" />
                    </span>
                    <span>
                      <span className="block max-w-36 truncate text-xs font-bold text-slate-100">{a.name}</span>
                      <span className="block text-[11px] font-black text-sky-400">{formatINR(Number(a.mop))}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
