"use client";

import Link from "next/link";
import Image from "next/image";
import { canOptimizeImage } from "@/lib/imageHosts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addToCart } from "@/lib/cart";
import { toggleCompare, getCompare } from "@/lib/compare";
import { ensureWishlistLoaded, isWishlisted, onWishlistChange, toggleWishlist } from "@/lib/wishlist";
import { discountPercent, stockStatus } from "@/lib/format";
import { useTilt } from "@/lib/useTilt";

export type CardProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  mrp: string;
  mop: string;
  primaryImage?: string | null;
  stock: number;
  lowStockThreshold: number;
  bestseller?: boolean;
  newArrival?: boolean;
  imageSource?: string;
  categoryId?: number | null;
  /**
   * How many colour / RAM / storage variants the product has. A card can't
   * know which one the shopper wants, so anything above zero opens the
   * product page to choose rather than adding an option-less cart line.
   */
  variantCount?: number;
};

/**
 * Sizes the grid actually renders: 2 columns on phones, 3 from sm, 4 from lg
 * inside a 1400px shell. Without this next/image assumes 100vw and serves a
 * desktop-width file to a phone showing it at ~170px.
 */
const CARD_IMAGE_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 320px";

function ProductImage({
  src,
  alt,
  name,
  brand,
  priority,
}: {
  src?: string | null;
  alt: string;
  name: string;
  brand: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  
  if (!src || failed) {
    const initials = name.replace(/[^a-z0-9 ]/gi, "").split(/\s+/).slice(0, 3).map((w) => w[0]).join("").toUpperCase();
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center bg-slate-50 p-3 dark:bg-slate-800">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 text-lg font-black text-slate-500 shadow-inner dark:from-slate-700 dark:to-slate-600 dark:text-slate-400">
          {initials}
        </div>
        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{brand}</p>
      </div>
    );
  }
  
  const shared = "object-contain mix-blend-multiply dark:mix-blend-normal";

  if (!canOptimizeImage(src)) {
    return (
      // Not optimizable: data:/blob: source, or a host that is not in
      // NEXT_PUBLIC_IMAGE_HOSTS. See src/lib/imageHosts.ts.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        onError={() => setFailed(true)}
        className={`h-full w-full ${shared}`}
      />
    );
  }

  return (
    // fill needs a positioned ancestor, and the hover-scale wrapper outside
    // this component is not one.
    <div className="relative h-full w-full">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={CARD_IMAGE_SIZES}
        // The first row of cards is usually the LCP element, so it must not be
        // lazy-loaded. Everything below the fold still is.
        priority={priority}
        loading={priority ? undefined : "lazy"}
        onError={() => setFailed(true)}
        className={shared}
      />
    </div>
  );
}

