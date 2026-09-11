/**
 * Catalogue classification — pure logic, no database access.
 *
 * Everything that decides WHAT is wrong with a product lives here: image
 * status (missing / placeholder / broken / ok), product quality scoring,
 * duplicate detection, image-match confidence, alt text, SEO derivation and
 * SKU-filename mapping. Keeping it pure means the safety rules are covered
 * by fast node tests with no server — the same discipline as
 * src/lib/importing/engine.ts.
 *
 * REAL DATA RULE: nothing in this file invents information. SEO, alt text,
 * specifications and descriptions are assembled ONLY from fields the product
 * already has (name, brand, variant RAM/storage/colour, category, warranty).
 * Anything the data doesn't state simply isn't said.
 */

// ---------- input shapes (subsets of the DB rows, so tests need no DB) ----------

export type CatProductImage = {
  id: number;
  dataUrl: string;
  alt: string;
  sortOrder: number;
  variantColor: string;
  mediaType: string;
};

export type CatVariant = {
  id: number;
  color: string;
  storage: string;
  ram: string;
  mrp: number;
  mop: number;
  stock: number;
  sku: string;
  image: string | null;
  available: boolean;
};

export type CatProduct = {
  id: number;
  name: string;
  brand: string;
  sku: string;
  barcode: string;
  categoryId: number;
  subcategory: string;
  description: string;
  specifications: string;
  warranty: string;
  seoTitle: string;
  metaDescription: string;
  mrp: number;
  mop: number;
  stock: number;
  status: string;
  imageSource: string;
  images: CatProductImage[];
  variants: CatVariant[];
};

// ---------- image status ----------

export type ImageStatus = "ok" | "missing" | "placeholder" | "suspect_broken" | "needs_check";

/**
 * Classify a single image reference WITHOUT network access.
 *
 * - data:image/svg — the seeded placeholder art (see /api/seed) is all SVG
 *   data URLs; a real product photo is never SVG in this store.
 * - tiny raster data URLs (< ~1.5 KB) can't hold a real product photo.
 * - well-known placeholder host/path patterns.
 * - http(s) URLs can only be verified over the network → "needs_check";
 *   the job runner upgrades that to ok/broken via checkImageUrl.
 */
export function classifyImageRef(src: string | null | undefined): ImageStatus {
  const v = (src || "").trim();
  if (!v) return "missing";
  if (v.startsWith("data:image/svg")) return "placeholder";
  if (v.startsWith("data:")) {
    // Raster data URL. base64 length ≈ bytes * 4/3; anything under ~1.5 KB
    // of payload is an icon or a stub, not a product photo.
    const payload = v.length - v.indexOf(",") - 1;
    return payload < 2000 ? "placeholder" : "ok";
  }
  const lower = v.toLowerCase();
  if (
    /placehold|placeholder|dummyimage|no-image|noimage|image-not-available|missing\.(png|jpg|webp)/.test(lower)
  ) {
    return "placeholder";
  }
  if (lower.startsWith("/")) return "ok"; // our own static asset
  if (lower.startsWith("http://") || lower.startsWith("https://")) return "needs_check";
  return "suspect_broken"; // unparseable reference
}

/** The single status for a product's whole image set. */
export function productImageStatus(p: CatProduct): {
  status: "ok" | "missing" | "placeholder" | "needs_check";
  badImageIds: number[];
} {
  const stills = p.images.filter((i) => i.mediaType !== "video");
  if (stills.length === 0) return { status: "missing", badImageIds: [] };
  const statuses = stills.map((i) => ({ id: i.id, s: classifyImageRef(i.dataUrl) }));
  const bad = statuses.filter((x) => x.s === "placeholder" || x.s === "suspect_broken");
  const unchecked = statuses.filter((x) => x.s === "needs_check");
  // Placeholder-only gallery = effectively no real image.
  if (bad.length === statuses.length) return { status: "placeholder", badImageIds: bad.map((b) => b.id) };
  if (unchecked.length > 0) return { status: "needs_check", badImageIds: bad.map((b) => b.id) };
  return { status: "ok", badImageIds: bad.map((b) => b.id) };
}

