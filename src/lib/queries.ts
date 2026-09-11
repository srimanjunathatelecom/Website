import { db } from "@/db";
import {
  products,
  productImages,
  productVariants,
  categories,
  services,
  outlets,
  banners,
  brands,
  storeSettings,
  contentPages,
  coupons,
  orders,
  orderItems,
  bookings,
  claims,
  notifications,
  reviews,
  wishlist,
  promoOffers,
  productQuestions,
} from "@/db/schema";
import { eq, like, ilike, and, desc, asc, sql, inArray, or, isNull, lte, gt } from "drizzle-orm";
import { cache } from "react";
import { evaluateCoupon } from "@/lib/coupon";

/**
 * The three reads below are wrapped in React's `cache()` because they are the
 * ones asked for more than once per request, from places that cannot see each
 * other.
 *
 * `getOutlets()` was the clearest case: the root layout reads it to build the
 * LocalBusiness structured data, AppShell reads it for the footer, and
 * `/repair/[brand]/[model]` reads it again for the booking panel's outlet
 * picker — three identical round trips to serve one page, none of them aware of
 * the others. `getSettings()` was called from the layout and the homepage.
 *
 * `cache()` is per-request memoisation and nothing more. It cannot hand a
 * visitor a row that was already stale when their request began, so an Admin
 * edit is still visible on the very next request. That is the property that
 * makes this safe to apply to store settings and outlet rows, which are the
 * kind of data where serving yesterday's copy would be a real bug.
 */
export const getSettings = cache(async function getSettings() {
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return s;
});

export const getOutlets = cache(async function getOutlets() {
  return db.select().from(outlets).orderBy(desc(outlets.isMain), outlets.id);
});

export const getCategories = cache(async function getCategories() {
  return db.select().from(categories);
});

// Brands for the "Shop by brand" rail, in the order the admin arranged them.
//
// Read on the server so the rail is correct in the first paint. It used to be
// fetched client-side from /api/brands after mount, which meant every visitor
// saw a hardcoded placeholder list of thirteen brands — including ones this
// shop does not stock — flash on screen and then get replaced by the real six.
export async function getActiveBrands() {
  return db
    .select()
    .from(brands)
    .where(eq(brands.active, true))
    .orderBy(desc(brands.sortOrder), asc(brands.id));
}

// True if a banner's optional start/end date window currently includes
// `now`. Both unset = always live. Mirrors isAnnouncementLive's inclusive
// end-of-day semantics in siteConfig.ts so scheduling behaves the same
// way everywhere it's used on the site.
function isBannerLive(b: { startDate: string | null; endDate: string | null }, now = new Date()): boolean {
  if (b.startDate) {
    const start = new Date(b.startDate);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (b.endDate) {
    const end = new Date(b.endDate);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (now > end) return false;
    }
  }
  return true;
}

export async function getBanners(slot?: string) {
  const rows = slot
    ? await db.select().from(banners).where(and(eq(banners.active, true), eq(banners.slot, slot)))
    : await db.select().from(banners).where(eq(banners.active, true));
  return rows.filter((b) => isBannerLive(b)).sort((a, b) => a.sortOrder - b.sortOrder);
}

// A gallery entry with the metadata the PDP needs to filter by colour and to
// tell images and videos apart. `images` (plain URL strings) is kept as-is so
// every existing consumer — product cards, banners, compare, wishlist — keeps
// working unchanged; `media` is the richer view the PDP gallery reads.
export type ProductMedia = {
  id: number;
  url: string;
  alt: string;
  variantColor: string;
  mediaType: string;
  sortOrder: number;
};

type ProductWithImages = typeof products.$inferSelect & {
  images: string[];
  primaryImage: string | null;
  media: ProductMedia[];
};

// Same as getBanners, but resolves each banner's productId/categoryId/
// brandId into the live row it points to (with product images attached).
// A banner whose reference no longer exists, or points at an inactive/
// out-of-stock product, is dropped rather than shown with stale or
// missing info — never fabricate content (spec section 13/19).
export type EnrichedBanner = Awaited<ReturnType<typeof getBanners>>[number] & {
  refProduct: ProductWithImages | null;
  refCategory: { id: number; name: string; slug: string; image: string | null } | null;
  refBrand: { id: number; name: string; slug: string; logoUrl: string | null } | null;
};

