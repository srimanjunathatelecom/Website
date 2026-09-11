import { revalidatePath } from "next/cache";

/**
 * Drops the cached copies of the customer-facing pages after an Admin change.
 *
 * The storefront is served with ISR - the homepage holds for 60 seconds, a
 * product page for 30, the static pages for 300 - which means an edit made in
 * Admin was not visible on the site until the window happened to expire. Saving
 * a new product name and then looking at the homepage showed the old one, and
 * nothing on either screen explained why. Measured before this existed: a
 * product renamed through Admin took about thirty seconds to appear on the
 * homepage, and could take a full minute.
 *
 * For a store owner that is indistinguishable from the save having failed, and
 * the natural response - save it again, and again - never helps.
 *
 * These pages are still cached exactly as before. The only change is that a
 * write through Admin now says "this is stale" instead of waiting for a clock,
 * so the next visitor gets fresh HTML.
 */

/**
 * Pages that show product data. The product page is invalidated by route rather
 * than by slug: a single edit can change which products appear where (a rename,
 * a category move, going out of stock), so there is no one page to name.
 */
export function revalidateProduct() {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/products/[id]", "page");
}

/** Homepage-only content: banners, promo cards, brand strip, CMS copy. */
export function revalidateHomepage() {
  revalidatePath("/");
}

/** The cached marketing pages. */
export function revalidateContent() {
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/services");
  revalidatePath("/faq");
  revalidatePath("/policy/[slug]", "page");
}
