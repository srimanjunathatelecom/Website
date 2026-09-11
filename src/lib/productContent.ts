// Shared, framework-free parsing/derivation helpers for product detail content.
//
// Everything here reads admin-managed database text fields and turns them into
// structures the PDP can render. Nothing in this file invents data: an empty or
// malformed field yields an empty result so callers can hide the section.

export type Highlight = { icon: string; detail: string; headline: string };

/**
 * `product.highlights`, one per line: "icon | detail | headline".
 * Headline is optional (a bare "512 GB ROM" line has no bold sub-line).
 */
export function parseHighlights(raw: unknown): Highlight[] {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [icon, detail, headline] = line.split("|").map((s) => (s || "").trim());
      return { icon: (icon || "").toLowerCase(), detail: detail || "", headline: headline || "" };
    })
    .filter((h) => h.detail);
}

export type SpecRow = { label: string; value: string };
export type SpecGroup = { title: string; rows: SpecRow[] };

/**
 * `product.specifications`. Historically a flat list of "Label | Value" (or
 * "Label: Value") lines. Grouping is opt-in and additive: a line starting with
 * "## " opens a named group, and every following row belongs to it. Rows before
 * the first heading land in an untitled group, so existing product data keeps
 * rendering exactly as before with no migration.
 */
export function parseSpecGroups(raw: unknown): SpecGroup[] {
  const groups: SpecGroup[] = [];
  let current: SpecGroup | null = null;

  const lines = String(raw || "")
    // Legacy rows were comma-separated on a single line in some products.
    .split(/\r?\n/)
    .flatMap((line) => (line.includes("|") || line.trim().startsWith("##") ? [line] : line.split(",")))
    .map((s) => s.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("##")) {
      const title = line.replace(/^#+/, "").trim();
      current = { title, rows: [] };
      groups.push(current);
      continue;
    }
    const sepIndex = line.includes("|") ? line.indexOf("|") : line.indexOf(":");
    const label = (sepIndex >= 0 ? line.slice(0, sepIndex) : line).trim();
    const value = sepIndex >= 0 ? line.slice(sepIndex + 1).trim() : "";
    if (!label) continue;
    if (!current) {
      current = { title: "", rows: [] };
      groups.push(current);
    }
    current.rows.push({ label, value: value || "Yes" });
  }

  return groups.filter((g) => g.rows.length > 0);
}

/**
 * `product.boxContents` — one item per line (blank field means the admin has
 * not filled it in, so the PDP hides the section rather than guessing).
 */