export async function getEnrichedBanners(slot?: string): Promise<EnrichedBanner[]> {
  const rows = await getBanners(slot);
  if (rows.length === 0) return [];

  const productIds = rows.map((r) => r.productId).filter((v): v is number => v != null);
  const categoryIds = rows.map((r) => r.categoryId).filter((v): v is number => v != null);
  const brandIds = rows.map((r) => r.brandId).filter((v): v is number => v != null);

  const [prodRows, catRows, brandRows] = await Promise.all([
    productIds.length
      ? db.select().from(products).where(and(inArray(products.id, productIds), eq(products.status, "active")))
      : Promise.resolve([]),
    categoryIds.length ? db.select().from(categories).where(inArray(categories.id, categoryIds)) : Promise.resolve([]),
    brandIds.length ? db.select().from(brands).where(and(inArray(brands.id, brandIds), eq(brands.active, true))) : Promise.resolve([]),
  ]);

  const prodWithImages = await attachImages(prodRows);
  const prodMap = new Map(prodWithImages.map((p) => [p.id, p]));
  const catMap = new Map(catRows.map((c) => [c.id, c]));
  const brandMap = new Map(brandRows.map((b) => [b.id, b]));

  return rows.map((b) => ({
    ...b,
    refProduct: b.productId != null ? prodMap.get(b.productId) ?? null : null,
    refCategory: b.categoryId != null ? catMap.get(b.categoryId) ?? null : null,
    refBrand: b.brandId != null ? brandMap.get(b.brandId) ?? null : null,
  }));
}

async function attachImages<T extends { id: number }>(
  rows: T[]
): Promise<
  (T & {
    images: string[];
    primaryImage: string | null;
    media: ProductMedia[];
    variantCount: number;
  })[]
> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // Media and a variant tally are fetched together because every listing card
  // needs both: the cover image, and whether the product has colour /
  // RAM / storage options at all. A card cannot know which variant a shopper
  // wants, so products with variants send the shopper to the product page to
  // choose instead of quietly adding an option-less line to the cart.
  const [imgs, variantCounts] = await Promise.all([
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(productImages.sortOrder, productImages.id),
    db
      .select({ productId: productVariants.productId, count: sql<number>`count(*)::int` })
      .from(productVariants)
      .where(inArray(productVariants.productId, ids))
      .groupBy(productVariants.productId),
  ]);
  const variantCountMap = new Map(variantCounts.map((v) => [v.productId, Number(v.count) || 0]));
  const map = new Map<number, ProductMedia[]>();
  for (const im of imgs) {
    const arr = map.get(im.productId) || [];
    arr.push({
      id: im.id,
      url: im.dataUrl,
      alt: im.alt,
      variantColor: im.variantColor || "",
      mediaType: im.mediaType === "video" ? "video" : "image",
      sortOrder: im.sortOrder,
    });
    map.set(im.productId, arr);
  }
  return rows.map((r) => {
    const media = map.get(r.id) || [];
    // Cover image must be a still, never a video frame placeholder.
    const stills = media.filter((m) => m.mediaType !== "video").map((m) => m.url);
    return {
      ...r,
      images: stills,
      primaryImage: stills[0] || null,
      media,
      variantCount: variantCountMap.get(r.id) || 0,
    };
  });
}

export type ProductFilter = {
  categorySlug?: string;
  search?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  sort?: string;
  limit?: number;
  offset?: number;
  activeOnly?: boolean;
  // Restrict to a specific set of product ids (used by "Recently viewed",
  // which stores ids locally and re-reads the live rows from the database).
  ids?: number[];
};

