import type { MetadataRoute } from "next";
import { getCategories, getProducts, getContents } from "@/lib/queries";
import { getModelsForBrand, getRepairBrands } from "@/lib/repair/queries";
import { siteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl;
  const cats = await getCategories();
  // Active, publicly-visible products only (activeOnly defaults to true) —
  // hidden/draft products never leak into the sitemap. Capped at 5000,
  // the practical per-sitemap limit search engines expect; a catalog
  // beyond that would need a sitemap index, which isn't needed yet.
  const prods = await getProducts({ limit: 5000 });
  const pages = await getContents();

  const staticRoutes = ["", "/products", "/services", "/repair", "/contact", "/about", "/faq", "/track"].map((p) => ({
    url: base + p,
    lastModified: new Date(),
  }));
  const catRoutes = cats.map((c) => ({
    url: base + `/products?category=${c.slug}`,
    lastModified: new Date(),
  }));
  const productRoutes = prods.map((p) => ({
    url: base + `/products/${p.slug}`,
    lastModified: p.createdAt ? new Date(p.createdAt) : new Date(),
  }));
  // Admin-authored policy/help pages (terms, privacy, warranty, shipping,
  // help centre, etc.) — previously missing from the sitemap entirely,
  // so search engines had no path to discover them except by following an
  // in-page link. Real lastModified from the row, since these are the one
  // content type that actually tracks an edit timestamp.
  const policyRoutes = pages.map((c) => ({
    url: base + `/policy/${c.slug}`,
    lastModified: c.updatedAt ? new Date(c.updatedAt) : new Date(),
  }));
  // The repair funnel below "/repair", which used to be left out on the grounds
  // that per-device pages would be thin. They are not thin: each one carries its
  // own title, description, heading and device summary naming that exact handset,
  // and they are the pages that answer the searches this business most wants to
  // be found for - somebody typing their phone and their fault into Google.
  // Leaving them out meant the only repair URL a search engine was handed was the
  // brand picker, with every device page three clicks deeper.
  //
  // Priority separates them rather than exclusion: brand pages are broader and
  // rank for "<brand> repair", device pages are narrower and far more numerous.
  const brands = await getRepairBrands();
  const brandRoutes = brands.map((b) => ({
    url: base + `/repair/${b.slug}`,
    lastModified: new Date(),
    priority: 0.7,
  }));
  const modelRoutes = (
    await Promise.all(
      brands.map(async (b) =>
        (await getModelsForBrand(b.id)).map((m) => ({
          url: base + `/repair/${b.slug}/${m.slug}`,
          lastModified: new Date(),
          priority: 0.5,
        }))
      )
    )
  ).flat();

  return [
    ...staticRoutes,
    ...catRoutes,
    ...productRoutes,
    ...policyRoutes,
    ...brandRoutes,
    ...modelRoutes,
  ];
}