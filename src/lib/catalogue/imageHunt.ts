/**
 * Auto Image Manager — finding legitimate imagery for a product/variant.
 *
 * Source policy (spec §9), in order:
 *   1. official manufacturer domains (registry below + owner-added domains
 *      in catalogue_settings.officialDomains);
 *   2. nothing else. No random websites, no stock art, no AI images. If the
 *      official sources yield nothing confident, the product goes to the
 *      Needs Review queue with whatever candidates were found — the owner
 *      decides, the system never guesses.
 *
 * The actual web search is env-gated behind a provider (Google Programmable
 * Search JSON API is the one implemented: IMAGE_SEARCH_API_KEY +
 * IMAGE_SEARCH_CX). Without keys, image hunting degrades honestly: issues
 * are still detected and queued, each carrying a "search not configured"
 * note instead of fabricated matches — the same env-gating discipline as
 * R2 (src/lib/media/r2.ts) and Razorpay.
 */

import {
  type CatProduct,
  type CatVariant,
  type ImageCandidate,
  matchTokens,
  scoreImageCandidate,
} from "./classify";

// Default official-domain registry for the brands this store actually sells
// (see KNOWN_BRANDS in src/lib/quickAdd.ts). The owner can extend it per
// brand from Catalogue Health settings without a deploy.
const OFFICIAL_DOMAINS: Record<string, string[]> = {
  samsung: ["samsung.com", "images.samsung.com"],
  apple: ["apple.com", "store.storeimages.cdn-apple.com"],
  oneplus: ["oneplus.in", "oneplus.com", "image01.oneplus.net"],
  xiaomi: ["mi.com", "i02.appmifile.com", "i01.appmifile.com", "xiaomi.com"],
  redmi: ["mi.com", "i02.appmifile.com", "xiaomi.com"],
  poco: ["po.co", "mi.com", "i02.appmifile.com"],
  vivo: ["vivo.com", "in.vivo.com"],
  oppo: ["oppo.com", "image.oppo.com"],
  realme: ["realme.com", "image01.realme.net"],
  google: ["store.google.com", "lh3.googleusercontent.com"],
  nothing: ["nothing.tech", "in.nothing.tech"],
  motorola: ["motorola.in", "motorola.com", "motorolain.vtexassets.com"],
  nokia: ["nokia.com", "hmd.com"],
  asus: ["asus.com", "dlcdnwebimgs.asus.com"],
  lenovo: ["lenovo.com", "p1-ofp.static.pub"],
  hp: ["hp.com", "in.store.hp.com", "hp.widen.net"],
  dell: ["dell.com", "i.dell.com"],
  acer: ["acer.com", "static-ecapac.acer.com"],
  msi: ["msi.com", "asset.msi.com"],
  boat: ["boat-lifestyle.com", "cdn.shopify.com"],
  jbl: ["jbl.com", "jbl.com.in", "in.jbl.com"],
  sony: ["sony.co.in", "sony-asia.com", "sony.com"],
  noise: ["gonoise.com", "cdn.shopify.com"],
  zebronics: ["zebronics.com"],
  portronics: ["portronics.com"],
};

export function officialDomainsForBrand(brand: string, extra: Record<string, string[]> = {}): string[] {
  const key = brand.trim().toLowerCase();
  const defaults = OFFICIAL_DOMAINS[key] || [];
  const added = extra[key] || [];
  return [...new Set([...defaults, ...added])];
}

export function isOfficialDomain(hostname: string, brand: string, extra: Record<string, string[]> = {}): boolean {
  const host = hostname.toLowerCase();
  return officialDomainsForBrand(brand, extra).some((d) => host === d || host.endsWith(`.${d}`));
}

// ---------- provider ----------

export function imageSearchConfigured(): boolean {
  return Boolean((process.env.IMAGE_SEARCH_API_KEY || "").trim() && (process.env.IMAGE_SEARCH_CX || "").trim());
}

type RawHit = { url: string; sourceUrl: string; title: string; width?: number; height?: number };

/**
 * Query Google Programmable Search (image mode) restricted to one site.
 * Returns [] on any failure — a search hiccup must degrade to "needs review",
 * never crash a 700-product job.
 */
