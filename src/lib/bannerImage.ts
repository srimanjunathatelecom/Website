/**
 * Telling a real banner image apart from a generated stand-in.
 *
 * The seed used to write an inline SVG into banners.image as a convenience, so
 * a fresh install wouldn't show blank tiles. It backfired: the SVG paints the
 * banner's own title into the artwork at a fixed 600x450, and the strip renders
 * those tiles at roughly 440x190 with object-cover, so the words were cropped
 * and unreadable. Worse, having *an* image made the renderers take their
 * image-only path, which drew no DOM text at all — the admin's title, subtitle
 * and CTA were dropped, leaving three near-identical gradient rectangles that
 * screen readers and crawlers saw as nothing but a bare link.
 *
 * So a generated placeholder is not an image, and treating it as one is what
 * made the homepage feel empty. Detecting it here rather than deleting rows
 * means nothing an admin uploaded is ever at risk, and a store that has been
 * running with seeded banners recovers on next render instead of needing
 * intervention.
 *
 * Deliberately narrow: only inline SVG data URIs, which no upload path can
 * produce (uploads land on a URL or a path). A real .svg logo referenced by URL
 * is untouched.
 */
export function isGeneratedPlaceholder(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.startsWith("data:image/svg+xml");
}

/**
 * The image to actually render, or null when there is nothing worth showing.
 * Call this instead of reading `banner.image` directly, so the "no image"
 * design — which is the better-looking branch — is reached when it should be.
 */
export function usableBannerImage(src: string | null | undefined): string | null {
  if (!src || isGeneratedPlaceholder(src)) return null;
  return src;
}
