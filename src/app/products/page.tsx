import AppShell from "@/components/AppShell";
import ProductsBrowser from "@/components/ProductsBrowser";
import BackButton from "@/components/BackButton";
import CategoryStorefront from "@/components/CategoryStorefront";
import { getProducts, getCategories, getActiveBrands } from "@/lib/queries";
import { db } from "@/db";
import { contentPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HOME_CONFIG_SLUG, parseHomePageConfig } from "@/lib/homepageConfig";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  if (sp.category) {
    const cats = await getCategories();
    const cat = cats.find((c) => c.slug === sp.category);
    if (cat) {
      return {
        title: `${cat.name} — Shop Online`,
        description: `Browse ${cat.name} at genuine MOP pricing, real stock and same-day delivery in Bengaluru.`,
        alternates: { canonical: `/products?category=${cat.slug}` },
      };
    }
  }
  if (sp.search) {
    return { title: `Search results for "${sp.search}"`, description: `Products matching "${sp.search}".` };
  }
  return {
    title: "All Products",
    description: "Browse our full catalog of mobiles and accessories at genuine MOP pricing with real stock.",
    alternates: { canonical: "/products" },
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    search?: string;
    brand?: string;
    minPrice?: string;
    maxPrice?: string;
    minDiscount?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const minPrice = sp.minPrice ? Number(sp.minPrice) : undefined;
  const maxPrice = sp.maxPrice ? Number(sp.maxPrice) : undefined;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const [products, categories] = await Promise.all([
    getProducts({
      categorySlug: sp.category,
      search: sp.search,
      brand: sp.brand,
      minPrice: Number.isFinite(minPrice as number) ? minPrice : undefined,
      maxPrice: Number.isFinite(maxPrice as number) ? maxPrice : undefined,
      minDiscount: Number.isFinite(minDiscount as number) ? minDiscount : undefined,
      sort: sp.sort,
      limit: 500,
    }),
    getCategories(),
  ]);

  // Brand list from ALL active products, not only the filtered set
  const allProducts = await getProducts({ limit: 500 });
  const brands = Array.from(new Set(allProducts.map((p: any) => p.brand).filter(Boolean))).sort();

  // The merchandised category storefront (masthead + brand rail + budget
  // shortcuts + deals rail) appears only on a *clean* category landing —
  // the click from "Smartphones" in the nav — not once the shopper starts
  // searching or filtering, where it would push results off-screen.
  const cleanCategoryLanding =
    !!sp.category && !sp.search && !sp.brand && !sp.minPrice && !sp.maxPrice && !sp.minDiscount;
  const landingCategory = cleanCategoryLanding
    ? categories.find((c: any) => c.slug === sp.category)
    : undefined;
  const [activeBrands, homePageContent] = landingCategory
    ? await Promise.all([
        getActiveBrands(),
        db.select().from(contentPages).where(eq(contentPages.slug, HOME_CONFIG_SLUG)).then((rows) => rows[0] || null).catch(() => null),
      ])
    : [[], null];
  const homeConfig = landingCategory ? parseHomePageConfig(homePageContent?.body) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <BackButton />
      </div>
      {landingCategory && homeConfig && (
        <CategoryStorefront
          categoryName={landingCategory.name}
          categorySlug={landingCategory.slug}
          products={products as any}
          activeBrands={activeBrands as any}
          budgets={homeConfig.budgets}
        />
      )}
      <ProductsBrowser
        products={products as any}
        brands={brands as string[]}
        categories={categories as any}
        initialSearch={sp.search || ""}
        initialCategory={sp.category || ""}
        initialBrand={sp.brand || ""}
        initialMinPrice={sp.minPrice || ""}
        initialMaxPrice={sp.maxPrice || ""}
        initialMinDiscount={sp.minDiscount || ""}
        initialSort={sp.sort || "newest"}
      />
    </AppShell>
  );
}