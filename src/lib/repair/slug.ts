/**
 * Slugs for device models.
 *
 * The shared `slugify()` in lib/format collapses every run of non-alphanumerics
 * to a single dash, which is right for product and brand names but silently
 * destroys model names — "+" is a whole model tier in this category:
 *
 *   slugify("Galaxy S23+")          -> "galaxy-s23"   ... same as
 *   slugify("Galaxy S23")           -> "galaxy-s23"
 *   slugify("Redmi Note 13 Pro+ 5G") -> "redmi-note-13-pro-5g"  ... same as
 *   slugify("Redmi Note 13 Pro 5G")  -> "redmi-note-13-pro-5g"
 *
 * With a unique index on (brand_id, slug) the collision doesn't corrupt
 * anything — it just means whichever model is inserted second never exists. The
 * seed hit this on four pairs, so a customer searching for a plain Galaxy S23
 * would have found only the S23+.
 *
 * Spelling "+" out keeps the pair distinct and keeps the URL readable:
 *   /repair/samsung/galaxy-s23-plus
 *
 * lib/format's slugify is deliberately left alone. It is used for products,
 * categories and brands whose slugs are already live in URLs and search
 * indexes, and widening it to change existing slugs would be a far bigger
 * change than this problem justifies.
 */
export function modelSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Do this before the catch-all below, or the "+" is gone by then.
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
