"use client";

import { useEffect, useState } from "react";
import { markWishlistStale } from "@/lib/wishlist";
import ProductCard, { CardProduct } from "./ProductCard";
import EmptyState from "./EmptyState";
import { Heart } from "lucide-react";

export default function WishlistView() {
  const [items, setItems] = useState<CardProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/wishlist");
      const d = await r.json();
      if (r.ok) setItems(d.items || []);
      setLoading(false);
    })();
  }, []);

  async function remove(id: number) {
    await fetch("/api/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: id }) });
    // Product cards elsewhere derive their hearts from lib/wishlist's cache.
    // Client-side navigation keeps that module alive, so without this a
    // product removed here still looks saved back on the homepage.
    markWishlistStale();
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading) return <p className="py-20 text-center text-slate-500">Loading…</p>;
  if (items.length === 0)
    return (
      <EmptyState
        icon={<Heart className="h-7 w-7" strokeWidth={1.75} />}
        title="Your wishlist is empty"
        message="Tap the heart on any product to save it here and come back to it later."
        primaryHref="/products"
        primaryLabel="Browse products"
      />
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-2xl font-extrabold">My Wishlist</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <div key={p.id} className="relative">
            <ProductCard p={p} />
            <button onClick={() => remove(p.id)} className="absolute right-2 top-2 z-10 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-rose-600 shadow dark:bg-slate-800">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