// ---------- product quality score ----------

export type QualityCheck = { key: string; label: string; ok: boolean; weight: number; detail?: string };

export type QualityResult = {
  score: number; // 0–100
  checks: QualityCheck[];
  classification:
    | "complete"
    | "needs_image"
    | "placeholder"
    | "broken_image"
    | "needs_data"
    | "needs_review";
};

/**
 * Score one product. Weights sum to 100. `imageBroken` is passed in by the
 * job runner after it has actually fetched remote URLs — pure code cannot
 * know a URL is dead.
 */
export function scoreProduct(p: CatProduct, opts: { imageBroken?: boolean } = {}): QualityResult {
  const img = productImageStatus(p);
  const checks: QualityCheck[] = [];
  const add = (key: string, label: string, ok: boolean, weight: number, detail?: string) =>
    checks.push({ key, label, ok, weight, detail });

  add("identity", "Name & brand", Boolean(p.name.trim() && p.brand.trim()), 15,
    !p.name.trim() ? "Name missing" : !p.brand.trim() ? "Brand missing" : undefined);
  add("category", "Category", p.categoryId > 0, 10);
  add("image", "Real product image",
    img.status === "ok" && !opts.imageBroken, 25,
    opts.imageBroken ? "Image link is broken" :
    img.status === "missing" ? "No image" :
    img.status === "placeholder" ? "Placeholder image" : undefined);
  add("price", "Valid pricing", p.mop > 0 && (p.mrp === 0 || p.mop <= p.mrp), 15,
    p.mop <= 0 ? "Selling price missing" : p.mrp > 0 && p.mop > p.mrp ? "MOP above MRP" : undefined);
  add("stock", "Stock recorded", Number.isInteger(p.stock) && p.stock >= 0, 5);
  add("specs", "Specifications", p.specifications.trim().length > 0, 10);
  add("description", "Description", p.description.trim().length >= 20, 10,
    p.description.trim() ? "Too short" : "Missing");
  add("seo", "SEO title & meta", Boolean(p.seoTitle.trim() || p.name.trim().length >= 8) && Boolean(p.metaDescription.trim() || p.description.trim()), 5);
  // Variant coherence: every variant priced sanely and (if it has colour
  // images configured) referencing colours that exist on the variants.
  const variantOk = p.variants.every((v) => v.mop > 0 && (v.mrp === 0 || v.mop <= v.mrp));
  add("variants", "Variants valid", variantOk, 5, variantOk ? undefined : "A variant has invalid pricing");

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const score = Math.round((got / total) * 100);

  let classification: QualityResult["classification"] = "complete";
  if (opts.imageBroken) classification = "broken_image";
  else if (img.status === "missing") classification = "needs_image";
  else if (img.status === "placeholder") classification = "placeholder";
  else if (!checks.find((c) => c.key === "identity")!.ok || !checks.find((c) => c.key === "price")!.ok) classification = "needs_data";
  else if (score < 70) classification = "needs_data";
  else if (score < 100) classification = score >= 85 ? "complete" : "needs_review";

  return { score, checks, classification };
}

/** Fields a product is missing, in owner language. */
export function missingFields(p: CatProduct): string[] {
  const out: string[] = [];
  if (!p.brand.trim()) out.push("brand");
  if (!p.description.trim() || p.description.trim().length < 20) out.push("description");
  if (!p.specifications.trim()) out.push("specifications");
  if (!p.seoTitle.trim()) out.push("SEO title");
  if (!p.metaDescription.trim()) out.push("SEO description");
  if (p.mop <= 0) out.push("selling price");
  return out;
}

// ---------- duplicates ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type DuplicateGroup = { key: string; reason: "name" | "sku"; ids: number[]; names: string[] };

/**
 * Duplicate candidates: exact normalized-name collisions and SKU collisions.
 * Suggestion only — merging products is always a human decision.
 */
