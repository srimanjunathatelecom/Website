/**
 * Validation for the "image / video location" fields in Admin.
 *
 * These fields legitimately hold either of two things:
 *   - a path inside this site, e.g. /images/banner-hero-1.jpg  (what the Upload
 *     button produces, and what every seeded banner already contains)
 *   - a full address on another host, e.g. https://cdn.example.com/hero.jpg
 *
 * They were marked type="url", which only accepts the second form. The browser
 * then refused to submit the form for the first one - so opening an existing
 * banner to change its title or its dates and pressing Save produced "Please
 * enter a URL" pointing at the image field, which the owner had not touched and
 * which contained the correct value the storefront was already serving. There
 * was no way through it short of pasting an absolute URL over a working path.
 * The same type was on the category icon, brand logo, video banner, cinematic
 * hero video and the banner mobile image.
 *
 * So these are plain text inputs now, validated here on submit instead, where
 * both shapes can be accepted and the message can say something useful.
 */

/** Wording used wherever one of these fields is rejected. */
export const IMAGE_REF_HINT =
  "Use a path inside this site (/images/banner.jpg) or a full address (https://example.com/banner.jpg).";

/**
 * True if `value` is something the site can actually load. Empty passes - the
 * callers decide whether a field is required, and an optional field left blank
 * is not an error.
 */
export function isValidImageRef(value: string): boolean {
  const v = value.trim();
  if (!v) return true;

  // Produced by the file pickers in Admin - already inline, nothing to resolve.
  if (v.startsWith("data:")) return true;

  // A path inside this site. Rejects "//evil.example.com", which a browser
  // reads as protocol-relative and would load from another host.
  if (v.startsWith("/")) return !v.startsWith("//");

  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The error to show for a bad value, or "" when it is fine. `label` names the
 * field so a form with several of them says which one is wrong.
 */
export function imageRefError(value: string, label: string): string {
  if (isValidImageRef(value)) return "";
  return `${label} is not a valid location. ${IMAGE_REF_HINT}`;
}
