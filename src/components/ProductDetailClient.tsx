"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocationSearch, setLocationSearch } from "@/lib/useLocationSearch";
import SafeImage from "./SafeImage";
import ProductCard, { CardProduct } from "./ProductCard";
import dynamic from "next/dynamic";
import ProductGallery from "./pdp/ProductGallery";
import VariantPicker from "./pdp/VariantPicker";
import DeliveryCheck from "./pdp/DeliveryCheck";
import { type ApiQuestion } from "./pdp/QuestionsSection";

// Below-the-fold sections load in their own chunks — they fetch their data
// client-side anyway, so deferring their code costs nothing visible while
// keeping the initial PDP bundle lean.
const ReviewsSection = dynamic(() => import("./pdp/ReviewsSection"));
const QuestionsSection = dynamic(() => import("./pdp/QuestionsSection"));
const RecentlyViewedRail = dynamic(() => import("./pdp/RecentlyViewedRail"));
import { QuantitySelector, PurchaseButtons, StickyPurchaseBar, type PurchaseState } from "./pdp/PurchaseActions";
import StockAlertForm from "./pdp/StockAlertForm";
import { Collapsible, SpecTable, BoxContents } from "./pdp/ProductInfoSections";
import { addToCart } from "@/lib/cart";
import { ensureWishlistLoaded, isWishlisted, onWishlistChange, toggleWishlist } from "@/lib/wishlist";
import { toggleCompare, clearCompare, getCompare } from "@/lib/compare";
import { discountPercent, formatINR } from "@/lib/format";
import { fetchSession } from "@/lib/session";
import type { ProductMedia } from "@/lib/queries";
import {
  buildVariantMatrix,
  configLabel,
  defaultVariant,
  parseBoxContents,
  parseHighlights,
  parseSpecGroups,
  productBadges,
  variantLabel as variantLabelOf,
  variantSellable,
  type PdpVariant,
} from "@/lib/productContent";

type Review = {
  id: number;
  customerId: number;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  images: string;
  verifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
};
// Admin-managed offer tile — see promoOffers in db/schema.ts. Replaces the
// old hardcoded HDFC/Axis/SBI/UPI tiles with real, editable offer data.
type PromoOffer = {
  id: number;
  type: "bank" | "upi" | "instant" | "exchange" | "emi";
  title: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: number | string;
  maxDiscount: number | string | null;
  minOrder: number | string;
  provider?: string;
  cardType?: string;
  emiTenures?: string;
  emiInterestRate?: number | string | null;
  noCostEmi?: boolean;
  processingFee?: number | string | null;
  minPurchaseAmount?: number | string | null;
  maxExchangeValue?: number | string | null;
  exchangeEligibility?: string;
};

