"use client";

import { useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import ProductCard, { CardProduct } from "./ProductCard";
import ShelfRail, { RailButtons, SHELF_ITEM, type ShelfRailHandle } from "./ShelfRail";
import { EmptyShelf } from "./ScrollShelf";

/**
 * Bestsellers shelf.
 *
 * The previous layout put the heading on a dark navy gradient bar with 64px
 * of bottom padding, then pulled the card row up by 48px to overlap it.
 * That produced the odd effect of product cards floating half-on a navy
 * band, and gave this shelf a completely different silhouette from its
 * neighbours. It now sits on the shared white surface with the same header
 * and card grid as every other shelf; the "most bought" signal now comes
 * from the trending chip in the header instead of from a whole band of
 * competing colour.
 */
export default function BestSellerShelf({ title, products }: { title: string; products: CardProduct[] }) {
  const railRef = useRef<ShelfRailHandle>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  return (
    <section className="shell band-tight">
      <div className="surface relative overflow-hidden p-4 sm:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative mb-4 flex items-end justify-between gap-4 sm:mb-5">
          <div className="accent-rail pl-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600/12 text-blue-700 dark:text-blue-400">
                <TrendingUp className="h-3 w-3" strokeWidth={2.6} />
              </span>
              <p className="eyebrow">Most bought this month</p>
            </div>
            <h2 className="font-display mt-1 text-[19px] font-extrabold leading-[1.15] tracking-[-0.02em] text-slate-900 sm:text-[24px] dark:text-white">
              {title}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
              Ranked by real counter and online sales across both our Bengaluru outlets.
            </p>
          </div>

          <RailButtons
            onPrev={() => railRef.current?.scrollByPage(-1)}
            onNext={() => railRef.current?.scrollByPage(1)}
            atStart={edge.atStart}
            atEnd={edge.atEnd}
            label="bestsellers"
          />
        </div>

        {products.length === 0 ? (
          <EmptyShelf message="Bestsellers are being calculated" />
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
