/**
 * Smart column mapping: recognise what each spreadsheet column means from
 * its header, whatever reasonable name the sheet uses ("Qty", "quantity",
 * "Stock Count", "Available Units" → stock).
 *
 * The admin can always correct the guess in the wizard; corrected mappings
 * are remembered per header signature (see import_mappings) so the same
 * sheet layout never has to be corrected twice.
 */

/** Every column an import file can carry. Anything unrecognised is ignored. */
export const IMPORT_FIELDS = [
  "id",
  "sku",
  "barcode",
  "name",
  "brand",
  "category",
  "variantSku",
  "color",
  "ram",
  "storage",
  "mrp",
  "mop",
  "costPrice",
  "gstRate",
  "hsn",
  "stock",
  "lowStockThreshold",
  "status",
  "warranty",
  "description",
  "specifications",
  "seoTitle",
  "metaDescription",
  "exportedAt",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Human labels + one-line explanations shown in the mapping step. */
export const FIELD_LABELS: Record<ImportField, string> = {
  id: "Product ID",
  sku: "SKU",
  barcode: "Barcode",
  name: "Product name",
  brand: "Brand",
  category: "Category",
  variantSku: "Variant SKU",
  color: "Colour",
  ram: "RAM",
  storage: "Storage",
  mrp: "MRP",
  mop: "Selling price",
  costPrice: "Cost price",
  gstRate: "GST %",
  hsn: "HSN code",
  stock: "Stock",
  lowStockThreshold: "Low-stock alert level",
  status: "Status (active/hidden)",
  warranty: "Warranty",
  description: "Description",
  specifications: "Specifications",
  seoTitle: "SEO title",
  metaDescription: "SEO description",
  exportedAt: "Exported at (from our export files)",
};

function norm(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Synonyms per field. Matched against the normalised header; first field
 * whose synonym list contains the header wins, then prefix/contains rules
 * cover mild variations ("stock count", "opening stock").
 */
const SYNONYMS: Record<ImportField, string[]> = {
  id: ["id", "product id", "productid", "prod id", "item id"],
  sku: ["sku", "sku code", "item code", "product code", "code", "model no", "model number", "part number", "part no"],
  barcode: ["barcode", "bar code", "ean", "upc", "gtin", "scan code"],
  name: ["name", "product name", "item name", "title", "product title", "product", "item", "description of goods"],
  brand: ["brand", "brand name", "make", "manufacturer", "company"],
  category: ["category", "product category", "cat", "type", "product type", "department"],
  variantSku: ["variant sku", "variant code", "variant id sku", "sku variant"],
  color: ["color", "colour", "shade", "variant color", "variant colour"],
  ram: ["ram", "memory", "ram gb"],
  storage: ["storage", "rom", "internal storage", "capacity", "storage gb", "memory size"],
  mrp: ["mrp", "max retail price", "maximum retail price", "list price", "mrp rs", "mrp inr"],
  mop: [
    "mop", "selling price", "sale price", "sell price", "price", "offer price", "our price",
    "net price", "final price", "selling rate", "rate",
  ],
  costPrice: ["cost price", "cost", "purchase price", "buying price", "landing price", "landing cost", "dealer price", "cp"],
  gstRate: ["gst", "gst rate", "gst percent", "tax", "tax rate", "tax percent", "igst"],
  hsn: ["hsn", "hsn code", "hsn sac", "sac code"],
  stock: [
    "stock", "qty", "quantity", "stock qty", "stock quantity", "available", "available stock",
    "available units", "units", "on hand", "in stock", "count", "stock count", "closing stock",
    "opening stock", "physical stock", "adjustment", "change", "received", "received qty", "new stock",
  ],
  lowStockThreshold: ["low stock threshold", "low stock alert", "low stock level", "reorder level", "min stock", "minimum stock", "alert level"],
  status: ["status", "visibility", "active", "published", "state"],
  warranty: ["warranty", "warranty period", "guarantee"],
  description: ["description", "product description", "details", "long description", "about"],
  specifications: ["specifications", "specs", "specification", "features", "tech specs"],
  seoTitle: ["seo title", "meta title", "page title"],
  metaDescription: ["meta description", "seo description", "meta desc"],
  exportedAt: ["exported at", "export date", "exported on", "generated at"],
};

/** Does this header look like any known column? Used for header-row detection. */
export function looksLikeKnownHeader(header: string): boolean {
  return guessField(header) !== null;
}

export function guessField(header: string): ImportField | null {
  const h = norm(header);
  if (!h) return null;
  // Pass 1: exact synonym match — unambiguous.
  for (const field of IMPORT_FIELDS) {
    if (SYNONYMS[field].includes(h)) return field;
  }
  // Pass 2: header starts with or contains a synonym of 3+ chars
  // ("stock as on 21 aug" → stock, "mrp (incl gst)" → mrp). Longer synonyms
  // are tried first so "variant sku" beats "sku" and "cost price" beats "price".
  const candidates: { field: ImportField; syn: string }[] = [];
  for (const field of IMPORT_FIELDS) {
    for (const syn of SYNONYMS[field]) {
      if (syn.length >= 3 && (h.startsWith(syn + " ") || h.includes(" " + syn) || h.includes(syn))) {
        candidates.push({ field, syn });
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.syn.length - a.syn.length);
  return candidates[0].field;
}

export type Mapping = Record<number, ImportField>; // column index → field

/** Auto-map headers; later duplicate columns for the same field are ignored. */
export function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<ImportField>();
  headers.forEach((header, idx) => {
    const field = guessField(header);
    if (field && !used.has(field)) {
      mapping[idx] = field;
      used.add(field);
    }
  });
  return mapping;
}

/**
 * Stable fingerprint of a header row, used as the key for remembered
 * mappings. Order matters (column position is part of the mapping) but case
 * and punctuation don't.
 */
export function headerSignature(headers: string[]): string {
  return headers.map(norm).join("|");
}