export function findDuplicateGroups(items: Pick<CatProduct, "id" | "name" | "brand" | "sku">[]): DuplicateGroup[] {
  const byName = new Map<string, { ids: number[]; names: string[] }>();
  const bySku = new Map<string, { ids: number[]; names: string[] }>();
  for (const p of items) {
    const nk = norm(`${p.brand} ${p.name}`);
    if (nk) {
      const e = byName.get(nk) || { ids: [], names: [] };
      e.ids.push(p.id); e.names.push(p.name);
      byName.set(nk, e);
    }
    const sk = p.sku.trim().toUpperCase();
    if (sk) {
      const e = bySku.get(sk) || { ids: [], names: [] };
      e.ids.push(p.id); e.names.push(p.name);
      bySku.set(sk, e);
    }
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, v] of byName) if (v.ids.length > 1) groups.push({ key, reason: "name", ids: v.ids, names: v.names });
  for (const [key, v] of bySku) if (v.ids.length > 1) groups.push({ key: `sku:${key}`, reason: "sku", ids: v.ids, names: v.names });
  return groups;
}

// ---------- image match confidence ----------

export type ImageCandidate = {
  url: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  officialDomain: boolean;
  width?: number;
  height?: number;
};

export type MatchTokens = {
  brand: string;
  modelTokens: string[]; // e.g. ["galaxy","s25"]
  storage: string;       // "256gb"
  ram: string;           // "8gb"
  color: string;         // "blue"
  sku: string;
};

/** Extract the identity tokens used for image matching (spec §8: SKU → model → brand → name → variant → storage → RAM → colour). */
export function matchTokens(p: CatProduct, v?: CatVariant | null): MatchTokens {
  const name = norm(p.name);
  const brand = norm(p.brand);
  const stop = new Set(["the", "and", "with", "for", "new", "gb", "ram", ...brand.split(" ")]);
  const modelTokens = name
    .split(" ")
    .filter((t) => t && !stop.has(t) && !/^\d+gb$/.test(t))
    .slice(0, 6);
  return {
    brand,
    modelTokens,
    storage: norm(v?.storage || "").replace(/\s+/g, "") || (name.match(/(\d{2,4})\s?gb/)?.[1] ? `${name.match(/(\d{2,4})\s?gb/)![1]}gb` : ""),
    ram: norm(v?.ram || "").replace(/\s+/g, ""),
    color: norm(v?.color || ""),
    sku: (v?.sku || p.sku || "").trim().toLowerCase(),
  };
}

/**
 * Confidence (0–100) that a candidate image shows exactly this product/variant.
 *
 * Hard rules, matching the spec:
 * - a candidate from a non-official domain can NEVER exceed the review band;
 * - a missing colour/storage signal caps the score below auto-approve when the
 *   variant specifies them — "Samsung Galaxy S25 256GB Blue" must not
 *   auto-match a generic S25 render in the wrong colour.
 */
export function scoreImageCandidate(c: ImageCandidate, t: MatchTokens): number {
  const hay = norm(`${c.title} ${c.url} ${c.sourceUrl}`);
  let score = 0;

  if (c.officialDomain) score += 30;
  if (t.brand && hay.includes(t.brand)) score += 10;

  const hits = t.modelTokens.filter((tok) => hay.includes(tok)).length;
  const modelRatio = t.modelTokens.length ? hits / t.modelTokens.length : 0;
  score += Math.round(modelRatio * 30);

  if (t.sku && hay.includes(t.sku)) score += 15;
  if (t.storage) score += hay.includes(t.storage) ? 10 : 0;
  if (t.color) score += hay.includes(t.color) ? 15 : 0;
  if (t.ram && hay.includes(t.ram)) score += 5;

  // Penalties: obviously-wrong content.
  if (/case|cover|tempered|screen guard|skin|pouch/.test(hay) && !/case|cover|tempered|guard/.test(norm(`${t.brand} ${t.modelTokens.join(" ")}`))) {
    score -= 40;
  }
  if ((c.width || 0) > 0 && (c.width || 0) < 300) score -= 20;

  // Caps (safety): never auto-approvable without an official domain, and
  // never auto-approvable when the variant states a colour the candidate
  // doesn't mention.
  if (!c.officialDomain) score = Math.min(score, 75);
  if (t.color && !hay.includes(t.color)) score = Math.min(score, 70);
  // Matching only half (or fewer) of the model tokens — e.g. just "Galaxy"
  // on a "Galaxy S25" — identifies the family, not the product: unusable.
  if (modelRatio <= 0.5) score = Math.min(score, 50);

  return Math.max(0, Math.min(100, score));
}