export function parseBoxContents(raw: unknown): string[] {
  return String(raw || "")
    .split(/\r?\n|,/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Colour swatch fill. Prefers the admin-entered hex on the variant; the name
 * lookup is only a fallback for products whose variants predate `colorHex`.
 */
export function colorSwatchHex(colorName: string, colorHex?: string | null): string {
  const hex = String(colorHex || "").trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return hex;
  const name = (colorName || "").toLowerCase();
  if (name.includes("lavender") || name.includes("purple")) return "#c4b5fd";
  if (name.includes("grey") || name.includes("gray") || name.includes("graphite")) return "#4b5563";
  if (name.includes("orange")) return "#fb923c";
  if (name.includes("black") || name.includes("midnight")) return "#1f2937";
  if (name.includes("silver")) return "#e2e8f0";
  if (name.includes("white")) return "#f8fafc";
  if (name.includes("blue") || name.includes("sky") || name.includes("navy")) return "#60a5fa";
  if (name.includes("green") || name.includes("mint")) return "#34d399";
  if (name.includes("red") || name.includes("crimson")) return "#f87171";
  if (name.includes("gold") || name.includes("beige") || name.includes("cream")) return "#fbbf24";
  if (name.includes("pink") || name.includes("rose")) return "#f9a8d4";
  return "#e5e7eb";
}

// ---------------------------------------------------------------------------
// Variant matrix
// ---------------------------------------------------------------------------

export type PdpVariant = {
  id: number;
  color: string;
  colorHex?: string | null;
  swatchImage?: string | null;
  storage: string;
  ram: string;
  mrp: number | string;
  mop: number | string;
  stock: number;
  sku: string;
  image?: string | null;
  available?: boolean;
  sortOrder?: number;
};

/** "12 GB + 256 GB" style label used by the configuration selector. */
export function configLabel(v: { ram?: string; storage?: string }): string {
  const ram = (v.ram || "").trim();
  const storage = (v.storage || "").trim();
  if (ram && storage) return `${ram} + ${storage}`;
  return ram || storage;
}

/** Human label stored on the cart line and order item. */
export function variantLabel(v: { ram?: string; storage?: string; color?: string }): string {
  const config = configLabel(v);
  const color = (v.color || "").trim();
  return [config, color].filter(Boolean).join(" · ");
}

export function variantSellable(v: PdpVariant): boolean {
  return v.available !== false && Number(v.stock) > 0;
}

export type VariantMatrix = {
  /** Only variants the shop can actually sell a configuration of. */
  variants: PdpVariant[];
  colors: { name: string; hex: string; swatchImage: string; sellable: boolean }[];
  configs: { label: string; sellable: boolean }[];
  /** true when the (config, color) pair exists in the backend at all. */
  exists: (config: string, color: string) => boolean;
  /** true when the pair exists AND is available with stock. */
  sellable: (config: string, color: string) => boolean;
  find: (config: string, color: string) => PdpVariant | undefined;
};

/**
 * Builds the selectable option sets plus the existence/sellability lookups the
 * pickers need, so the PDP can disable combinations that were never created in
 * Admin instead of silently falling back to an unrelated variant.
 */
export function buildVariantMatrix(raw: PdpVariant[] | null | undefined): VariantMatrix {
  const variants = (raw || []).filter(Boolean);
  const sorted = [...variants].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id
  );

  const key = (config: string, color: string) => `${config}||${color}`;
  const byKey = new Map<string, PdpVariant>();
  for (const v of sorted) {
    const k = key(configLabel(v), (v.color || "").trim());
    // First match wins so admin sort order decides which row represents a pair.
    if (!byKey.has(k)) byKey.set(k, v);
  }

  const colorMap = new Map<string, { name: string; hex: string; swatchImage: string; sellable: boolean }>();
  for (const v of sorted) {
    const name = (v.color || "").trim();
    if (!name) continue;
    const prev = colorMap.get(name);
    const sellable = variantSellable(v);
    if (!prev) {
      colorMap.set(name, {
        name,
        hex: colorSwatchHex(name, v.colorHex),
        swatchImage: String(v.swatchImage || ""),
        sellable,
      });
    } else if (sellable) {
      prev.sellable = true;
    }
  }

  const configMap = new Map<string, { label: string; sellable: boolean }>();
  for (const v of sorted) {
    const label = configLabel(v);
    if (!label) continue;
    const prev = configMap.get(label);
    const sellable = variantSellable(v);
    if (!prev) configMap.set(label, { label, sellable });
    else if (sellable) prev.sellable = true;
  }

  const find = (config: string, color: string) => {
    // When a product varies on only one axis the other side is an empty string,
    // so an exact-key hit covers colour-only and storage-only products too.
    const exact = byKey.get(key(config, color));
    if (exact) return exact;
    if (!color) return sorted.find((v) => configLabel(v) === config);
    if (!config) return sorted.find((v) => (v.color || "").trim() === color);
    return undefined;
  };

  return {
    variants: sorted,
    colors: [...colorMap.values()],
    configs: [...configMap.values()],
    exists: (config, color) => !!find(config, color),
    sellable: (config, color) => {
      const v = find(config, color);
      return !!v && variantSellable(v);
    },
    find,
  };
}

/**
 * Picks the variant the PDP should open on: the first sellable one in admin
 * order, else the first that exists, so the price shown always belongs to a
 * real combination.
 */
export function defaultVariant(matrix: VariantMatrix): PdpVariant | undefined {
  return matrix.variants.find(variantSellable) || matrix.variants[0];
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type Badge = { key: string; label: string; tone: string };

/**
 * Badge chips are entirely admin-driven flags on the product row, including the
 * free-text `saleBadge`. Low stock uses the product's own threshold.
 */
export function productBadges(p: {
  bestseller?: boolean;
  newArrival?: boolean;
  trending?: boolean;
  limitedStock?: boolean;
  hotDeal?: boolean;
  saleBadge?: string | null;
}): Badge[] {
  const out: Badge[] = [];
  if (p.bestseller)
    out.push({ key: "bestseller", label: "Bestseller", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" });
  if (p.newArrival)
    out.push({ key: "new", label: "New Arrival", tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" });
  if (p.trending)
    out.push({ key: "trending", label: "Trending", tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" });
  if (p.hotDeal)
    out.push({ key: "hotDeal", label: "Hot Deal", tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" });
  if (p.limitedStock)
    out.push({ key: "limitedStock", label: "Limited Stock", tone: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" });
  if (p.saleBadge && String(p.saleBadge).trim())
    out.push({ key: "sale", label: String(p.saleBadge).trim(), tone: "bg-fuchsia-600 text-white" });
  return out;
}
