import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import ScrollShelf from "@/components/ScrollShelf";
import type { CardProduct } from "@/components/ProductCard";
import type { BudgetCardConfig } from "@/lib/homepageConfig";

/**
 * The category "storefront" band shown at the top of /products when a
 * shopper lands on a clean category view (category chosen, no search or
 * extra filters yet) — the moment they clicked "Smartphones" in the nav.
 *
 * Instead of dropping them straight into a filter sidebar, this gives the
 * category a merchandised landing: a masthead with the real product count,
 * a brand rail built from the brands actually stocked in this category,
 * budget shortcuts reusing the admin's homepage budget cards, and a top-
 * discounts rail. Everything is a link into the existing filter system —
 * no new client state, no duplicated browsing logic.
 *
 * Data honesty: counts, brands, discounts and prices all come from the
 * live product rows passed in. Brands with no in-category products are
 * not shown; the deals rail disappears if nothing is genuinely discounted.
 */

type BrandRow = {
  id: number;
  name: string;
  slug: string;
  bgColor: string;
  logoUrl: string | null;
};

function pct(mrp: string, mop: string) {
  const m = Number(mrp);
  const o = Number(mop);
  if (!Number.isFinite(m) || !Number.isFinite(o) || m <= 0 || o >= m) return 0;
  return Math.round(((m - o) / m) * 100);
}

export default function CategoryStorefront({
  categoryName,
  categorySlug,
  products,
  activeBrands,
  budgets,
}: {
  categoryName: string;
  categorySlug: string;
  products: CardProduct[];
  activeBrands: BrandRow[];
  budgets: BudgetCardConfig[];
}) {
  if (products.length === 0) return null;

  // Brands actually present in this category, in the admin's brand order.
  const inCategory = new Set(products.map((p) => p.brand.toLowerCase()));
  const brandRail = activeBrands.filter((b) => inCategory.has(b.name.toLowerCase()));

  // Real discounts only — no manufactured urgency.
  const deals = products
    .map((p) => ({ p, off: pct(p.mrp, p.mop) }))
    .filter((d) => d.off >= 5)
    .sort((a, b) => b.off - a.off)
    .slice(0, 10)
    .map((d) => d.p);
  const bestOff = deals.length ? pct(deals[0].mrp, deals[0].mop) : 0;

  // Budget shortcuts only make sense where the catalog actually has
  // products under that price.
  const prices = products.map((p) => Number(p.mop)).filter(Number.isFinite);
  const cheapest = prices.length ? Math.min(...prices) : 0;
  const budgetChips = budgets.filter((b) => b.max !== null && b.max >= cheapest);

  const base = `/products?category=${encodeURIComponent(categorySlug)}`;

  return (
    <section aria-label={`${categoryName} highlights`}>
      {/* ---- Masthead ---- */}
      <div className="relative overflow-hidden bg-[#0b1120] text-white">
        <span aria-hidden className="aurora opacity-40">
          <span className="-left-24 -top-20 h-80 w-80 bg-blue-500/25" />
          <span className="right-[-4%] bottom-[-40%] h-72 w-72 bg-violet-500/20" />
        </span>
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-x-8 gap-y-4 px-4 pb-6 pt-6 sm:px-6 sm:pb-8 sm:pt-8">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-300">
              {categoryName} store
            </p>
            <h2 className="font-display mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              {categoryName}
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-slate-400">
              {products.length} {products.length === 1 ? "product" : "products"} in stock at real store prices
              {bestOff > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-300">up to {bestOff}% off</span>
                </>
              )}
            </p>
          </div>

          {/* Budget shortcuts — the admin's own budget cards, reused. */}
          {budgetChips.length > 0 && (
            <nav aria-label="Shop by budget" className="flex flex-wrap gap-2">
              {budgetChips.map((b) => (
                <Link
                  key={b.label}
                  href={`${base}&maxPrice=${b.max}`}
                  className="rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-xs font-bold text-slate-100 transition hover:-translate-y-0.5 hover:border-sky-400/60 hover:bg-sky-400/10"
                >
                  <span aria-hidden className="mr-1">{b.emoji}</span>
                  {b.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/* Brand rail — only brands with live products in this category. */}
        {brandRail.length > 1 && (
          <div className="relative border-t border-white/10">
            <div className="scrollbar-none mx-auto flex max-w-7xl gap-3 overflow-x-auto px-4 py-4 sm:px-6">
              {brandRail.map((b) => (
                <Link
                  key={b.id}
                  href={`${base}&brand=${encodeURIComponent(b.name)}`}
                  className="group flex shrink-0 items-center gap-2.5 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-xs font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full ring-1 ring-slate-200" style={{ backgroundColor: b.bgColor }}>
                    {b.logoUrl ? (
                      <SafeImage src={b.logoUrl} alt="" sizes="32px" className="object-contain p-1" />
                    ) : (
                      <span aria-hidden className="text-[13px] font-black text-slate-700">{b.name.charAt(0)}</span>
                    )}
                  </span>
                  {b.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- Top discounts rail (real deals only) ---- */}
      {deals.length >= 3 && (
        <ScrollShelf
          eyebrow="Lowest prices first"
          title={`Top ${categoryName} deals`}
          subtitle="Biggest genuine discounts off MRP in this category right now."
          products={deals}
          accent="amber"
          href={`${base}&minDiscount=10`}
          hrefLabel="See all deals"
        />
      )}
    </section>
  );
}