async function searchImagesOnSite(query: string, site: string): Promise<RawHit[]> {
  const key = (process.env.IMAGE_SEARCH_API_KEY || "").trim();
  const cx = (process.env.IMAGE_SEARCH_CX || "").trim();
  if (!key || !cx) return [];
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", query);
  u.searchParams.set("searchType", "image");
  u.searchParams.set("num", "5");
  u.searchParams.set("siteSearch", site);
  u.searchParams.set("siteSearchFilter", "i");
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const j = await res.json();
    const items = Array.isArray(j.items) ? j.items : [];
    return items
      .map((it: Record<string, unknown>) => ({
        url: String(it.link || ""),
        sourceUrl: String((it.image as Record<string, unknown>)?.contextLink || ""),
        title: String(it.title || ""),
        width: Number((it.image as Record<string, unknown>)?.width || 0) || undefined,
        height: Number((it.image as Record<string, unknown>)?.height || 0) || undefined,
      }))
      .filter((h: RawHit) => h.url.startsWith("https://"));
  } catch {
    return [];
  }
}

export type HuntResult = {
  configured: boolean;
  candidates: (ImageCandidate & { confidence: number; alt: string })[];
  note: string;
};

/**
 * Find scored image candidates for a product/variant from official sources only.
 */
export async function findImageCandidates(
  p: CatProduct,
  v: CatVariant | null,
  extraDomains: Record<string, string[]> = {}
): Promise<HuntResult> {
  const tokens = matchTokens(p, v);
  const domains = officialDomainsForBrand(p.brand, extraDomains);

  if (!imageSearchConfigured()) {
    return {
      configured: false,
      candidates: [],
      note:
        "Automatic image search is not configured yet (IMAGE_SEARCH_API_KEY / IMAGE_SEARCH_CX). " +
        "The problem is still tracked here — add the keys once and images will be found automatically.",
    };
  }
  if (domains.length === 0) {
    return {
      configured: true,
      candidates: [],
      note: `No official image source is registered for the brand "${p.brand || "(none)"}". Add its official website domain in Catalogue Health settings.`,
    };
  }

  const query = [p.brand, p.name, v?.storage, v?.color].filter(Boolean).join(" ");
  const perSite = await Promise.all(domains.slice(0, 4).map((d) => searchImagesOnSite(query, d)));
  const seen = new Set<string>();
  const candidates: HuntResult["candidates"] = [];
  for (const hits of perSite) {
    for (const h of hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      let sourceDomain = "";
      try { sourceDomain = new URL(h.sourceUrl || h.url).hostname; } catch { /* keep "" */ }
      const cand: ImageCandidate = {
        url: h.url,
        sourceUrl: h.sourceUrl,
        sourceDomain,
        title: h.title,
        officialDomain: isOfficialDomain(sourceDomain || "", p.brand, extraDomains) ||
          (() => { try { return isOfficialDomain(new URL(h.url).hostname, p.brand, extraDomains); } catch { return false; } })(),
        width: h.width,
        height: h.height,
      };
      candidates.push({
        ...cand,
        confidence: scoreImageCandidate(cand, tokens),
        alt: "", // filled by caller via buildAltText
      });
    }
  }
  candidates.sort((a, b) => b.confidence - a.confidence);
  return { configured: true, candidates: candidates.slice(0, 6), note: candidates.length ? "" : "No matching image found on the brand's official site." };
}

// ---------- broken-link checking ----------

export type UrlCheck = { ok: boolean; status: number; contentType: string };

/**
 * Verify a remote image URL actually serves an image. GET with a range header
 * (some CDNs reject HEAD), bounded to 8s. `data:` and site-relative paths are
 * never checked here — classify.ts already handled them.
 */
export async function checkImageUrl(url: string): Promise<UrlCheck> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { range: "bytes=0-2047", "user-agent": "SMSStores-CatalogueHealth/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const contentType = res.headers.get("content-type") || "";
    const ok = (res.ok || res.status === 206) && contentType.startsWith("image/");
    // Drain/cancel the body so sockets are released promptly.
    try { await res.body?.cancel(); } catch { /* already consumed */ }
    return { ok, status: res.status, contentType };
  } catch {
    return { ok: false, status: 0, contentType: "" };
  }
}