// ---------- derived (never invented) content ----------

export function buildAltText(p: CatProduct, v?: CatVariant | null): string {
  const bits = [p.brand, p.name];
  if (v) bits.push([v.ram, v.storage].filter(Boolean).join(" / "), v.color);
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 140);
}

export function buildSeoTitle(p: CatProduct, categoryName = ""): string {
  const base = [p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.brand : "", p.name]
    .filter(Boolean).join(" ");
  const suffix = categoryName ? ` | ${categoryName} | SMS Stores` : " | SMS Stores";
  return (base + suffix).slice(0, 70);
}

export function buildMetaDescription(p: CatProduct, categoryName = ""): string {
  // Built strictly from real fields. No adjectives the data doesn't earn.
  const specBit = p.specifications.trim() ? ` ${p.specifications.trim().split("\n")[0].slice(0, 60)}.` : "";
  const priceBit = p.mop > 0 ? ` Available at ₹${Math.round(p.mop).toLocaleString("en-IN")}` : "";
  const catBit = categoryName ? ` in ${categoryName}` : "";
  return `Buy ${[p.brand, p.name].filter(Boolean).join(" ")}${catBit} at SMS Stores, Bengaluru.${specBit}${priceBit}${p.mrp > p.mop && p.mop > 0 ? ` (MRP ₹${Math.round(p.mrp).toLocaleString("en-IN")})` : ""}.`
    .replace(/\s+/g, " ").slice(0, 160);
}

/** Assemble a specifications block from variant data the store already holds. */
export function buildSpecifications(p: CatProduct): string {
  if (p.specifications.trim()) return p.specifications; // never overwrite
  const lines: string[] = [];
  if (p.brand.trim()) lines.push(`Brand: ${p.brand.trim()}`);
  const rams = [...new Set(p.variants.map((v) => v.ram).filter(Boolean))];
  const storages = [...new Set(p.variants.map((v) => v.storage).filter(Boolean))];
  const colors = [...new Set(p.variants.map((v) => v.color).filter(Boolean))];
  if (rams.length) lines.push(`RAM: ${rams.join(" / ")}`);
  if (storages.length) lines.push(`Storage: ${storages.join(" / ")}`);
  if (colors.length) lines.push(`Colours: ${colors.join(", ")}`);
  if (p.warranty.trim()) lines.push(`Warranty: ${p.warranty.trim()}`);
  return lines.join("\n");
}

/** A short factual description from known fields only. Empty when we know too little to say anything honest. */
export function buildDescription(p: CatProduct, categoryName = ""): string {
  if (p.description.trim()) return p.description; // never overwrite
  const bits: string[] = [];
  const full = [p.brand, p.name].filter(Boolean).join(" ");
  if (!full.trim()) return "";
  bits.push(`${full}${categoryName ? ` — ${categoryName.toLowerCase()}` : ""} available at SMS Stores.`);
  const storages = [...new Set(p.variants.map((v) => v.storage).filter(Boolean))];
  const colors = [...new Set(p.variants.map((v) => v.color).filter(Boolean))];
  if (storages.length) bits.push(`Storage options: ${storages.join(", ")}.`);
  if (colors.length) bits.push(`Colours: ${colors.join(", ")}.`);
  if (p.warranty.trim()) bits.push(`Warranty: ${p.warranty.trim()}.`);
  bits.push("Visit our Bengaluru store or order online for delivery.");
  return bits.join(" ");
}

