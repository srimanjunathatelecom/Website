"use client";

import { useEffect, useState } from "react";
import ProductCard, { CardProduct } from "../ProductCard";
import { pushRecentlyViewed } from "@/lib/recentlyViewed";

/**
 * Recently viewed rail.
 *
 * The browser only remembers which product IDs were opened; the products
 * themselves are re-read from /api/products?ids=… so prices, stock and images
 * are always live and unpublished products silently drop out.
 */
export default function RecentlyViewedRail({ currentProductId }: { currentProductId: number }) {
  const [items, setItems] = useState<CardProduct[]>([]);

  useEffect(() => {
    // Record this visit first, then fetch the rest of the history.
    const ids = pushRecentlyViewed(currentProductId).filter((id) => id !== currentProductId);
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/products?ids=${ids.join(",")}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setItems((d.items || []) as CardProduct[]);
      } catch {
        // Offline or failed request — the rail just stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentProductId]);

  if (!items.length) return null;

  return (
    <section className="mt-14 w-full border-t border-slate-100 pt-10 dark:border-slate-800">
      <h2 className="mb-5 text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">Recently viewed</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