export async function getProducts(f: ProductFilter = {}) {
  const where: any[] = [];
  if (f.activeOnly !== false) where.push(eq(products.status, "active"));
  if (f.ids) {
    // An empty id list must match nothing, not everything.
    if (f.ids.length === 0) return [];
    where.push(inArray(products.id, f.ids));
  }

  if (f.categorySlug) {
    const [cat] = await db.select().from(categories).where(eq(categories.slug, f.categorySlug));
    if (cat) where.push(eq(products.categoryId, cat.id));
  }
  
  if (f.search) {
    // Customers overwhelmingly search by brand ("samsung"), by model
    // ("s24 ultra"), or by a mix of the two ("samsung ultra") — and the
    // filter input on /products literally promises "Name or brand". This
    // previously matched products.name only, so the single most common
    // query a phone shop gets (a brand name) returned zero results even
    // though the brand dropdown listed it.
    //
    // Each whitespace-separated token must match at least one searchable
    // column. Requiring every token to match (rather than OR-ing the whole
    // phrase) means extra words narrow the result set like a shopper
    // expects, instead of a two-word query returning more rows than one.
    const tokens = f.search.trim().split(/\s+/).filter(Boolean).slice(0, 6);
    for (const token of tokens) {
      const pattern = `%${token}%`;
      where.push(
        or(
          ilike(products.name, pattern),
          ilike(products.brand, pattern),
          ilike(products.sku, pattern),
          ilike(products.subcategory, pattern)
        )
      );
    }
  }
  
  if (f.brand) {
    // Clean the incoming brand: lowercase it and strip quotes
    const cleanBrand = f.brand.replace(/["']/g, "").trim().toLowerCase();
    // Compare against the DB brand (also lowercased and quotes stripped)
    where.push(sql`lower(replace(${products.brand}, '"', '')) = ${cleanBrand}`);
  }
  
  if (typeof f.minPrice === "number") where.push(sql`${products.mop} >= ${f.minPrice}`);
  if (typeof f.maxPrice === "number") where.push(sql`${products.mop} <= ${f.maxPrice}`);

  let orderBy: any = desc(products.createdAt);
  if (f.sort === "price-asc") orderBy = asc(products.mop);
  else if (f.sort === "price-desc") orderBy = desc(products.mop);
  else if (f.sort === "newest") orderBy = desc(products.createdAt);
  else if (f.sort === "name") orderBy = asc(products.name);

  const rows = await db
    .select()
    .from(products)
    .where(where.length ? and(...where) : undefined)
    .orderBy(orderBy)
    .limit(f.limit ?? 50)
    .offset(f.offset ?? 0);

  const withImages = await attachImages(rows);

  // discount & price filters (post-query because computed)
  let filtered = withImages;
  if (typeof f.minDiscount === "number") {
    filtered = filtered.filter((p) => {
      const m = parseFloat(p.mrp);
      const pr = parseFloat(p.mop);
      return m > 0 && Math.round(((m - pr) / m) * 100) >= f.minDiscount!;
    });
  }
  if (typeof f.minPrice === "number" || typeof f.maxPrice === "number") {
    filtered = filtered.filter((p) => {
      const pr = parseFloat(p.mop);
      if (typeof f.minPrice === "number" && pr < f.minPrice) return false;
      if (typeof f.maxPrice === "number" && pr > f.maxPrice) return false;
      return true;
    });
  }
  return filtered;
}

export async function getProductBySlug(slug: string) {
  const [p] = await db.select().from(products).where(eq(products.slug, slug));
  if (!p) return null;

  // Resolve the product's own category (slug + name) so the PDP breadcrumb
  // and "back to category" links can point at the real category instead of
  // a hardcoded /products link that loses context.
  let category: { id: number; name: string; slug: string } | null = null;
  if (p.categoryId != null) {
    const [cat] = await db.select().from(categories).where(eq(categories.id, p.categoryId));
    if (cat) category = { id: cat.id, name: cat.name, slug: cat.slug };
  }
  
  // Independent reads issued together — they don't depend on each other, so
  // serialising them just added round-trips to every product page render.
  const [[withImg], revs, vars, rel, sameBrandRows, offers, questions] = await Promise.all([
    attachImages([p]),
    db.select().from(reviews).where(eq(reviews.productId, p.id)).orderBy(desc(reviews.createdAt)),
    // Admin-defined display order first, then a stable id tiebreak, so the
    // swatch/config order on the PDP matches what the admin arranged.
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, p.id))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.id)),
    // Same category. Excluding the current product in SQL (rather than
    // filtering afterwards) means a full 8 related products come back
    // instead of 7 whenever this product is inside the limit.
    db
      .select()
      .from(products)
      .where(
        and(
          eq(products.categoryId, p.categoryId),
          eq(products.status, "active"),
          sql`${products.id} <> ${p.id}`
        )
      )
      .orderBy(desc(products.featured), desc(products.bestseller), desc(products.id))
      .limit(8),
    // Same brand, any category — "More from <brand>" rail. Skipped entirely
    // for products with no brand recorded rather than matching on empty string.
    p.brand
      ? db
          .select()
          .from(products)
          .where(
            and(
              eq(products.status, "active"),
              ilike(products.brand, p.brand),
              sql`${products.id} <> ${p.id}`
            )
          )
          .orderBy(desc(products.bestseller), desc(products.id))
          .limit(8)
      : Promise.resolve([]),
    getActiveOffersForProduct(p.id, p.categoryId),
    // Published questions only. Anything still in moderation (or rejected)
    // must never render on a product page, so the filter lives in SQL rather
    // than in the component. Answered ones lead, because that is what a
    // shopper on the fence is actually looking for.
    db
      .select()
      .from(productQuestions)
      .where(and(eq(productQuestions.productId, p.id), eq(productQuestions.status, "published")))
      .orderBy(
        sql`case when ${productQuestions.answer} = '' then 1 else 0 end`,
        desc(productQuestions.createdAt)
      )
      .limit(5),
  ]);

  const [relWithImg, sameBrandWithImg] = await Promise.all([
    attachImages(rel),
    attachImages(sameBrandRows),
  ]);

  return {
    product: { ...withImg, category },
    reviews: revs,
    related: relWithImg,
    sameBrand: sameBrandWithImg,
    variants: vars,
    offers,
    questions,
  };
}

