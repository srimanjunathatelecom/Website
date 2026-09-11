/**
 * Server-side reads for the visual repair flow.
 *
 * These are the only place DB rows become the view contracts in ./types, so the
 * grids never see a raw Drizzle row and never have to know that `services`
 * carries a dozen merchandising columns they don't use.
 *
 * All of these run on the server so the first paint is already correct. The
 * storefront brand rail learned this the hard way — it used to fetch from
 * /api/brands after mount, which flashed a hardcoded placeholder list at every
 * visitor before the real brands arrived.
 */

import { db } from "@/db";
import { brands, deviceModels, services } from "@/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import type { RepairBrand, RepairModel, RepairService } from "./types";

/**
 * Every read in this file is wrapped in React's `cache()`, for one specific
 * reason worth stating plainly: Next.js calls `generateMetadata` and the page's
 * default export as two separate functions, and both of them need the same
 * rows.
 *
 * On `/repair/[brand]/[model]` that meant `getRepairBrandBySlug` ran twice and
 * `getModelBySlug` ran twice — and because `getModelBySlug` is implemented as
 * "read every model for the brand, then find one", the duplicate was a 30-row
 * read for a brand like Samsung, not a single-row one. Counted end to end, a
 * model page was doing around nine database round trips to serve three tables,
 * four of them exact duplicates.
 *
 * Nothing about the caching semantics is loose here. `cache()` memoises for the
 * duration of one request only; it is not a cross-request cache and it cannot
 * serve a row that was stale before the request started. Page-level
 * `revalidate` still decides freshness. This only stops the same request asking
 * the same question twice.
 */

/**
 * Brands the shop repairs, with a live count of models behind each one.
 *
 * The count is a LEFT JOIN rather than an N+1 per card: the grid shows every
 * repairable brand at once, so one query is the difference between one round
 * trip and twenty. Brands with zero models still appear — a brand that is
 * marked repairable but not yet populated is an Admin to-do, and hiding it
 * would make that invisible.
 */
export const getRepairBrands = cache(async function getRepairBrands(): Promise<RepairBrand[]> {
  const rows = await db
    .select({
      id: brands.id,
      slug: brands.slug,
      name: brands.name,
      image: brands.logoUrl,
      bgColor: brands.bgColor,
      modelCount: sql<number>`count(${deviceModels.id})`.mapWith(Number),
    })
    .from(brands)
    .leftJoin(
      deviceModels,
      and(eq(deviceModels.brandId, brands.id), eq(deviceModels.active, true))
    )
    .where(and(eq(brands.repairable, true), eq(brands.active, true)))
    .groupBy(brands.id, brands.slug, brands.name, brands.logoUrl, brands.bgColor, brands.sortOrder)
    .orderBy(desc(brands.sortOrder), asc(brands.name));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    image: r.image ?? "",
    imageAlt: `${r.name} logo`,
    bgColor: r.bgColor,
    modelCount: r.modelCount,
  }));
});

export const getRepairBrandBySlug = cache(async function getRepairBrandBySlug(slug: string): Promise<RepairBrand | null> {
  const [row] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.slug, slug), eq(brands.repairable, true), eq(brands.active, true)));
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: row.logoUrl ?? "",
    imageAlt: `${row.name} logo`,
    bgColor: row.bgColor,
    modelCount: 0,
  };
});

/**
 * Every active model for one brand.
 *
 * Ordering is popular first, then newest, then the owner's manual sortOrder,
 * then alphabetical. That is the order a customer scans: the handset they are
 * most likely holding should not be on row four. `releaseYear` is nullable, so
 * NULLS LAST keeps undated models from sorting above this year's flagship.
 */
export const getModelsForBrand = cache(async function getModelsForBrand(brandId: number): Promise<RepairModel[]> {
  const rows = await db
    .select({
      id: deviceModels.id,
      slug: deviceModels.slug,
      name: deviceModels.name,
      image: deviceModels.image,
      imageAlt: deviceModels.imageAlt,
      releaseYear: deviceModels.releaseYear,
      popular: deviceModels.popular,
      brandId: deviceModels.brandId,
      brandSlug: brands.slug,
      brandName: brands.name,
    })
    .from(deviceModels)
    .innerJoin(brands, eq(brands.id, deviceModels.brandId))
    .where(and(eq(deviceModels.brandId, brandId), eq(deviceModels.active, true)))
    .orderBy(
      desc(deviceModels.popular),
      sql`${deviceModels.releaseYear} desc nulls last`,
      desc(deviceModels.sortOrder),
      asc(deviceModels.name)
    );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    image: r.image,
    imageAlt: r.imageAlt || `${r.brandName} ${r.name}`,
    brandId: r.brandId,
    brandSlug: r.brandSlug,
    brandName: r.brandName,
    releaseYear: r.releaseYear,
    popular: r.popular,
  }));
});

/**
 * One model, looked up within its brand.
 *
 * Still implemented on top of `getModelsForBrand` rather than as its own
 * `WHERE slug = ?` query, and that is now the cheap option rather than the
 * wasteful one: the model grid the visitor just came from needs the whole list
 * anyway, `getModelsForBrand` is memoised per request, and a targeted query
 * here would be a *second* round trip on the page that follows. One read serves
 * both the lookup and the list.
 */
export const getModelBySlug = cache(async function getModelBySlug(
  brandId: number,
  slug: string
): Promise<RepairModel | null> {
  const models = await getModelsForBrand(brandId);
  return models.find((m) => m.slug === slug) ?? null;
});

/**
 * The repair services offered, in the owner's chosen order.
 *
 * Services are not yet scoped per model — the shop quotes the same service list
 * for every handset and prices on inspection. The signature takes the model
 * anyway so that when a `model_services` join does arrive, callers and the
 * grid do not change.
 */
export const getRepairServices = cache(async function getRepairServices(
  _model?: RepairModel | null
): Promise<RepairService[]> {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.status, "active"))
    .orderBy(asc(services.sortOrder), asc(services.name));

  return rows.map((r) => ({
    id: r.id,
    slug: slugifyServiceName(r.name),
    name: r.name,
    image: r.image,
    imageAlt: r.imageAlt || r.name,
    description: r.description,
    category: r.category,
    startPrice: r.startPrice,
    turnaround: r.turnaround,
    featured: r.featured,
    badge: r.badge,
  }));
});

/**
 * Services for the Popular Repaired Services carousel.
 *
 * Driven by the same `featured` flag Admin already exposes, and read from the
 * same list as the main grid — the carousel is a filtered view, not a second
 * hardcoded set that can disagree with it. Falls back to the first few services
 * when nothing is flagged, so the section is never an empty rail.
 */
export function pickPopularServices(all: RepairService[], limit = 10): RepairService[] {
  const featured = all.filter((s) => s.featured);
  const pool = featured.length > 0 ? featured : all;
  return pool.slice(0, limit);
}

/** `services` has no slug column; the name is the stable identity. */
export function slugifyServiceName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
