"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SafeImage from "./SafeImage";
import EmptyState from "./EmptyState";
import { ArrowLeftRight, X } from "lucide-react";
import { getCompare, removeFromCompare, toggleCompare, clearCompare, CompareItem } from "@/lib/compare";

function parseSpecifications(p: any): Record<string, string> {
  const map: Record<string, string> = {};
  if (!p) return map;

  if (p.brand) map["BRAND"] = p.brand;
  if (p.name) map["MODEL NAME"] = p.name;
  if (p.sku) map["SKU / MODEL NUMBER"] = p.sku;
  if (p.warranty) map["WARRANTY"] = p.warranty;
  
  if (p.mop) map["SELLING PRICE (MOP)"] = `₹${Number(p.mop).toLocaleString("en-IN")}`;
  if (p.mrp) map["MRP"] = `₹${Number(p.mrp).toLocaleString("en-IN")}`;

  if (p.mrp && p.mop && Number(p.mrp) > Number(p.mop)) {
    const save = Number(p.mrp) - Number(p.mop);
    const disc = Math.round((save / Number(p.mrp)) * 100);
    map["DISCOUNT & SAVINGS"] = `${disc}% Off (You save ₹${save.toLocaleString("en-IN")})`;
  } else {
    map["DISCOUNT & SAVINGS"] = "Standard MOP Price";
  }

  map["AVAILABILITY"] = (p.stock ?? 0) > 0 ? `In Stock (${p.stock} units)` : "Out of Stock";

  if (p.specifications) {
    const lines = String(p.specifications).split(/[\n,]/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let key = "";
      let val = "";
      if (trimmed.includes("|")) {
        const parts = trimmed.split("|");
        key = parts[0].trim().toUpperCase();
        val = parts.slice(1).join("|").trim();
      } else if (trimmed.includes(":")) {
        const parts = trimmed.split(":");
        key = parts[0].trim().toUpperCase();
        val = parts.slice(1).join(":").trim();
      }
      if (key && val) {
        map[key] = val;
      }
    });
  }

  return map;
}

type SpecGroup = {
  categoryTitle: string;
  keys: { label: string; key: string }[];
};

const COMPARISON_SECTIONS: SpecGroup[] = [
  {
    categoryTitle: "PRICE & AVAILABILITY",
    keys: [
      { label: "Selling Price (MOP)", key: "SELLING PRICE (MOP)" },
      { label: "MRP", key: "MRP" },
      { label: "Discount & Savings", key: "DISCOUNT & SAVINGS" },
      { label: "Stock Availability", key: "AVAILABILITY" },
      { label: "Warranty", key: "WARRANTY" },
    ],
  },
  {
    categoryTitle: "MANUFACTURER & GENERAL DETAILS",
    keys: [
      { label: "Brand", key: "BRAND" },
      { label: "Model Name", key: "MODEL NAME" },
      { label: "Model / SKU", key: "SKU / MODEL NUMBER" },
    ],
  },
  {
    categoryTitle: "DISPLAY & DESIGN",
    keys: [
      { label: "Display", key: "DISPLAY" },
      { label: "Screen Type / Resolution", key: "SCREEN" },
    ],
  },
  {
    categoryTitle: "PERFORMANCE & HARDWARE",
    keys: [
      { label: "Chipset / Processor", key: "CHIPSET" },
      { label: "RAM", key: "RAM" },
      { label: "Internal Storage", key: "STORAGE" },
    ],
  },
  {
    categoryTitle: "CAMERA & MULTIMEDIA",
    keys: [
      { label: "Primary Camera", key: "CAMERA" },
      { label: "Primary Camera Features", key: "PRIMARY CAMERA FEATURES" },
      { label: "Secondary / Front Camera", key: "SECONDARY CAMERA" },
      { label: "Video Recording", key: "VIDEO RECORDING" },
    ],
  },
  {
    categoryTitle: "BATTERY & POWER",
    keys: [
      { label: "Battery Capacity", key: "BATTERY" },
      { label: "Charging Speed", key: "CHARGING" },
    ],
  },
  {
    categoryTitle: "SOFTWARE & SYSTEM",
    keys: [
      { label: "OS Name & Version", key: "OS" },
      { label: "AI Features", key: "AI" },
    ],
  },
];

