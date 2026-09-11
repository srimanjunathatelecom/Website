import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import SectionHead from "@/components/SectionHead";
import Reveal from "@/components/Reveal";
import { formatINR } from "@/lib/format";

/**
 * "Deal zone" bento — an asymmetric mosaic of the shop's biggest genuine
 * discounts. The best deal gets a large editorial tile; the rest get
 * compact tiles. Everything (price, MRP, discount, stock) is the live
 * database row — the section renders nothing unless at least three real
 * discounts exist, and "Only X left" appears only when stock is truly at
 * or below the product's own low-stock threshold.
 */

type DealProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  mrp: string;
  mop: string;
  stock: number;
  lowStockThreshold: number;
  primaryImage?: string | null;
};

function off(p: DealProduct) {
  const m = Number(p.mrp);
  const o = Number(p.mop);
  return m > o && m > 0 ? Math.round(((m - o) / m) * 100) : 0;
}

export default function BentoDeals({ deals }: { deals: DealProduct[] }) {
  const list = deals
    .filter((p) => off(p) > 0 && p.stock > 0)
    .sort((a, b) => off(b) - off(a))
    .slice(0, 5);
  if (list.length < 3) return null;
  const [lead, ...rest] = list;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <SectionHead
        eyebrow="Deal Zone"
        title="Today's biggest genuine discounts"
        subtitle="Real markdowns off MRP — not inflated 'was' prices."
        accent="amber"
        href="/products?minDiscount=10"
        hrefLabel="All deals"
      />
      <Reveal>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2">
          {/* Lead tile — the single best discount, editorial size */}
          <Link
            href={`/products/${lead.slug}`}
            className="group relative flex min-h-72 flex-col justify-end overflow-hidden rounded-3xl bg-[#0b1120] p-5 text-white sm:col-span-2 lg:row-span-2 lg:min-h-0"
          >
            <div className="absolute inset-0">
              <SafeImage
                src={lead.primaryImage}
                alt=""
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain object-center p-8 opacity-90 transition-transform duration-500 group-hover:scale-[1.04] sm:p-10"
              />
            </div>
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1120] via-[#0b1120]/45 to-transparent" />
            <div className="relative">
              <span className="inline-block rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-amber-950">
                {off(lead)}% OFF — biggest deal
              </span>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-slate-300">{lead.brand}</p>
              <h3 className="mt-0.5 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{lead.name}</h3>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-2xl font-black">{formatINR(Number(lead.mop))}</span>
                <span className="text-sm font-semibold text-slate-400 line-through">{formatINR(Number(lead.mrp))}</span>
                {lead.stock <= lead.lowStockThreshold && (
                  <span className="text-xs font-black text-rose-400">Only {lead.stock} left</span>
                )}
              </p>
            </div>
          </Link>

          {/* Compact tiles */}
          {rest.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-900/[0.06] dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="absolute right-3 top-3 z-10 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                {off(p)}% off
              </span>
              <div className="relative h-32 w-full">
                <SafeImage
                  src={p.primaryImage}
                  alt=""
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-contain transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{p.brand}</p>
              <h3 className="clamp-2 mt-0.5 text-sm font-bold leading-snug">{p.name}</h3>
              <p className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
                <span className="text-base font-black">{formatINR(Number(p.mop))}</span>
                <span className="text-xs font-semibold text-slate-400 line-through">{formatINR(Number(p.mrp))}</span>
              </p>
              {p.stock <= p.lowStockThreshold && (
                <p className="mt-1 text-[11px] font-black text-rose-500">Only {p.stock} left</p>
              )}
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
