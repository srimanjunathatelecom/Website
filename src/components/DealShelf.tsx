"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Flame, ArrowRight } from "lucide-react";
import ProductCard, { CardProduct } from "./ProductCard";
import ShelfRail, { RailButtons, SHELF_ITEM, type ShelfRailHandle } from "./ShelfRail";
import { EmptyShelf } from "./ScrollShelf";
import { discountPercent } from "@/lib/format";

/**
 * Offers shelf.
 *
 * The old version wrapped itself in a peach-to-orange gradient panel with
 * brown text, which clashed with the navy bestseller panel directly below
 * it and made the two shelves look like they came from different sites.
 * Now it uses the same white surface and card size as every other shelf,
 * and earns its "this is the discount row" identity from a single amber
 * accent rail, an amber flame chip and the big discount figure — amber
 * being the token already reserved for offers in globals.css.
 */
export default function DealShelf({ products }: { products: CardProduct[] }) {
  const railRef = useRef<ShelfRailHandle>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  const maxOff = products.reduce((m, p) => Math.max(m, discountPercent(p.mrp, p.mop)), 0);

  return (
    <section className="shell band-tight">
      <div className="surface relative overflow-hidden p-4 sm:p-6">
        {/* Warm wash anchored to the top-left corner only, so the shelf
            still reads as part of the white page instead of becoming a
            separate orange block. */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />

        <div className="relative mb-4 flex items-end justify-between gap-4 sm:mb-5">
          <div className="accent-rail accent-rail--amber pl-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500/15 text-amber-600">
                <Flame className="h-3 w-3" strokeWidth={2.6} />
              </span>
              <p className="eyebrow eyebrow-accent">Limited time offers</p>
            </div>
            <h2 className="font-display mt-1 text-[19px] font-extrabold leading-[1.15] tracking-[-0.02em] text-slate-900 sm:text-[24px] dark:text-white">
              Save up to{" "}
              <span className="text-amber-600 dark:text-amber-400">{maxOff || 50}%</span> off MRP
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Genuine stock, billed with GST. Prices already include the discount.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 pb-0.5">
            <Link
              href="/products?minDiscount=20"
              className="hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-white hover:text-amber-700 hover:ring-amber-200 sm:inline-flex dark:text-slate-300 dark:ring-slate-700"
            >
              All offers
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <RailButtons
              onPrev={() => railRef.current?.scrollByPage(-1)}
              onNext={() => railRef.current?.scrollByPage(1)}
              atStart={edge.atStart}
              atEnd={edge.atEnd}
              label="offers"
            />
          </div>
        </div>

        {products.length === 0 ? (
          <EmptyShelf message="No flash deals running right now" />
        ) : (
          <ShelfRail ref={railRef} onEdgeChange={setEdge} padClass="pb-2 pt-1">
            {products.map((p) => (
              <div key={p.id} className={SHELF_ITEM}>
                <ProductCard p={p} />
              </div>
            ))}
          </ShelfRail>
        )}
      </div>
    </section>
  );
}