function HighlightIcon({ icon }: { icon: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (icon.includes("ram") || icon.includes("rom") || icon.includes("storage") || icon.includes("chip") === false && icon.includes("memory"))
    return <svg {...common} className="h-5 w-5"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M15 4v16M4 9h16M4 15h16" /></svg>;
  if (icon.includes("processor") || icon.includes("chip") || icon.includes("cpu"))
    return <svg {...common} className="h-5 w-5"><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></svg>;
  if (icon.includes("frontcamera") || icon.includes("front"))
    return <svg {...common} className="h-5 w-5"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>;
  if (icon.includes("camera"))
    return <svg {...common} className="h-5 w-5"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.2" /></svg>;
  if (icon.includes("display") || icon.includes("screen"))
    return <svg {...common} className="h-5 w-5"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21h6" /></svg>;
  if (icon.includes("battery"))
    return <svg {...common} className="h-5 w-5"><rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 10v4" /></svg>;
  return <svg {...common} className="h-5 w-5"><circle cx="12" cy="12" r="9" /></svg>;
}

// Type-appropriate icon for a promo offer tile — bank/UPI/EMI/exchange/
// instant each get a distinct glyph so offers don't all read as one
// generic card.
function OfferTypeIcon({ type, className = "h-4 w-4" }: { type: PromoOffer["type"]; className?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  if (type === "bank") return <svg {...common}><path d="M3 21h18M4 21V10M20 21V10M2 10l10-6 10 6" /><path d="M8 21v-7M12 21v-7M16 21v-7" /></svg>;
  if (type === "upi") return <svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" strokeLinejoin="round" /></svg>;
  if (type === "emi") return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>;
  if (type === "exchange") return <svg {...common}><path d="M17 2 21 6l-4 4" /><path d="M3 12v-1a4 4 0 0 1 4-4h14" /><path d="M7 22 3 18l4-4" /><path d="M21 12v1a4 4 0 0 1-4 4H3" /></svg>;
  return <svg {...common}><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /><path d="M17 2l5 5-9.5 9.5-5 1 1-5L17 2Z" /></svg>;
}

export default function ProductDetailClient({
  product,
  images,
  media,
  reviews,
  related,
  sameBrand = [],
  variants = [],
  offers = [],
  questions = [],
}: {
  product: any;
  images: string[];
  /** Gallery entries with alt text, colour association and image/video type. */
  media?: ProductMedia[];
  reviews: Review[];
  related: CardProduct[];
  sameBrand?: CardProduct[];
  variants?: PdpVariant[];
  offers?: PromoOffer[];
  /** Published questions with the store's answers, first page. */
  questions?: ApiQuestion[];
}) {
  const router = useRouter();

  // Defensive fallbacks: DB layer may return null instead of [] when there's no data,
  // and a default param only covers undefined, not null.
  // Memoised so the derived useMemo hooks below keep stable dependencies.
  const safeImages = useMemo(() => images || [], [images]);
  const safeReviews = useMemo(() => reviews || [], [reviews]);
  const safeRelated = related || [];
  const safeSameBrand = sameBrand || [];
  const safeOffers = useMemo(() => offers || [], [offers]);
  const safeQuestions = useMemo(() => questions || [], [questions]);

  // Gallery entries. Products saved before `media` existed (or a caller that
  // only has URL strings) are lifted into the same shape so the gallery has one
  // code path.
  const galleryMedia: ProductMedia[] = useMemo(() => {
    if (media && media.length) return media;
    return safeImages.map((url, i) => ({
      id: -(i + 1),
      url,
      alt: "",
      variantColor: "",
      mediaType: "image",
      sortOrder: i,
    }));
  }, [media, safeImages]);

  // -- Variant state --
  // The matrix knows every combination that exists in the database, which is
  // what lets the pickers disable pairs that were never created in Admin
  // instead of silently falling back to an unrelated variant's price.
  const matrix = useMemo(() => buildVariantMatrix(variants), [variants]);
  const initial = useMemo(() => defaultVariant(matrix), [matrix]);

  /**
   * Variant selection lives in the query string rather than in local state.
   *
   * It used to be plain `useState`, which meant a reload silently reset the
   * pickers to the cheapest variant: a shopper who had chosen a larger storage
   * tier came back to a different configuration at a different price, with no
   * indication anything had changed. Keeping it in the URL also makes the
   * configuration shareable and survives the back button.
   *
   * The URL is the single source of truth, so there is no second copy of the
   * selection to fall out of sync with it.
   */
  const search = useLocationSearch();

  const selection = useMemo(() => {
    const fallbackDefault = {
      config: initial ? configLabel(initial) : "",
      color: initial?.color?.trim() || "",
    };
    if (!matrix.variants.length) return fallbackDefault;

    const params = new URLSearchParams(search);
    const wantConfig = (params.get("config") || "").trim();
    const wantColor = (params.get("colour") || "").trim();

    // Only honour a pair the database actually has. A stale or hand-edited link
    // falls back to the default variant instead of showing an empty price.
    if (wantConfig && wantColor && matrix.exists(wantConfig, wantColor)) {
      return { config: wantConfig, color: wantColor };
    }
    const byColor =
      wantColor &&
      (matrix.variants.find((v) => (v.color || "").trim() === wantColor && variantSellable(v)) ||
        matrix.variants.find((v) => (v.color || "").trim() === wantColor));
    if (byColor) return { config: configLabel(byColor), color: (byColor.color || "").trim() };

    const byConfig =
      wantConfig &&
      (matrix.variants.find((v) => configLabel(v) === wantConfig && variantSellable(v)) ||
        matrix.variants.find((v) => configLabel(v) === wantConfig));
    if (byConfig) return { config: configLabel(byConfig), color: (byConfig.color || "").trim() };

    return fallbackDefault;
  }, [matrix, search, initial]);

  const selectedColor = selection.color;
  const selectedConfig = selection.config;

  function writeSelection(config: string, color: string) {
    const params = new URLSearchParams(window.location.search);
    if (config) params.set("config", config);
    else params.delete("config");
    if (color) params.set("colour", color);
    else params.delete("colour");
    setLocationSearch(params);
  }

  /**
   * Picking a colour keeps the current configuration when that pair exists; if
   * it doesn't, the configuration moves to one that is actually sold in that
   * colour. The same rule applies in reverse when picking a configuration, so
   * the selection can never land on a combination the backend doesn't have.
   */
  function chooseColor(color: string) {
    let config = selectedConfig;
    if (!config || !matrix.exists(config, color)) {
      const fallback =
        matrix.variants.find((v) => (v.color || "").trim() === color && variantSellable(v)) ||
        matrix.variants.find((v) => (v.color || "").trim() === color);
      if (fallback) config = configLabel(fallback);
    }
    writeSelection(config, color);
  }

  function chooseConfig(config: string) {
    let color = selectedColor;
    if (!color || !matrix.exists(config, color)) {
      const fallback =
        matrix.variants.find((v) => configLabel(v) === config && variantSellable(v)) ||
        matrix.variants.find((v) => configLabel(v) === config);
      if (fallback) color = (fallback.color || "").trim();
    }
    writeSelection(config, color);
  }

  const currentVariant = useMemo(
    () => matrix.find(selectedConfig, selectedColor),
    [matrix, selectedConfig, selectedColor]
  );

  // A product with variants prices from the selected variant; one without
  // variants prices from the product row. When the shopper has managed to land
  // on a pair that doesn't exist we show no price and block purchase rather
  // than displaying a price that belongs to something else.
  const hasVariants = matrix.variants.length > 0;
  const invalidCombination = hasVariants && !currentVariant;

  const displayMrp = Number(currentVariant ? currentVariant.mrp : product.mrp) || 0;
  const displayMop = Number(currentVariant ? currentVariant.mop : product.mop) || 0;
  const displayStock = Number(currentVariant ? currentVariant.stock : product.stock) || 0;
  const displaySku = (currentVariant?.sku || product.sku || "").trim();
  const variantUnavailable = !!currentVariant && currentVariant.available === false;

  // Best real offer: the single largest discount among admin-configured
  // promo offers that this order value actually qualifies for (respects
  // each offer's own minOrder and percent-type maxDiscount cap). Replaces
  // the old hardcoded "10% off up to ₹1,500" simulation.
  function offerDiscountFor(o: PromoOffer, orderValue: number): number {
    if (orderValue < Number(o.minOrder || 0)) return 0;
    if (o.discountType === "fixed") return Number(o.discountValue) || 0;
    const pct = (Number(o.discountValue) || 0) / 100;
    const raw = orderValue * pct;
    const cap = o.maxDiscount != null ? Number(o.maxDiscount) : null;
    return cap != null ? Math.min(raw, cap) : raw;
  }

  const bestOffer = safeOffers.reduce<{ offer: PromoOffer; discount: number } | null>((best, o) => {
    const discount = offerDiscountFor(o, displayMop);
    if (discount <= 0) return best;
    if (!best || discount > best.discount) return { offer: o, discount };
    return best;
  }, null);

  const bankDiscount = bestOffer?.discount || 0;
  const bankOfferPrice = displayMop - bankDiscount;
  const emiStartPrice = Math.round(displayMop / 12);

  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<"" | "cart" | "buy">("");
  const [added, setAdded] = useState(false);
  const [actionError, setActionError] = useState("");
  const [wished, setWished] = useState(false);
  const [wishReady, setWishReady] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [allOffersOpen, setAllOffersOpen] = useState(false);
  const [emiModalOpen, setEmiModalOpen] = useState(false);

  // Real EMI offers only — no invented calculations. Each carries its own
  // admin-entered tenures/interest/no-cost/processing-fee.
  const emiOffers = useMemo(() => safeOffers.filter((o) => o.type === "emi"), [safeOffers]);

  const bankOff = discountPercent(displayMrp, bankOfferPrice);
  const off = discountPercent(displayMrp, displayMop);
  const out = displayStock <= 0;

  // Quantity can never exceed the stock of the exact variant selected.
  const maxQty = Math.max(1, Math.min(10, displayStock || 1));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQty((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty]);

  const avg = useMemo(() => {
    if (!safeReviews.length) return 0;
    return safeReviews.reduce((s, r) => s + r.rating, 0) / safeReviews.length;
  }, [safeReviews]);

  const highlights = useMemo(() => parseHighlights(product.highlights), [product.highlights]);
  const specGroups = useMemo(() => parseSpecGroups(product.specifications), [product.specifications]);
  const boxItems = useMemo(() => parseBoxContents(product.boxContents), [product.boxContents]);
  const badges = useMemo(() => productBadges(product), [product]);

  // -- Compare Drawer State --
  const [isCompareDrawerOpen, setIsCompareDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSecondProduct, setSelectedSecondProduct] = useState<number | null>(null);
  const [compared, setCompared] = useState(false);

  useEffect(() => {
    const checkCompare = () => setCompared(getCompare().some((i) => i.id === product.id));
    checkCompare();
    window.addEventListener("sms-compare-change", checkCompare);
    return () => window.removeEventListener("sms-compare-change", checkCompare);
  }, [product.id]);

  // Hydrate wishlist heart from the logged-in customer's saved items so it
  // reflects true state on load instead of always starting unfilled.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Guests have no wishlist to read. Checking the session first keeps
        // every product view from firing a request that can only ever answer
        // 401 and log a console error for anyone who is not signed in.
        const session = await fetchSession();
        if (cancelled) return;
        if (!session.customer) return;

        // Reads through lib/wishlist rather than fetching again here. The
        // related-product cards further down this same page derive their
        // hearts from that shared state, so a second independent fetch would
        // mean two sources of truth for the same product on one screen.
        await ensureWishlistLoaded();
        if (!cancelled) setWished(isWishlisted(product.id));
      } catch {
        // Any failure here simply leaves the heart unfilled.
      } finally {
        if (!cancelled) setWishReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [product.id]);

  useEffect(() => {
    if (!isCompareDrawerOpen) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const queryParam = searchQuery.trim() ? `search=${encodeURIComponent(searchQuery)}&` : "";
        const r = await fetch(`/api/products?${queryParam}limit=10`);
        const d = await r.json();
        setSearchResults((d.items || []).filter((p: any) => p.id !== product.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, isCompareDrawerOpen, product.id]);

  function openCompareDrawer() {
    setIsCompareDrawerOpen(true);
    setSearchQuery("");
    setSelectedSecondProduct(null);
  }

  function handleCompareNow() {
    if (!selectedSecondProduct) return;
    clearCompare();
    toggleCompare({
      id: product.id, slug: product.slug, name: product.name, brand: product.brand,
      mrp: displayMrp, mop: displayMop, primaryImage: currentVariant?.image || product.primaryImage || safeImages[0] || "",
      stock: displayStock, lowStockThreshold: product.lowStockThreshold || 5,
    });
    const p2 = searchResults.find(p => p.id === selectedSecondProduct);
    if (p2) {
      toggleCompare({
        id: p2.id, slug: p2.slug, name: p2.name, brand: p2.brand,
        mrp: p2.mrp, mop: p2.mop, primaryImage: p2.primaryImage || p2.images?.[0] || "",
        stock: p2.stock, lowStockThreshold: p2.lowStockThreshold || 5,
      });
    }
    router.push("/compare");
  }

  /**
   * Reason the purchase buttons must stay disabled, or "" when the current
   * selection is buyable. Checked again inside `add()` so a stale render can't
   * push an unbuyable line into the cart.
   */
  const blockedReason = invalidCombination
    ? "Unavailable combination"
    : variantUnavailable
      ? "Unavailable"
      : out
        ? "Out of Stock"
        : hasVariants && !selectedConfig && !selectedColor
          ? "Select a variant"
          : "";

  /**
   * Adds the exact selected variant to the cart. The cart line carries the
   * variantId, its label and SKU so the cart, checkout and order all record the
   * combination the shopper actually chose. `busy` gates re-entry, which is what
   * stops a double click adding the quantity twice.
   */
  function add(buyNow = false) {
    if (blockedReason || busy) return;
    setActionError("");

    if (hasVariants && !currentVariant) {
      setActionError("Please choose an available colour and storage combination.");
      return;
    }
    const wanted = Math.min(Math.max(1, qty), maxQty);
    if (displayStock < wanted) {
      setActionError(`Only ${displayStock} left in stock.`);
      return;
    }

    setBusy(buyNow ? "buy" : "cart");
    try {
      const label = currentVariant ? variantLabelOf(currentVariant) : "";
      addToCart(
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          brand: product.brand,
          mrp: displayMrp,
          mop: displayMop,
          image: currentVariant?.image || product.primaryImage || safeImages[0] || "",
          stock: displayStock,
          variantId: currentVariant?.id,
          variantLabel: label || undefined,
          sku: displaySku || undefined,
        },
        wanted
      );

      if (buyNow) {
        router.push("/checkout");
        return;
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } catch {
      setActionError("Could not update your cart. Please try again.");
    } finally {
      // Buy Now navigates away; clearing here still leaves the button usable if
      // the shopper comes back with the browser's back button.
      setBusy("");
    }
  }

  const purchaseState: PurchaseState = {
    qty,
    maxQty,
    setQty: (n) => setQty(Math.min(Math.max(1, n), maxQty)),
    blockedReason,
    busy,
    added,
    error: actionError,
    price: displayMop * qty,
    onAdd: () => add(false),
    onBuy: () => add(true),
  };

  async function shareProduct() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = { title: product.name, text: product.name, url };
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 1500);
    } catch {}
  }

  // Reflects a change made anywhere else on the page — most obviously the
  // related-product card for this same product further down.
  useEffect(() => onWishlistChange(() => setWished(isWishlisted(product.id))), [product.id]);

  async function toggleWish(e: React.MouseEvent) {
    e.preventDefault();
    const result = await toggleWishlist(product.id);
    if (result === "unauthorized") router.push("/login?redirect=/products/" + product.slug);
  }

  // The variant's own photo leads the gallery when it has one, and the gallery
  // itself filters the rest of the media by the selected colour.
  const galleryForSelection: ProductMedia[] = useMemo(() => {
    const variantImage = currentVariant?.image?.trim();
    if (!variantImage) return galleryMedia;
    const rest = galleryMedia.filter((m) => m.url !== variantImage);
    const existing = galleryMedia.find((m) => m.url === variantImage);
    return [
      existing || {
        id: 0,
        url: variantImage,
        alt: `${product.name} ${currentVariant?.color || ""}`.trim(),
        variantColor: currentVariant?.color || "",
        mediaType: "image",
        sortOrder: -1,
      },
      ...rest,
    ];
  }, [galleryMedia, currentVariant?.image, currentVariant?.color, product.name]);

  const mainImage = currentVariant?.image || product.primaryImage || safeImages[0] || "";

  return (
    <div className="bg-white pb-12 dark:bg-slate-950 relative w-full overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 w-full">

        {/* Breadcrumb — SLOT: category/brand trail */}
        <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-blue-600 hover:underline">Home</Link>
          <span>/</span>
          <Link
            href={product.category?.slug ? `/products?category=${product.category.slug}` : "/products"}
            className="hover:text-blue-600 hover:underline"
          >
            {product.category?.name || "All Products"}
          </Link>
          {product.brand && (
            <>
              <span>/</span>
              <Link href={`/products?brand=${encodeURIComponent(product.brand)}`} className="hover:text-blue-600 hover:underline">{product.brand} Mobiles</Link>
            </>
          )}
          <span>/</span>
          <span className="truncate text-slate-700 dark:text-slate-300 font-medium">{product.name}</span>
        </nav>

        {/* TOP: Gallery (left) + Sticky details rail (right) — matches Flipkart PDP structure */}
        <div className="flex flex-col md:flex-row items-start w-full gap-8 md:gap-10">

          {/* LEFT COLUMN: Gallery — all media is admin managed (product_images) */}
          <div className="w-full min-w-0 shrink-0 md:sticky md:top-24 md:w-5/12">
            <ProductGallery
              key={selectedColor || "default"}
              media={galleryForSelection}
              productName={product.name || "Product"}
              activeColor={selectedColor}
            >
              <button
                type="button"
                onClick={toggleWish}
                aria-pressed={wished}
                aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
                disabled={!wishReady}
                className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-rose-500 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:bg-slate-800"
              >
                <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill={wished ? "#f43f5e" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" strokeLinejoin="round" /></svg>
              </button>
              <button
                type="button"
                title={shareState === "copied" ? "Link copied" : "Share"}
                aria-label="Share this product"
                onClick={shareProduct}
                className="absolute right-14 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500 shadow-md transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:bg-slate-800"
              >
                {shareState === "copied" ? (
                  <svg viewBox="0 0 24 24" className="h-[16px] w-[16px] text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                )}
              </button>
              <span aria-live="polite" className="sr-only">
                {shareState === "copied" ? "Product link copied to clipboard" : ""}
              </span>
            </ProductGallery>
          </div>
          {/* RIGHT COLUMN: Details, offers, buy box — sticky as a whole so the
              price/CTA stay visible while the buyer reads through offers below */}
          <div className="w-full md:w-7/12 flex flex-col shrink-0 min-w-0 md:sticky md:top-24 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto scrollbar-hide">

            {/* Header / Title Row — SLOT: product.brand, product.name, product.subcategory */}
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">{product.brand || "Brand"}</p>
            <h1 className="text-[22px] md:text-[24px] font-bold leading-snug tracking-tight text-slate-900 dark:text-white">
              {product.name || "Product name"}
            </h1>
            {product.subcategory && (
              <p className="mt-0.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">{product.subcategory}</p>
            )}

            {/* Badges — every flag below is an admin toggle on the product row */}
            {badges.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {badges.map((b) => (
                  <span
                    key={b.key}
                    className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${b.tone}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            )}

            {/* Rating / Reviews / Availability / SKU row */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <a href="#reviews" className="flex items-center gap-1 rounded border border-emerald-700 bg-emerald-700 px-1.5 py-0.5 text-[13px] font-bold text-white">
                {avg > 0 ? avg.toFixed(1) : "New"} <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
              </a>
              <a href="#reviews" className="text-sm font-medium text-slate-500 hover:underline">{safeReviews.length} review{safeReviews.length !== 1 ? 's' : ''}</a>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className={`flex items-center gap-1 text-[13px] font-semibold ${out ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                {out ? "Out of stock" : "In stock"}
              </span>
              {displaySku && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">SKU: {displaySku}</span>
                </>
              )}
            </div>


            {/* Pricing Block — SLOT: product.mrp / product.mop / variant pricing.
                Clear MRP / selling price / discount / savings hierarchy instead
                of a single line of text. */}
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[30px] font-extrabold text-slate-900 dark:text-white tracking-tight">₹{displayMop.toLocaleString("en-IN")}</span>
                {Number(displayMrp) > displayMop && (
                  <span className="text-[16px] line-through text-slate-500 dark:text-slate-400 font-medium">₹{Number(displayMrp).toLocaleString("en-IN")}</span>
                )}
                {off > 0 && (
                  <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[13px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">{off}% off</span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">Inclusive of all taxes</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400">
                <span>MRP <span className="font-semibold text-slate-600 dark:text-slate-300">₹{Number(displayMrp).toLocaleString("en-IN")}</span></span>
                {Number(displayMrp) > displayMop && (
                  <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" /></svg>
                    You Save ₹{(Number(displayMrp) - displayMop).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
              {product.protectPromiseFee && (
                <p className="mt-1.5 flex w-fit items-center gap-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
                  {formatINR(product.protectPromiseFee)} additional charge
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-200/70 pt-2.5 text-[12.5px] font-medium text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                EMI starts at ₹{emiStartPrice.toLocaleString("en-IN")}/month
                <button
                  type="button"
                  onClick={() => setEmiModalOpen(true)}
                  className="text-blue-600 border-b border-blue-600/30 hover:border-blue-600 ml-0.5 transition-colors rounded-none pb-[1px] inline-flex items-center gap-0.5"
                >
                  View EMI Plans <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>

            {/* Compare row */}
            <div className="flex flex-wrap gap-6 pt-4 border-t border-b border-slate-100 dark:border-slate-800 py-4 mt-4">
              <button onClick={openCompareDrawer} className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">
                 <svg viewBox="0 0 24 24" className={`h-5 w-5 ${compared ? "text-blue-600" : "text-slate-500"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>
                 Add to Compare
              </button>
            </div>

            {/* Offers Section — Flipkart "WOW! DEAL" style — SLOT: real admin-managed offers */}
            {!out && safeOffers.length > 0 && (
              <div className="mt-6">
                <div className="rounded-2xl bg-blue-600 p-4 shadow-lg">
                  <h4 className="flex items-center gap-2 text-white font-black text-[15px] mb-3">
                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] tracking-wide">WOW!</span> DEAL — Apply offers for maximum savings
                  </h4>
                  <div className="rounded-xl bg-white dark:bg-slate-950 p-4 space-y-4">
                    {bestOffer && (
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-[20px] font-bold text-slate-900 dark:text-white">₹{Math.round(bankOfferPrice).toLocaleString("en-IN")}</p>
                          <p className="text-[11px] text-slate-500 font-medium">Lowest price for you</p>
                        </div>
                        <span className="text-[11px] text-slate-400 font-bold">OR</span>
                        <div className="text-right">
                          <p className="text-[15px] font-bold text-slate-900 dark:text-white">₹{emiStartPrice.toLocaleString("en-IN")} x 12m</p>
                          <p className="text-[11px] text-slate-500 font-medium">Pay ₹{displayMop.toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                      <p className="text-[12px] font-bold text-slate-900 dark:text-white">Available offers</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {safeOffers.map((o) => {
                          const iconBg =
                            o.type === "bank" ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" :
                            o.type === "upi" ? "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400" :
                            o.type === "emi" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" :
                            o.type === "exchange" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" :
                            "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";

                          if (o.type === "emi") {
                            const tenures = String(o.emiTenures || "").split(",").map((s) => s.trim()).filter(Boolean);
                            return (
                              <div key={o.id} className="flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${iconBg}`}><OfferTypeIcon type="emi" className="h-3.5 w-3.5" /></span>
                                <div className="min-w-0">
                                  <p className="text-[12px] font-bold text-slate-900 dark:text-white">
                                    {o.noCostEmi ? "No Cost EMI" : "EMI"} <span className="font-medium text-slate-500">{o.provider || o.title}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {tenures.length > 0 && `${tenures.join("/")} months`}
                                    {!o.noCostEmi && o.emiInterestRate != null && ` · ${Number(o.emiInterestRate)}% p.a.`}
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          if (o.type === "exchange") {
                            return (
                              <div key={o.id} className="flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
                                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${iconBg}`}><OfferTypeIcon type="exchange" className="h-3.5 w-3.5" /></span>
                                <div className="min-w-0">
                                  <p className="text-[12px] font-bold text-slate-900 dark:text-white">
                                    {o.maxExchangeValue != null ? `Up to ₹${Number(o.maxExchangeValue).toLocaleString("en-IN")}` : "Exchange"} <span className="font-medium text-slate-500">{o.title}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-500">{o.exchangeEligibility || o.description}</p>
                                </div>
                              </div>
                            );
                          }

                          const discount = offerDiscountFor(o, displayMop);
                          const qualifies = discount > 0;
                          const offText =
                            o.discountType === "fixed"
                              ? `₹${Number(o.discountValue).toLocaleString("en-IN")} off`
                              : `${Number(o.discountValue)}% off`;
                          return (
                            <div key={o.id} className={`flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 ${qualifies ? "" : "opacity-60"}`}>
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${iconBg}`}><OfferTypeIcon type={o.type} className="h-3.5 w-3.5" /></span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-bold text-slate-900 dark:text-white">{offText} <span className="font-medium text-slate-500">{o.provider || o.title}</span></p>
                                <p className="text-[10px] text-slate-500">
                                  {o.description}
                                  {!qualifies && Number(o.minOrder) > 0 && ` · min order ₹${Number(o.minOrder).toLocaleString("en-IN")}`}
                                </p>
                              </div>
                              {qualifies && <span className="shrink-0 text-[11px] font-bold text-emerald-600">Eligible</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setAllOffersOpen((v) => !v)}
                  className="mt-3 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/40">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" /><path d="m9.5 12.5 1.8 1.8 3.7-3.9" /></svg>
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">All Offers and Discounts</span>
                  </span>
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${allOffersOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                {allOffersOpen && (
                  <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                    {bestOffer && (
                      <div className="flex gap-2.5">
                        <span className="mt-0.5 text-emerald-500">•</span>
                        <p className="text-slate-600 dark:text-slate-300"><b className="text-slate-900 dark:text-white">{bestOffer.offer.title}:</b> Instant discount up to ₹{Math.round(bankDiscount).toLocaleString("en-IN")}. {bestOffer.offer.description}</p>
                      </div>
                    )}
                    {emiOffers.map((o) => {
                      const tenures = String(o.emiTenures || "").split(",").map((s) => s.trim()).filter(Boolean);
                      return (
                        <div key={o.id} className="flex gap-2.5">
                          <span className="mt-0.5 text-emerald-500">•</span>
                          <p className="text-slate-600 dark:text-slate-300">
                            <b className="text-slate-900 dark:text-white">{o.noCostEmi ? "No Cost EMI" : "EMI"}{o.provider ? ` (${o.provider})` : ""}:</b>{" "}
                            {tenures.length > 0 ? `Available on ${tenures.join("/")}-month plans.` : "Available."}
                          </p>
                        </div>
                      );
                    })}
                    {product.warranty && (
                      <div className="flex gap-2.5">
                        <span className="mt-0.5 text-emerald-500">•</span>
                        <p className="text-slate-600 dark:text-slate-300"><b className="text-slate-900 dark:text-white">Warranty:</b> {product.warranty}</p>
                      </div>
                    )}
                    {safeOffers.filter((o) => o.type === "exchange").map((o) => (
                      <div key={o.id} className="flex gap-2.5">
                        <span className="mt-0.5 text-emerald-500">•</span>
                        <p className="text-slate-600 dark:text-slate-300">
                          <b className="text-slate-900 dark:text-white">Exchange:</b>{" "}
                          {o.maxExchangeValue != null ? `Get up to ₹${Number(o.maxExchangeValue).toLocaleString("en-IN")} instant valuation for your old device.` : "Get an instant valuation for your old device in-store."}
                          {o.exchangeEligibility ? ` ${o.exchangeEligibility}.` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Protect Promise — informational, not a fake clickable chevron */}
            {product.protectPromiseFee && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Protect Promise</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-600 dark:text-slate-400">
                    Genuine product, safe delivery and easy replacement guaranteed. Includes a {formatINR(product.protectPromiseFee)} protection charge on this item.
                  </p>
                </div>
              </div>
            )}

            {/* Variants + delivery — every option below is a real variant row */}
            <div className="mt-6 space-y-5">
              <VariantPicker
                matrix={matrix}
                selectedColor={selectedColor}
                selectedConfig={selectedConfig}
                onColor={chooseColor}
                onConfig={chooseConfig}
              />

              {invalidCombination && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  This colour and storage combination is not available. Pick another option to see its price and stock.
                </p>
              )}

              <DeliveryCheck orderValue={displayMop * qty} />
              {/* Seller row — SLOT: product.sellerName / sellerRating / sellerYears */}
              {product.sellerName && (
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 text-sm">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h13v13H3z" /><path d="M16 8h4l3 4v4h-7V8z" /><circle cx="7.5" cy="18.5" r="1.5" /><circle cx="17.5" cy="18.5" r="1.5" /></svg>
                    <span className="text-slate-600 dark:text-slate-300">Fulfilled by</span>
                    <span className="font-bold text-slate-900 dark:text-white">{product.sellerName}</span>
                    {product.sellerRating && (
                      <span className="flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                        {Number(product.sellerRating).toFixed(1)} ★
                      </span>
                    )}
                    {product.sellerYears ? (
                      <span className="text-slate-500 dark:text-slate-400">· {product.sellerYears} years with us</span>
                    ) : null}
                  </div>
                  <Link
                    href={product.category?.slug ? `/products?category=${product.category.slug}` : "/products"}
                    className="shrink-0 text-sm font-bold text-blue-600 hover:underline"
                  >
                    See other sellers
                  </Link>
                </div>
              )}
            </div>

            {/* Purchase actions — quantity, cart and checkout for the selected variant */}
            <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
              <QuantitySelector
                qty={qty}
                maxQty={maxQty}
                setQty={purchaseState.setQty}
                disabled={!!blockedReason}
              />
              <PurchaseButtons state={purchaseState} />
              <p aria-live="polite" className="min-h-[18px] text-[12.5px] font-semibold">
                {actionError ? (
                  <span className="text-rose-500">{actionError}</span>
                ) : added ? (
                  <span className="text-emerald-600">
                    Added to cart.{" "}
                    <Link href="/cart" className="underline">View cart</Link>
                  </span>
                ) : blockedReason && hasVariants ? (
                  <span className="text-slate-500">
                    {blockedReason === "Out of Stock"
                      ? "This variant is out of stock right now."
                      : "Choose an available variant to continue."}
                  </span>
                ) : null}
              </p>
              {/* Back-in-stock capture — only when the exact selection is sold
                  out. Subscribes to the selected variant when there is one, so
                  the restock email fires for the thing the shopper wanted. */}
              {blockedReason === "Out of Stock" && (
                <StockAlertForm productId={product.id} variantId={currentVariant?.id} />
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM FULL WIDTH: content, specs and reviews — all admin/database driven */}
        <div className="mt-16 grid w-full gap-12 border-t border-slate-100 pt-16 dark:border-slate-800 lg:grid-cols-3">
          <div className="w-full lg:col-span-2">



            {highlights.length > 0 && (
              <section>
                <h2 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white mb-5">Product highlights</h2>
                <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                  {highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-4 p-4">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <HighlightIcon icon={h.icon} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{h.detail}</p>
                        {h.headline && <p className="text-[15px] font-bold text-slate-900 dark:text-white mt-0.5">{h.headline}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {product.description && (
              <section className={highlights.length > 0 ? "mt-12" : ""}>
                <h2 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white">About this product</h2>
                <p className="mt-4 leading-relaxed text-slate-600 dark:text-slate-300 text-[15px]">{product.description}</p>
              </section>
            )}

            {(specGroups.length > 0 || boxItems.length > 0 || product.warranty) && (
              <div className="mt-12 space-y-8">
                {specGroups.length > 0 && (
                  <Collapsible title="Specifications">
                    <SpecTable groups={specGroups} />
                  </Collapsible>
                )}
                {boxItems.length > 0 && (
                  <Collapsible title="What's in the box">
                    <BoxContents items={boxItems} />
                  </Collapsible>
                )}
                {product.warranty && (
                  <Collapsible title="Warranty">
                    <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">{product.warranty}</p>
                  </Collapsible>
                )}
              </div>
            )}

            <div className="mt-12">
              <ReviewsSection
                productId={product.id}
                productSlug={product.slug}
                productName={product.name}
                initialReviews={safeReviews}
              />
            </div>

            <div className="mt-14">
              <QuestionsSection
                productId={product.id}
                productSlug={product.slug}
                productName={product.name}
                initialQuestions={safeQuestions}
              />
            </div>
          </div>
        </div>

        {safeRelated.length > 0 && (
          <section className="mt-16 w-full border-t border-slate-100 pt-12 dark:border-slate-800">
            <h2 className="mb-6 text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">Similar products</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {safeRelated.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        {safeSameBrand.length > 0 && (
          <section className="mt-14 w-full border-t border-slate-100 pt-10 dark:border-slate-800">
            <h2 className="mb-6 text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
              More from {product.brand}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {safeSameBrand.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        <RecentlyViewedRail currentProductId={product.id} />
      </div>

      <StickyPurchaseBar state={purchaseState} />

      {/* --- EMI PLANS MODAL — real admin-configured EMI offers only --- */}
      {emiModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4" onClick={() => setEmiModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-950 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">EMI Plans</h3>
              <button onClick={() => setEmiModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">On this ₹{displayMop.toLocaleString("en-IN")} purchase</p>

            {emiOffers.length === 0 ? (
              <p className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                No EMI plans are configured for this product yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {emiOffers.map((o) => {
                  const tenures = String(o.emiTenures || "").split(",").map((s) => s.trim()).filter(Boolean);
                  const rate = o.noCostEmi ? 0 : Number(o.emiInterestRate || 0);
                  const eligible = o.minPurchaseAmount == null || displayMop >= Number(o.minPurchaseAmount);
                  return (
                    <div key={o.id} className={`rounded-xl border border-slate-100 p-4 dark:border-slate-800 ${eligible ? "" : "opacity-50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                            <OfferTypeIcon type="emi" className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{o.provider || o.title}</p>
                            {o.noCostEmi && <span className="text-[11px] font-bold text-emerald-600">No Cost EMI</span>}
                          </div>
                        </div>
                        {!eligible && <span className="text-[11px] font-semibold text-rose-500">Min ₹{Number(o.minPurchaseAmount).toLocaleString("en-IN")}</span>}
                      </div>

                      {tenures.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {tenures.map((t) => {
                            const months = Number(t);
                            const totalWithInterest = rate > 0 ? displayMop * (1 + (rate / 100) * (months / 12)) : displayMop;
                            const monthly = Math.round(totalWithInterest / months);
                            return (
                              <div key={t} className="rounded-lg bg-slate-50 px-2.5 py-2 text-center dark:bg-slate-900">
                                <p className="text-[13px] font-bold text-slate-900 dark:text-white">₹{monthly.toLocaleString("en-IN")}</p>
                                <p className="text-[10.5px] text-slate-500">{t} months</p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <p className="mt-2.5 text-[11.5px] text-slate-500">
                        {o.noCostEmi ? "0% interest — no cost to you" : rate > 0 ? `${rate}% p.a. interest` : "Interest rate not disclosed"}
                        {o.processingFee != null && ` · ₹${Number(o.processingFee).toLocaleString("en-IN")} processing fee`}
                      </p>
                      {o.description && <p className="mt-1 text-[11.5px] text-slate-400">{o.description}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- COMPARE DRAWER --- */}
      {isCompareDrawerOpen && (
        <div className="relative z-50">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setIsCompareDrawerOpen(false)} />

          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-white dark:bg-slate-950 shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out]">

            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Compare</h2>
              <button onClick={() => setIsCompareDrawerOpen(false)} className="text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>

            <div className="p-6 bg-slate-50/50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex flex-row items-center gap-3 w-full">
                <div className="flex-1 w-0 flex flex-col items-center bg-white dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[160px]">
                   <div className="h-16 w-full mb-3 flex items-center justify-center">
                     <SafeImage src={mainImage} alt={product.name} className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
                   </div>
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-1 truncate w-full">{product.brand}</p>
                   <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center leading-tight clamp-2 mb-1 w-full">{product.name}</p>
                   <p className="text-sm font-black text-blue-600 mt-auto">₹{Number(displayMop).toLocaleString("en-IN")}</p>
                </div>

                <div className="shrink-0 grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">VS</span>
                </div>

                {selectedSecondProduct ? (
                  <div className="flex-1 w-0 flex flex-col items-center bg-white dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative cursor-pointer min-h-[160px]" onClick={() => setSelectedSecondProduct(null)}>
                     <button className="absolute top-1.5 right-1.5 text-slate-500 hover:text-rose-500 bg-white dark:bg-slate-800 rounded-full shadow-sm p-0.5">
                       <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
                     </button>
                     <div className="h-16 w-full mb-3 flex items-center justify-center">
                       <SafeImage src={searchResults.find(p => p.id === selectedSecondProduct)?.primaryImage || searchResults.find(p => p.id === selectedSecondProduct)?.images?.[0]} alt="" className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
                     </div>
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center mb-1 truncate w-full">{searchResults.find(p => p.id === selectedSecondProduct)?.brand}</p>
                     <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center leading-tight clamp-2 mb-1 w-full">{searchResults.find(p => p.id === selectedSecondProduct)?.name}</p>
                     <p className="text-sm font-black text-blue-600 mt-auto">₹{Number(searchResults.find(p => p.id === selectedSecondProduct)?.mop).toLocaleString("en-IN")}</p>
                  </div>
                ) : (
                  <div className="flex-1 w-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs font-semibold text-center min-h-[160px]">
                     Select item<br/>below
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-950">
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">Select another product</p>
              <div className="relative">
                <svg viewBox="0 0 24 24" className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search for a product to compare"
                  type="search"
                  placeholder="Search for mobiles and brands"
                  className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-white dark:bg-slate-950">
              {searching ? (
                <p className="text-sm text-center text-slate-500 py-8">Searching...</p>
              ) : searchResults.length > 0 ? (
                searchResults.map((res) => {
                  const resOff = Math.round(((Number(res.mrp) - Number(res.mop)) / Number(res.mrp)) * 100);
                  const isSelected = selectedSecondProduct === res.id;
                  return (
                    <div
                      key={res.id}
                      onClick={() => setSelectedSecondProduct(res.id)}
                      className={`flex flex-row items-center gap-4 p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/50 border-b-slate-100 dark:border-b-slate-800'}`}
                    >
                      <div className="h-12 w-12 bg-white dark:bg-slate-800 rounded p-1 shrink-0 border border-slate-100 dark:border-slate-700 flex items-center justify-center">
                        <SafeImage src={res.primaryImage || res.images?.[0]} alt={res.name} className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">{res.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider font-semibold">{res.brand}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-black text-slate-900 dark:text-white">₹{Number(res.mop).toLocaleString("en-IN")}</span>
                          {resOff > 0 && <span className="text-[10px] font-bold text-red-500">{resOff}% Off</span>}
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                        {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                      </div>
                    </div>
                  );
                })
              ) : searchQuery ? (
                <p className="text-sm text-center text-slate-500 py-8">No products found.</p>
              ) : (
                <p className="text-sm text-center text-slate-500 py-10 font-medium">Type in the search bar above<br/>to find a product to compare.</p>
              )}
            </div>

            {selectedSecondProduct && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
                <button onClick={handleCompareNow} className="w-full bg-slate-900 text-white font-black py-3.5 rounded-lg hover:bg-slate-800 transition dark:bg-white dark:text-slate-900 tracking-wide uppercase text-sm">
                  Compare Now
                </button>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}