export default function CompareClient() {
  const router = useRouter();
  const [items, setItems] = useState<CompareItem[]>([]);
  const [fullProducts, setFullProducts] = useState<any[]>([]);
  const [allCatalogProducts, setAllCatalogProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showOnlyDifference, setShowOnlyDifference] = useState(false);
  const [swapSlotIndex, setSwapSlotIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Initial sync read from localStorage (no SSR equivalent) plus
    // subscribing to future compare-list changes and fetching the catalog.
    const currentItems = getCompare();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(currentItems);

    const onCh = () => setItems(getCompare());
    window.addEventListener("sms-compare-change", onCh);

    fetch("/api/products?limit=500")
      .then((r) => r.json())
      .then((d) => {
        const all = d.items || d || [];
        setAllCatalogProducts(all);
        const matched = currentItems.map((ci) => {
          const found = all.find((p: any) => p.id === ci.id);
          return found ? { ...found, primaryImage: found.primaryImage || ci.primaryImage } : ci;
        });
        setFullProducts(matched);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => window.removeEventListener("sms-compare-change", onCh);
  }, []);

  useEffect(() => {
    // Re-syncs fullProducts whenever the compare list or fetched catalog
    // changes — a genuine response to those two dependencies, not
    // something that can be computed inline during render since the
    // catalog is loaded asynchronously in the effect above.
    if (allCatalogProducts.length > 0) {
      const currentItems = getCompare();
      const matched = currentItems.map((ci) => {
        const found = allCatalogProducts.find((p: any) => p.id === ci.id);
        return found ? { ...found, primaryImage: found.primaryImage || ci.primaryImage } : ci;
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFullProducts(matched);
    }
  }, [items, allCatalogProducts]);

  function handleSwapProduct(newProduct: any) {
    if (swapSlotIndex === null) return;
    const currentCompare = getCompare();
    
    clearCompare();
    
    currentCompare.forEach((it, idx) => {
      if (idx === swapSlotIndex) {
        toggleCompare({
          id: newProduct.id,
          slug: newProduct.slug,
          name: newProduct.name,
          brand: newProduct.brand,
          mrp: newProduct.mrp,
          mop: newProduct.mop,
          primaryImage: newProduct.primaryImage || newProduct.images?.[0] || "",
          stock: newProduct.stock,
          lowStockThreshold: newProduct.lowStockThreshold || 5,
        });
      } else {
        toggleCompare(it);
      }
    });

    setSwapSlotIndex(null);
    setSearchQuery("");
  }

  const parsedSpecs = useMemo(() => {
    return fullProducts.map((p) => parseSpecifications(p));
  }, [fullProducts]);

  const extraKeys = useMemo(() => {
    const predefinedKeys = new Set(COMPARISON_SECTIONS.flatMap((s) => s.keys.map((k) => k.key)));
    const extra = new Set<string>();
    
    parsedSpecs.forEach((specMap) => {
      Object.keys(specMap).forEach((k) => {
        if (!predefinedKeys.has(k)) {
          extra.add(k);
        }
      });
    });
    
    return Array.from(extra);
  }, [parsedSpecs]);

  if (loading) {
    return <p className="py-20 text-center text-slate-500 font-semibold">Loading comparison data...</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ArrowLeftRight className="h-7 w-7" strokeWidth={1.75} />}
        title="Compare Products"
        message="Nothing to compare yet. Add products from any listing to see their specifications side by side."
        primaryHref="/products"
        primaryLabel="Browse products"
      />
    );
  }

  if (items.length === 1) {
    const it = items[0];
    const filteredSearch = allCatalogProducts.filter(
      (p) => p.id !== it.id && `${p.name} ${p.brand}`.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white sm:text-3xl mb-8">Compare</h1>

        <div className="flex flex-row items-stretch gap-6 relative w-full">
          
          <div className="w-1/2 bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 relative border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center">
            <button onClick={() => removeFromCompare(it.id)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="h-48 w-48 mb-6 flex items-center justify-center">
              <SafeImage src={it.primaryImage} alt={it.name} className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{it.brand}</p>
            <p className="text-base font-bold text-slate-900 dark:text-white leading-tight">{it.name}</p>
            <p className="mt-3 text-2xl font-black text-orange-700 dark:text-orange-500">₹{Number(it.mop).toLocaleString("en-IN")}</p>
          </div>

          <div className="absolute z-10 w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm dark:bg-slate-800 dark:border-slate-700" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">VS</span>
          </div>

          <div className="w-1/2 bg-white dark:bg-slate-950 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-lg shadow-slate-200/40 dark:shadow-none">
            <p className="font-bold text-slate-900 dark:text-white mb-4">Select another product</p>
            <div className="relative">
              <svg viewBox="0 0 24 24" className="absolute left-3 top-3 h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></svg>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search for a product to compare"
                type="search"
                placeholder="Search for mobiles and brands"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900"
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
            
            <div className="mt-4 flex-1 overflow-y-auto max-h-[320px] space-y-2">
              {filteredSearch.length > 0 ? (
                filteredSearch.slice(0, 8).map((res) => {
                  const off = Math.round(((Number(res.mrp) - Number(res.mop)) / Number(res.mrp)) * 100);
                  return (
                    <div 
                      key={res.id} 
                      onClick={() => toggleCompare({ id: res.id, slug: res.slug, name: res.name, brand: res.brand, mrp: res.mrp, mop: res.mop, primaryImage: res.primaryImage || res.images?.[0] || "", stock: res.stock, lowStockThreshold: res.lowStockThreshold || 5 })} 
                      className="flex flex-row items-center gap-4 border-b border-slate-100 py-3 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 p-2 rounded-lg transition-colors"
                    >
                      <div className="h-14 w-14 shrink-0 bg-slate-50 dark:bg-slate-800 rounded p-1 flex items-center justify-center">
                        <SafeImage src={res.primaryImage || res.images?.[0]} alt={res.name} className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{res.name}</p>
                        <div className="flex flex-row items-center gap-2 mt-1">
                          <span className="text-sm font-bold text-orange-700 dark:text-orange-500">₹{Number(res.mop).toLocaleString("en-IN")}</span>
                          {off > 0 && <span className="text-[11px] font-bold text-slate-500">{off}% Off</span>}
                        </div>
                      </div>
                      <div className="h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"></div>
                    </div>
                  );
                })
              ) : searchQuery ? (
                <p className="text-sm text-slate-500 text-center py-6">No matching products found.</p>
              ) : (
                <p className="text-sm text-slate-500 text-center py-10 font-medium">Type above to select a product to compare.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // TWO PRODUCTS SIDE-BY-SIDE
  const product1 = fullProducts[0] || items[0];
  const product2 = fullProducts[1] || items[1];

  const specs1 = parsedSpecs[0] || {};
  const specs2 = parsedSpecs[1] || {};

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 bg-white dark:bg-slate-950">
      
      {/* Strict Flexbox Top Header Card Comparison */}
      <div className="flex flex-row w-full relative mb-10 pb-8 border-b border-slate-200 dark:border-slate-800">
        
        <div className="absolute z-10 w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center shadow-sm dark:bg-slate-800 dark:border-slate-700" style={{ top: '40%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">VS</span>
        </div>

        {/* Product 1 Column */}
        <div className="w-1/2 flex flex-col items-center text-center px-4">
          <button 
            onClick={() => setSwapSlotIndex(0)} 
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white underline mb-3"
          >
            Change
          </button>
          <div className="h-44 w-44 bg-slate-50 dark:bg-slate-900 rounded-xl p-4 mb-4 border border-slate-100 dark:border-slate-800 flex items-center justify-center">
            <SafeImage src={product1.primaryImage || items[0].primaryImage} alt={product1.name} className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight min-h-[38px]">{product1.name}</p>
          <p className="text-xs text-slate-500 mt-1">{product1.brand}</p>
          <div className="mt-2 flex flex-row items-baseline gap-2">
            <span className="text-lg font-bold text-orange-700 dark:text-orange-500">₹{Number(product1.mop || items[0].mop).toLocaleString("en-IN")}</span>
            {Number(product1.mrp) > Number(product1.mop) && (
              <span className="text-xs text-slate-500 line-through">₹{Number(product1.mrp).toLocaleString("en-IN")}</span>
            )}
          </div>
          <Link 
            href={`/products/${product1.slug || items[0].slug}`}
            className="mt-5 w-[85%] rounded bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-center"
          >
            View Product
          </Link>
        </div>

        {/* Product 2 Column */}
        <div className="w-1/2 flex flex-col items-center text-center px-4 border-l border-slate-100 dark:border-slate-800">
          <button 
            onClick={() => setSwapSlotIndex(1)} 
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white underline mb-3"
          >
            Change
          </button>
          <div className="h-44 w-44 bg-slate-50 dark:bg-slate-900 rounded-xl p-4 mb-4 border border-slate-100 dark:border-slate-800 flex items-center justify-center">
            <SafeImage src={product2.primaryImage || items[1].primaryImage} alt={product2.name} className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight min-h-[38px]">{product2.name}</p>
          <p className="text-xs text-slate-500 mt-1">{product2.brand}</p>
          <div className="mt-2 flex flex-row items-baseline gap-2">
            <span className="text-lg font-bold text-orange-700 dark:text-orange-500">₹{Number(product2.mop || items[1].mop).toLocaleString("en-IN")}</span>
            {Number(product2.mrp) > Number(product2.mop) && (
              <span className="text-xs text-slate-500 line-through">₹{Number(product2.mrp).toLocaleString("en-IN")}</span>
            )}
          </div>
          <Link 
            href={`/products/${product2.slug || items[1].slug}`}
            className="mt-5 w-[85%] rounded bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-center"
          >
            View Product
          </Link>
        </div>

      </div>

      <div className="flex justify-center mb-8">
        <label className="flex flex-row items-center gap-3 cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
          <input 
            type="checkbox" 
            checked={showOnlyDifference}
            onChange={(e) => setShowOnlyDifference(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" 
          />
          Show only difference
        </label>
      </div>

      {/* Strict Flexbox Spec Tables (w-1/3 logic) */}
      <div className="space-y-10">
        {COMPARISON_SECTIONS.map((section) => {
          const visibleKeys = section.keys.filter((k) => {
            const v1 = specs1[k.key] || "—";
            const v2 = specs2[k.key] || "—";
            if (showOnlyDifference) {
              return v1.trim().toLowerCase() !== v2.trim().toLowerCase();
            }
            return true;
          });

          if (visibleKeys.length === 0) return null;

          return (
            <div key={section.categoryTitle} className="border-t border-slate-200 dark:border-slate-800 pt-6">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">
                {section.categoryTitle}
              </h2>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 flex flex-col">
                {visibleKeys.map((item) => {
                  const val1 = specs1[item.key] || "—";
                  const val2 = specs2[item.key] || "—";

                  return (
                    <div key={item.key} className="flex flex-row w-full text-xs sm:text-sm py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <div className="w-1/3 shrink-0 font-medium text-slate-500 dark:text-slate-400 pr-4">
                        {item.label}
                      </div>
                      <div className="w-1/3 px-4 font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                        {val1}
                      </div>
                      <div className="w-1/3 px-4 font-semibold text-slate-900 dark:text-slate-100 border-l border-slate-100 dark:border-slate-800 leading-relaxed">
                        {val2}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {extraKeys.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">
              ADDITIONAL SPECIFICATIONS
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 flex flex-col">
              {extraKeys
                .filter((k) => {
                  const v1 = specs1[k] || "—";
                  const v2 = specs2[k] || "—";
                  return showOnlyDifference ? v1.trim().toLowerCase() !== v2.trim().toLowerCase() : true;
                })
                .map((key) => (
                  <div key={key} className="flex flex-row w-full text-xs sm:text-sm py-3.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <div className="w-1/3 shrink-0 font-medium text-slate-500 dark:text-slate-400 pr-4 capitalize">
                      {key.toLowerCase()}
                    </div>
                    <div className="w-1/3 px-4 font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                      {specs1[key] || "—"}
                    </div>
                    <div className="w-1/3 px-4 font-semibold text-slate-900 dark:text-slate-100 border-l border-slate-100 dark:border-slate-800 leading-relaxed">
                      {specs2[key] || "—"}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {swapSlotIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSwapSlotIndex(null)}>
          <div className="bg-white dark:bg-slate-950 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">Change Product</h3>
              <button onClick={() => setSwapSlotIndex(null)} aria-label="Close" className="text-slate-500 hover:text-slate-600"><X aria-hidden className="h-4 w-4" /></button>
            </div>

            <div className="relative">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search for a product to swap into the comparison"
                type="search"
                placeholder="Search product to replace..."
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                style={{ paddingLeft: '2.5rem' }}
              />
              <svg viewBox="0 0 24 24" className="absolute left-3 top-3 h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></svg>
            </div>

            <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
              {allCatalogProducts
                .filter((p) => !searchQuery.trim() || `${p.name} ${p.brand}`.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 10)
                .map((p) => (
                  <div 
                    key={p.id} 
                    onClick={() => handleSwapProduct(p)}
                    className="flex flex-row items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer border border-slate-100 dark:border-slate-800"
                  >
                    <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded p-1 shrink-0 flex items-center justify-center">
                      <SafeImage src={p.primaryImage || p.images?.[0]} alt="" className="max-h-full w-auto object-contain mix-blend-multiply dark:mix-blend-normal" fill={false} width={400} height={400} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{p.name}</p>
                      <p className="text-[11px] font-bold text-orange-700 dark:text-orange-500">₹{Number(p.mop).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}