// ---------- publish guard (spec §23) ----------

export type RequiredField = "name" | "brand" | "categoryId" | "mop" | "mrp" | "image" | "description" | "specifications" | "sku";

export function publishBlockers(p: CatProduct, required: RequiredField[]): string[] {
  const img = productImageStatus(p);
  const blockers: string[] = [];
  for (const f of required) {
    switch (f) {
      case "name": if (!p.name.trim()) blockers.push("name"); break;
      case "brand": if (!p.brand.trim()) blockers.push("brand"); break;
      case "categoryId": if (!(p.categoryId > 0)) blockers.push("category"); break;
      case "mop": if (!(p.mop > 0)) blockers.push("selling price"); break;
      case "mrp": if (!(p.mrp > 0)) blockers.push("MRP"); break;
      case "image": if (img.status === "missing" || img.status === "placeholder") blockers.push("real product image"); break;
      case "description": if (!p.description.trim()) blockers.push("description"); break;
      case "specifications": if (!p.specifications.trim()) blockers.push("specifications"); break;
      case "sku": if (!p.sku.trim()) blockers.push("SKU"); break;
    }
  }
  return blockers;
}

// ---------- SKU-filename mapping (spec §11) ----------

export type FileMapSuggestion = {
  fileName: string;
  productId: number | null;
  variantId: number | null;
  productName: string;
  variantLabel: string;
  matchedBy: "variantSku" | "productSku" | "name" | null;
  confidence: number;
};

/**
 * Map "S25-BLU-256-01.jpg" style filenames to products/variants by SKU.
 * Trailing numeric indices (-01, _2) are ignored; matching is
 * case-insensitive and separator-insensitive.
 */
export function mapFilenamesToSkus(
  fileNames: string[],
  items: { id: number; name: string; sku: string; variants: { id: number; sku: string; color: string; storage: string; ram: string }[] }[]
): FileMapSuggestion[] {
  const cleanSku = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const productBySku = new Map<string, { id: number; name: string }>();
  const variantBySku = new Map<string, { pid: number; vid: number; name: string; label: string }>();
  for (const p of items) {
    if (p.sku.trim()) productBySku.set(cleanSku(p.sku), { id: p.id, name: p.name });
    for (const v of p.variants) {
      if (v.sku.trim()) {
        variantBySku.set(cleanSku(v.sku), {
          pid: p.id, vid: v.id, name: p.name,
          label: [v.ram, v.storage, v.color].filter(Boolean).join(" · "),
        });
      }
    }
  }

  return fileNames.map((fileName) => {
    const base = fileName.replace(/\.[a-z0-9]+$/i, "");
    // strip trailing photo index: -01, _2, (3)
    const noIndex = base.replace(/[\s_\-.(]*\d{1,2}\)?$/i, "");
    const keys = [cleanSku(base), cleanSku(noIndex)].filter(Boolean);

    for (const k of keys) {
      const v = variantBySku.get(k);
      if (v) return { fileName, productId: v.pid, variantId: v.vid, productName: v.name, variantLabel: v.label, matchedBy: "variantSku" as const, confidence: 98 };
    }
    for (const k of keys) {
      const p = productBySku.get(k);
      if (p) return { fileName, productId: p.id, variantId: null, productName: p.name, variantLabel: "", matchedBy: "productSku" as const, confidence: 95 };
    }
    // Loose name match: every word of the filename appears in a product name.
    const words = norm(base.replace(/[-_.]/g, " ")).split(" ").filter((w) => w.length > 1);
    if (words.length >= 2) {
      const hit = items.find((p) => {
        const n = norm(p.name);
        return words.every((w) => n.includes(w));
      });
      if (hit) return { fileName, productId: hit.id, variantId: null, productName: hit.name, variantLabel: "", matchedBy: "name" as const, confidence: 65 };
    }
    return { fileName, productId: null, variantId: null, productName: "", variantLabel: "", matchedBy: null, confidence: 0 };
  });
}