export default function ProductCard({
  p,
  priority,
}: {
  p: CardProduct;
  /** Set on the first row of a grid to opt its image out of lazy-loading. */
  priority?: boolean;
}) {
  const router = useRouter();
  const [wished, setWished] = useState(false);
  // Subtle 3D tilt + pointer sheen. Mouse-only inside the hook, disabled
  // for reduced motion in CSS, and writes style props without re-rendering.
  const tilt = useTilt(4);
  const [added, setAdded] = useState(false);
  const [compared, setCompared] = useState(false);

  const off = discountPercent(p.mrp, p.mop);
  const savings = Math.max(0, Math.round(Number(p.mrp) - Number(p.mop)));
  const st = stockStatus(p.stock, p.lowStockThreshold);
  const out = st.tone === "out";

  useEffect(() => {
    const checkCompare = () => setCompared(getCompare().some((i) => i.id === p.id));
    checkCompare();
    window.addEventListener("sms-compare-change", checkCompare);
    return () => window.removeEventListener("sms-compare-change", checkCompare);
  }, [p.id]);

  // The wishlist is server-side, so the heart cannot be derived locally. This
  // used to default to false on every mount, which meant an already-saved
  // product showed an empty heart here while its own product page showed a
  // filled one — and the next click removed it instead of adding it. The
  // shared loader is memoised, so all the cards in a grid share one request.
  useEffect(() => {
    const sync = () => setWished(isWishlisted(p.id));
    ensureWishlistLoaded().then(sync);
    sync();
    return onWishlistChange(sync);
  }, [p.id]);

  const needsOptions = (p.variantCount || 0) > 0;

  function add(e: React.MouseEvent) {
    e.preventDefault();
    if (out) return;
    // Variant products must reach the cart with a real variant id, price and
    // SKU attached — that only happens once the shopper has picked one on the
    // product page, which is also where stock per option is shown.
    if (needsOptions) {
      router.push(`/products/${p.slug}`);
      return;
    }
    addToCart({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      mrp: Number(p.mrp),
      mop: Number(p.mop),
      image: p.primaryImage || "",
      stock: p.stock,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  function handleCompare(e: React.MouseEvent) {
    e.preventDefault();
    toggleCompare({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      mrp: p.mrp,
      mop: p.mop,
      primaryImage: p.primaryImage || "",
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
    });
  }

  async function toggleWish(e: React.MouseEvent) {
    e.preventDefault();
    // State lives in lib/wishlist so every card, and the product page, agree.
    // It updates optimistically and rolls back on failure, so a dropped
    // request can no longer leave the icon contradicting the database.
    const result = await toggleWishlist(p.id);
    if (result === "unauthorized") router.push("/login?redirect=/wishlist");
  }

  return (
    <Link
      href={`/products/${p.slug}`}
      className="pcard group tilt-scope tilt-sheen"
      {...tilt}
    >
      {/* Status ribbons. Only ever one column in the top-left so the
          image is never boxed in on two corners at once. */}
      <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-col items-start gap-1">
        {off > 0 && (
          <span className="rounded-md bg-rose-600 px-1.5 py-[3px] text-[10px] font-black leading-none tracking-wide text-white shadow-sm">
            {off}% OFF
          </span>
        )}
        {p.bestseller && (
          <span className="rounded-md bg-slate-900/90 px-1.5 py-[3px] text-[9px] font-black uppercase leading-none tracking-[0.1em] text-white shadow-sm">
            Bestseller
          </span>
        )}
        {!p.bestseller && p.newArrival && (
          <span className="rounded-md bg-blue-700/90 px-1.5 py-[3px] text-[9px] font-black uppercase leading-none tracking-[0.1em] text-white shadow-sm">
            New
          </span>
        )}
      </div>

      {/* Wishlist + compare. Revealed on hover (always visible on touch
          devices via the .pcard-actions media query) so five cards in a
          row no longer show ten competing icon buttons at rest. */}
      <div className="pcard-actions absolute right-2.5 top-2.5 z-10 flex flex-col gap-1.5">
        <button
          onClick={toggleWish}
          // Colour alone carried the saved state, so a screen reader had no way
          // to tell a saved product from an unsaved one.
          aria-pressed={wished}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/85 shadow-sm ring-1 ring-slate-900/5 backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-white dark:bg-slate-800/80 dark:ring-white/10 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${wished ? "fill-rose-500 text-rose-500" : "text-slate-500 dark:text-slate-300"}`} fill={wished ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          onClick={handleCompare}
          aria-label="Compare"
          title="Compare"
          className="grid h-8 w-8 place-items-center rounded-full bg-white/85 shadow-sm ring-1 ring-slate-900/5 backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-white dark:bg-slate-800/80 dark:ring-white/10 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${compared ? "text-blue-600" : "text-slate-500 dark:text-slate-300"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/>
          </svg>
        </button>
      </div>

      {/* Image area. Squarer than the old 4/5 so five cards in a row are
          not disproportionately tall, and padded less so the product
          itself fills more of the frame. */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50/80 p-5 dark:bg-slate-800/40">
        <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.06]">
          <ProductImage src={p.primaryImage} alt={p.name} name={p.name} brand={p.brand} priority={priority} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3.5">
        {/* Brand and stock share one line — previously stock had its own
            row, which pushed every card 20px taller for information that
            fits comfortably beside the brand. */}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {p.brand || "SMS"}
          </p>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                st.tone === "in" ? "bg-emerald-500" : st.tone === "low" ? "bg-amber-500" : "bg-rose-500"
              }`}
            />
            {st.tone === "in" && <span className="text-emerald-600 dark:text-emerald-400">In stock</span>}
            {st.tone === "low" && <span className="text-amber-600 dark:text-amber-400">{p.stock} left</span>}
            {st.tone === "out" && <span className="text-rose-600 dark:text-rose-400">Sold out</span>}
          </span>
        </div>

        {/* leading and min-height are in matching pixel units (2 x 18px) so
            the reserved box is exactly two lines tall. It was previously
            min-h-[2.45rem] (39.2px) against a line box of 13px/1.35
            (17.55px, so 35.1px for two lines) — the 4px surplus let a sliver
            of the clamped third line show through beneath the second and
            run into the price row. Keep these two values in step. */}
        <p className="clamp-2 min-h-[36px] text-[13px] font-semibold leading-[18px] text-slate-800 transition-colors group-hover:text-blue-700 dark:text-slate-200 dark:group-hover:text-blue-400">
          {p.name}
        </p>

        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-display text-[19px] font-extrabold leading-none tracking-[-0.02em] text-slate-900 dark:text-white">
            ₹{Number(p.mop).toLocaleString("en-IN")}
          </span>
          {off > 0 && (
            <span className="text-[11px] font-medium text-slate-400 line-through dark:text-slate-500">
              ₹{Number(p.mrp).toLocaleString("en-IN")}
            </span>
          )}
        </div>

        {/* The rupee saving, spelled out. The percentage badge on the image
            already implies it, but shoppers compare absolute amounts — a
            "23% OFF" flag on a 21,999 phone is far less persuasive than
            "Save ₹5,000". Derived from mrp and mop, which are both already
            on the card; nothing new is fetched and nothing is estimated. */}
        {savings > 0 && (
          <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            Save ₹{savings.toLocaleString("en-IN")}
          </p>
        )}

        {/* Outlined by default, filling with brand blue on hover. The old
            solid near-black button on every card made a row of five read
            as five heavy dark bars rather than as five products. */}
        <div className="mt-auto pt-3">
          <button
            onClick={add}
            disabled={out}
            className={`w-full rounded-lg py-2 text-[12px] font-bold tracking-wide transition-all duration-200 active:scale-[0.98] ${
              out
                ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                : added
                  ? "bg-emerald-600 text-white"
                  : "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-700 hover:text-white hover:ring-blue-700 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30 dark:hover:bg-blue-600 dark:hover:text-white"
            }`}
          >
            {out ? "Notify me" : added ? "Added to cart" : needsOptions ? "Select options" : "Add to cart"}
          </button>
        </div>
      </div>
    </Link>
  );
}