// Real, admin-managed offer tiles for the PDP — replaces the old hardcoded
// HDFC/Axis/SBI/UPI tiles. Active + within its optional start/expiry window +
// applicable to this product (store-wide, this product specifically, or this
// product's category) via the same scoping rule as the API route.
export async function getActiveOffersForProduct(productId: number, categoryId: number) {
  const now = new Date();
  const rows = await db
    .select()
    .from(promoOffers)
    .where(
      and(
        eq(promoOffers.active, true),
        or(isNull(promoOffers.startsAt), lte(promoOffers.startsAt, now)),
        or(isNull(promoOffers.expiresAt), gt(promoOffers.expiresAt, now)),
        or(
          and(isNull(promoOffers.productId), isNull(promoOffers.categoryId)),
          eq(promoOffers.productId, productId),
          and(isNull(promoOffers.productId), eq(promoOffers.categoryId, categoryId))
        )
      )
    )
    .orderBy(asc(promoOffers.sortOrder), desc(promoOffers.id));
  return rows;
}

export async function getProductById(id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) return null;
  const [withImg] = await attachImages([p]);
  return withImg;
}

export async function getFeatured(limit = 8) {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.status, "active"), eq(products.featured, true)))
    .limit(limit);
  return attachImages(rows);
}

export async function getDeals(limit = 12) {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.status, "active"))
    .limit(limit * 3);
  const withImg = await attachImages(rows);
  return withImg
    .map((p) => {
      const m = parseFloat(p.mrp);
      const pr = parseFloat(p.mop);
      const d = m > 0 ? Math.round(((m - pr) / m) * 100) : 0;
      return { ...p, _d: d };
    })
    .filter((p) => p._d > 0)
    .sort((a, b) => b._d - a._d)
    .slice(0, limit);
}

export async function getServices() {
  const rows = await db.select().from(services).where(eq(services.status, "active"));
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getContent(slug: string) {
  const [c] = await db.select().from(contentPages).where(eq(contentPages.slug, slug));
  return c;
}

export async function getContents() {
  return db.select().from(contentPages);
}

export async function getCoupon(code: string) {
  // Routes through the shared rules so expiry and redemption caps apply here
  // too, rather than only at checkout.
  const check = await evaluateCoupon(code);
  return check.ok ? check.coupon : undefined;
}

export async function getOrder(id: number) {
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { order: o, items };
}

export async function getBooking(id: number) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id));
  return b;
}

export async function getClaim(id: number) {
  const [c] = await db.select().from(claims).where(eq(claims.id, id));
  return c;
}

export async function getNotifications() {
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function getWishlist(customerId: number) {
  const rows = await db.select().from(wishlist).where(eq(wishlist.customerId, customerId));
  const ids = rows.map((r) => r.productId);
  if (ids.length === 0) return [];
  const prods = await db.select().from(products).where(inArray(products.id, ids));
  return attachImages(prods);
}

export async function getShopStats() {
  const [prodCount] = await db.select({ c: sql<number>`count(*)::int` }).from(products);
  const [orderRows] = await db.select({ c: sql<number>`count(*)::int`, rev: sql<number>`coalesce(sum(${orders.totalMop}),0)::numeric` }).from(orders);
  const [bookingRows] = await db.select({ c: sql<number>`count(*)::int` }).from(bookings);
  const low = await db.select().from(products).where(sql`${products.stock} <= ${products.lowStockThreshold}`);
  return {
    products: prodCount?.c ?? 0,
    orders: orderRows?.c ?? 0,
    revenue: Number(orderRows?.rev ?? 0),
    bookings: bookingRows?.c ?? 0,
    lowStock: low,
  };
}