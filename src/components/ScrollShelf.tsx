"use client";

import { useRef, useState } from "react";
import ProductCard, { CardProduct } from "./ProductCard";
import SectionHead from "./SectionHead";
import ShelfRail, { RailButtons, SHELF_ITEM, type ShelfRailHandle } from "./ShelfRail";

/**
 * The generic product shelf. Also the reference implementation the two
 * specialised shelves (DealShelf, BestSellerShelf) follow, so all three
 * share the same card size, header hierarchy, scroll behaviour and edge
 * treatment. A shelf's identity now comes from its eyebrow + accent rail
 * rather than from a different background colour per shelf.
 *
 * The `tone` and `accent` props are kept exactly as before so the
 * homepage section config in page.tsx and the admin dashboard continue to
 * work untouched.
 */
export default function ScrollShelf({
  title,
  subtitle,
  products,
  tone = "light",
  accent = "amber",
  eyebrow,
  href,
  hrefLabel,
}: {
  title: string;
  subtitle?: string;
  products: CardProduct[];
  tone?: "light" | "dark";
  accent?: "amber" | "blue" | "emerald";
  eyebrow?: string;
  href?: string;
  hrefLabel?: string;
}) {
  const railRef = useRef<ShelfRailHandle>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  const dark = tone === "dark";
  const accentMap = { amber: "amber", blue: "brand", emerald: "emerald" } as const;

  return (
    <section className="shell band-tight">
      <div className={`${dark ? "surface-ink" : "surface"} relative overflow-hidden p-4 sm:p-6`}>
        {dark && <div className="dot-grid pointer-events-none absolute inset-0" />}

        <div className="relative">
          <SectionHead
            eyebrow={eyebrow}
            title={title}
            subtitle={subtitle}
            href={href}
            hrefLabel={hrefLabel}
            accent={accentMap[accent]}
            tone={dark ? "ink" : "light"}
            className="mb-4 sm:mb-5"
            actions={
              <RailButtons
                onPrev={() => railRef.current?.scrollByPage(-1)}
                onNext={() => railRef.current?.scrollByPage(1)}
                atStart={edge.atStart}
                atEnd={edge.atEnd}
                tone={dark ? "ink" : "light"}
                label={title}
              />
            }
          />

          {products.length === 0 ? (
            <EmptyShelf dark={dark} />
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
      </div>
    </section>
  );
}

/**
 * A shelf with no products used to render a bare line of grey text
 * floating in an otherwise empty rounded box. This gives the empty state
 * an actual shape so a category the shopkeeper has not stocked yet still
 * looks deliberate.
 */
export function EmptyShelf({ dark = false, message }: { dark?: boolean; message?: string }) {
  return (
    <div
      className={`grid place-items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center ${
        dark ? "border-white/15 text-white/60" : "border-slate-200 text-slate-500 dark:border-slate-700"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 7h18l-1.5 12.5A2 2 0 0 1 17.5 21h-11a2 2 0 0 1-2-1.5L3 7z" strokeLinejoin="round" />
        <path d="M8.5 7V5.5a3.5 3.5 0 0 1 7 0V7" strokeLinecap="round" />
      </svg>
      <p className="text-[13px] font-semibold">{message || "Nothing here just yet"}</p>
      <p className="text-[12px] opacity-70">New stock is added to this shelf every week.</p>
    </div>
  );
}
