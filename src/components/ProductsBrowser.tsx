"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductCard, { CardProduct } from "./ProductCard";

type Cat = { id: number; name: string; slug: string };

// Debounce delay for text/number inputs before they're written to the URL.
// Selects and category pills commit immediately since they're discrete
// choices, not keystrokes.
const URL_SYNC_DEBOUNCE_MS = 400;

export default function ProductsBrowser({
  products,
  brands,
  categories,
  initialSearch = "",
  initialCategory = "",
  initialBrand = "",
  initialMinPrice = "",
  initialMaxPrice = "",
  initialMinDiscount = "",
  initialSort = "newest",
}: {
  products: CardProduct[];
  brands: string[];
  categories: Cat[];
  initialSearch?: string;
  initialCategory?: string;
  initialBrand?: string;
  initialMinPrice?: string;
  initialMaxPrice?: string;
  initialMinDiscount?: string;
  initialSort?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);

  // Format the initial brand to match our clean list
  const cleanInitialBrand = initialBrand.replace(/["']/g, "").trim();
  const formattedInitialBrand = cleanInitialBrand
    ? cleanInitialBrand.charAt(0).toUpperCase() + cleanInitialBrand.slice(1).toLowerCase()
    : "";

  const [brand, setBrand] = useState(formattedInitialBrand);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [minDiscount, setMinDiscount] = useState(initialMinDiscount);
  const [sort, setSort] = useState(initialSort || "newest");
  const [showFilters, setShowFilters] = useState(false);

  // Keep local input state in sync when the URL changes from outside this
  // component (Back/Forward, a category pill, a header search submit,
  // etc.) — otherwise the inputs would keep showing stale values after
  // browser navigation even though the URL (and server-filtered products)
  // have moved on. Adjusted during render (React's documented pattern for
  // deriving state from a changed input) rather than in an effect, so the
  // sync happens before paint instead of one render behind.
  const searchParamsKey = searchParams.toString();
  const [syncedKey, setSyncedKey] = useState(searchParamsKey);
  if (syncedKey !== searchParamsKey) {
    setSyncedKey(searchParamsKey);
    setSearch(searchParams.get("search") || "");
    const b = (searchParams.get("brand") || "").replace(/["']/g, "").trim();
    setBrand(b ? b.charAt(0).toUpperCase() + b.slice(1).toLowerCase() : "");
    setMinPrice(searchParams.get("minPrice") || "");
    setMaxPrice(searchParams.get("maxPrice") || "");
    setMinDiscount(searchParams.get("minDiscount") || "");
    setSort(searchParams.get("sort") || "newest");
  }

  const currentCategory = searchParams.get("category") || "";
  const currentCategoryId = currentCategory
    ? categories.find((c) => c.slug === currentCategory)?.id ?? null
    : null;

  // Builds the next URL from the current query string plus the given
  // overrides, dropping any key whose new value is empty/default so the
  // URL stays clean and shareable. Category is always preserved unless
  // explicitly overridden, so switching search/sort/filters never loses
  // the category the user drilled into.
  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value && value !== "" && !(key === "sort" && value === "newest")) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams]
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushDebounced = useCallback(
    (overrides: Record<string, string | undefined>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        router.push(buildUrl(overrides), { scroll: false });
      }, URL_SYNC_DEBOUNCE_MS);
    },
    [buildUrl, router]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function onSearchChange(v: string) {
    setSearch(v);
    pushDebounced({ search: v });
  }
  function onBrandChange(v: string) {
    setBrand(v);
    router.push(buildUrl({ brand: v }), { scroll: false });
  }
  function onMinPriceChange(v: string) {
    setMinPrice(v);
    pushDebounced({ minPrice: v });
  }
  function onMaxPriceChange(v: string) {
    setMaxPrice(v);
    pushDebounced({ maxPrice: v });
  }
  function onMinDiscountChange(v: string) {
    setMinDiscount(v);
    pushDebounced({ minDiscount: v });
  }
  function onSortChange(v: string) {
    setSort(v);
    router.push(buildUrl({ sort: v }), { scroll: false });
  }
  function clearFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch("");
    setBrand("");
    setMinPrice("");
    setMaxPrice("");
    setMinDiscount("");
    router.push(buildUrl({ search: "", brand: "", minPrice: "", maxPrice: "", minDiscount: "" }), { scroll: false });
  }

  // Clean and deduplicate brands for the dropdown.
  //
  // Title-casing each entry (upper first letter + lowercase remainder) used
  // to mangle real brand names with internal capitals — "OnePlus" rendered as
  // "Oneplus", "realme" as "Realme" — which looks careless next to the
  // correctly-cased brand shown on the product cards. The name as the store
  // owner typed it in Admin is authoritative, so it is preserved verbatim and
  // only de-duplicated case-insensitively (keeping the first spelling seen).
  const cleanBrandsList = useMemo(() => {
    const seen = new Map<string, string>();
    for (const raw of brands) {
      const name = (raw || "").replace(/["']/g, "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [brands]);

  // Products are already filtered by search/brand/price/discount/sort
  // server-side (see app/products/page.tsx -> getProducts), and we also
  // re-apply those same filters client-side below so the UI feels instant
  // while the debounced URL write is in flight. Category was previously
  // NOT re-applied here, relying entirely on the server having re-run
  // getProducts() with the new category on navigation. Next.js App Router
  // client-side navigation doesn't always force that server re-fetch, so a
  // category link/pill could update the URL and highlight state without
  // actually re-filtering the list — showing all products regardless of
  // which category was clicked. Re-checking currentCategory here makes
  // filtering correct on every navigation, independent of server refetch
  // timing.
  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      if (currentCategoryId != null && p.categoryId !== currentCategoryId) return false;

      // Mirrors the server-side token matching in getProducts() so the
      // instant client-side list and the server result never disagree: every
      // whitespace-separated token must appear somewhere in the product's
      // name, brand, SKU or subcategory. Matching the raw phrase meant
      // "samsung s24" found nothing while each word alone matched.
      if (search) {
        const haystack = [p.name, p.brand, (p as { sku?: string | null }).sku, (p as { subcategory?: string | null }).subcategory]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }

      // Case-insensitive & quote-insensitive brand comparison
      if (brand) {
        const pBrandClean = (p.brand || "").replace(/["']/g, "").trim().toLowerCase();
        const searchBrandClean = brand.replace(/["']/g, "").trim().toLowerCase();
        if (pBrandClean !== searchBrandClean) return false;
      }

      if (minPrice && Number(p.mop) < Number(minPrice)) return false;
      if (maxPrice && Number(p.mop) > Number(maxPrice)) return false;
      if (minDiscount) {
        const m = Number(p.mrp);
        const d = m > 0 ? Math.round(((m - Number(p.mop)) / m) * 100) : 0;
        if (d < Number(minDiscount)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "price-asc") return Number(a.mop) - Number(b.mop);
      if (sort === "price-desc") return Number(b.mop) - Number(a.mop);
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.id - a.id;
    });
    return list;
  }, [products, currentCategoryId, search, brand, minPrice, maxPrice, minDiscount, sort]);

  const activeCategoryName = currentCategory
    ? categories.find((c) => c.slug === currentCategory)?.name
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold">{activeCategoryName || "All Products"}</h1>
        <span className="text-sm text-slate-500">{filtered.length} items</span>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium md:hidden dark:border-slate-700"
        >
          {showFilters ? "Hide Filters" : "Filters"}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className={`${showFilters ? "block" : "hidden"} md:block`}>
          <div className="card-hover sticky top-24 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <label htmlFor="pf-search" className="text-xs font-semibold uppercase text-slate-500">Search</label>
              <input id="pf-search" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Name or brand" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div>
              <label htmlFor="pf-brand" className="text-xs font-semibold uppercase text-slate-500">Brand</label>
              <select id="pf-brand" value={brand} onChange={(e) => onBrandChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option value="">All brands</option>
                {cleanBrandsList.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pf-min" className="text-xs font-semibold uppercase text-slate-500">Min ₹</label>
                <input id="pf-min" value={minPrice} onChange={(e) => onMinPriceChange(e.target.value)} type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label htmlFor="pf-max" className="text-xs font-semibold uppercase text-slate-500">Max ₹</label>
                <input id="pf-max" value={maxPrice} onChange={(e) => onMaxPriceChange(e.target.value)} type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
              </div>
            </div>
            <div>
              <label htmlFor="pf-discount" className="text-xs font-semibold uppercase text-slate-500">Min discount %</label>
              <input id="pf-discount" value={minDiscount} onChange={(e) => onMinDiscountChange(e.target.value)} type="number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
            </div>
            <div>
              <label htmlFor="pf-sort" className="text-xs font-semibold uppercase text-slate-500">Sort by</label>
              <select id="pf-sort" value={sort} onChange={(e) => onSortChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800">
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Link
                href={buildUrl({ category: "" })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${!currentCategory ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={buildUrl({ category: c.slug })}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${currentCategory === c.slug ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
              <p className="text-lg font-semibold">No products match your filters</p>
              <p className="mt-1 text-sm text-slate-500">Try widening the price range or clearing the brand filter.</p>
              <button onClick={clearFilters} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p, i) => (
                // The widest layout is 4 across, so the first four cards are the
                // only ones reliably above the fold and the only ones that
                // should skip lazy-loading. One of them is the LCP element.
                <ProductCard key={p.id} p={p} priority={i < 4} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}