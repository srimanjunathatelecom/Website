/**
 * Which remote hosts the image optimizer is allowed to fetch from.
 *
 * The config used to be `remotePatterns: [{ protocol: "https", hostname: "**" }]`,
 * chosen so that whatever URL the shop owner pasted into Admin would still get
 * next/image's resizing and lazy-loading. It worked, and it also turned
 * `/_next/image?url=…` into a general-purpose fetch-and-resize proxy for any
 * HTTPS URL on the internet, open to anyone who can type that path. Someone
 * else's traffic, decoded and re-encoded on our CPU, billed to this deployment.
 *
 * The fix is not to hardcode a host list — the owner adds image URLs from Admin
 * without a redeploy, so a fixed list turns "paste a new CDN link" into a broken
 * product page. Instead the optimizer gets an explicit allowlist, and anything
 * off it still displays, just as a plain <img> the browser fetches directly.
 *
 * That makes the two failure modes very unequal on purpose:
 *
 *   - Host not allowlisted  ->  image loads, unoptimized. Costs bandwidth.
 *   - Host allowlisted      ->  image loads, optimized.
 *
 * Neither breaks the page, and no configuration turns us back into a proxy
 * unless the operator explicitly asks for it. Optimization is opt-in per host,
 * which is the right default for a store that isn't hosted yet: the unsafe
 * setting requires a decision, the safe one requires nothing.
 *
 * Configured with NEXT_PUBLIC_IMAGE_HOSTS, comma-separated. It has to be
 * NEXT_PUBLIC_ because the same decision has to be made in the browser, by the
 * components choosing between <Image> and <img>. It holds no secret — a list of
 * CDN hostnames is not sensitive, and it is visible in the page source anyway
 * the moment an image renders.
 *
 *   NEXT_PUBLIC_IMAGE_HOSTS=cdn.smsstores.in,*.cloudinary.com
 *   NEXT_PUBLIC_IMAGE_HOSTS=*        <- restores the old open-proxy behaviour
 */

/** Raw hostnames as configured, trimmed and lowercased. Empty when unset. */
export const imageHostAllowlist: string[] = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/**
 * True when the operator has deliberately re-opened the optimizer to every host.
 * Kept as an explicit escape hatch rather than a hidden fallback: someone who
 * needs the old behaviour can have it, but they have to write it down.
 */
export const imageHostsUnrestricted = imageHostAllowlist.includes("*");

/**
 * Does this hostname match a configured entry?
 *
 * Entries are exact hostnames, or `*.example.com` to match any subdomain. A
 * bare `example.com` deliberately does NOT match `cdn.example.com`: the whole
 * point is that the operator states what they intend, and silently widening an
 * exact host to its subdomains would hand an attacker any origin they can get
 * a CNAME on.
 */
function hostAllowed(hostname: string): boolean {
  if (imageHostsUnrestricted) return true;
  const host = hostname.toLowerCase();
  return imageHostAllowlist.some((entry) => {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // ".example.com"
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === entry;
  });
}

/**
 * Should this src go through next/image, or be rendered as a plain <img>?
 *
 * Returns false for anything the optimizer cannot or should not fetch:
 *
 *   - data: and blob: sources. The optimizer needs something it can request
 *     over the network, and handing it a data: URI fails outright rather than
 *     degrading. There is nothing to gain either — a data: URI already arrived
 *     inside the HTML, so there is no second request to make cheaper. The
 *     seeded catalogue placeholders are all data: URIs, which is why this case
 *     is not hypothetical.
 *   - http:// sources. The optimizer is configured for https only; fetching
 *     cleartext server-side to serve over TLS launders a mixed-content problem
 *     into something the browser can no longer warn about.
 *   - https:// on a host that isn't allowlisted.
 *
 * Relative paths (/images/logo.png) are always fine: they're our own files,
 * served from this deployment, and involve no third party at all.
 */
export function canOptimizeImage(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  if (!/^https:\/\//i.test(src)) return false;
  try {
    return hostAllowed(new URL(src).hostname);
  } catch {
    // Unparseable src. Let the browser deal with it directly rather than
    // handing the optimizer something it will reject with a 400.
    return false;
  }
}

/**
 * The allowlist in the shape next.config.ts needs for `images.remotePatterns`.
 *
 * Derived from the same env var and the same parsing as the runtime check above,
 * so the components and the optimizer cannot disagree. They must not: a
 * component deciding to use <Image> for a host the optimizer rejects produces a
 * broken image, which is exactly the class of bug a split source of truth
 * creates.
 *
 * An empty allowlist yields an empty array, which disables remote optimization
 * entirely. That is the intended default, not an oversight.
 */
export function imageRemotePatterns(): { protocol: "https"; hostname: string }[] {
  if (imageHostsUnrestricted) return [{ protocol: "https", hostname: "**" }];
  return imageHostAllowlist.map((entry) => ({
    protocol: "https" as const,
    // next/image's matcher spells "any subdomain" as `**.example.com`.
    hostname: entry.startsWith("*.") ? `**${entry.slice(1)}` : entry,
  }));
}
