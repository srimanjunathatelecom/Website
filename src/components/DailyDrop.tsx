import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import IstMidnightCountdown from "@/components/IstMidnightCountdown";
import Reveal from "@/components/Reveal";
import { formatINR } from "@/lib/format";

/**
 * "Deal of the Day" — one genuinely discounted product, rotated
 * deterministically each day (day-number % deals), so every visitor sees
 * the same drop and it changes at midnight IST without anyone touching
 * the admin. The countdown runs to real midnight in the store's timezone;
 * price, MRP, discount and stock are live database values. Renders
 * nothing if the shop currently has no real discounts.
 */

type DropProduct = {
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

export default function DailyDrop({
  eyebrow,
  title,
  product,
}: {
  eyebrow: string;
  title: string;
  product: DropProduct;
}) {
  const mrp = Number(product.mrp);
  const mop = Number(product.mop);
  const off = mrp > mop && mrp > 0 ? Math.round(((mrp - mop) / mrp) * 100) : 0;
  if (off <= 0 || product.stock <= 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-amber-50 dark:border-rose-950 dark:from-rose-950/40 dark:via-slate-950 dark:to-amber-950/30">
          <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[380px_1fr] lg:gap-10">
            <Link href={`/products/${product.slug}`} className="group relative mx-auto block h-64 w-full max-w-xs sm:h-72">
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-200/50 blur-2xl dark:bg-rose-500/15"
              />
              <SafeImage
                src={product.primaryImage}
                alt={product.name}
                sizes="(max-width: 1024px) 80vw, 380px"
                className="object-contain drop-shadow-xl transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <span className="absolute -left-1 top-2 rounded-full bg-rose-600 px-3 py-1.5 text-sm font-black text-white shadow-lg shadow-rose-600/30">
                −{off}%
              </span>
            </Link>

            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-rose-600/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-rose-700 ring-1 ring-rose-600/20 dark:text-rose-300">
                <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-600" />
                {eyebrow}
              </p>
              <h2 className="font-display mt-3 text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">{product.brand}</p>
              <p className="text-lg font-bold leading-snug sm:text-xl">{product.name}</p>

              <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-black tracking-tight">{formatINR(mop)}</span>
                <span className="text-base font-semibold text-slate-400 line-through">{formatINR(mrp)}</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                  save {formatINR(mrp - mop)}
                </span>
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Fresh drop at midnight</p>
                  <div className="mt-1 text-xl font-black tabular-nums">
                    <IstMidnightCountdown />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Stock right now</p>
                  <p className={`mt-1 text-sm font-black ${product.stock <= product.lowStockThreshold ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {product.stock <= product.lowStockThreshold ? `Only ${product.stock} left` : `${product.stock} in stock`}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/products/${product.slug}`}
                  className="rounded-full bg-rose-600 px-7 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/25 transition hover:-translate-y-0.5 hover:bg-rose-700"
                >
                  Grab today&apos;s drop →
                </Link>
                <Link
                  href="/products?minDiscount=10"
                  className="rounded-full border border-slate-300 px-7 py-3 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  More deals
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
