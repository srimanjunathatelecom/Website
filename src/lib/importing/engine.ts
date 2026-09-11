/**
 * The import planner: pure logic, no database access.
 *
 * Given the parsed sheet, the chosen mode, the column mapping and a snapshot
 * of the current catalogue, it decides — for every row — exactly what would
 * happen: which product/variant it matches (and by which key), what would
 * change (old → new for every field), and everything that looks wrong or
 * dangerous. The API routes feed it data and apply its plan; keeping it pure
 * means every safety rule here is covered by fast node tests with no server.
 *
 * Matching order is identity-first, exactly as the audit spec requires:
 *   Product ID → variant SKU → SKU → barcode → (name: suggestion only).
 * A name match is never applied automatically — formatting differences in
 * names must never create duplicate products or update the wrong one.
 */

import type { ImportField, Mapping } from "./mapping";

export type ImportMode = "snapshot" | "receipt" | "adjust" | "reconcile" | "product" | "price";

export const MODE_INFO: Record<ImportMode, { label: string; explain: string }> = {
  snapshot: {
    label: "Stock count (replace)",
    explain: "The sheet has the FULL current stock for the listed items. Stock 15 means: set stock to 15.",
  },
  receipt: {
    label: "New stock received (add)",
    explain: "The sheet lists NEW stock that arrived. Stock 10 means: add 10 on top of current stock.",
  },
  adjust: {
    label: "Adjustment (+ / −)",
    explain: "The sheet has corrections. Stock -2 means: reduce by 2 (damage, theft, counting error). +3 adds 3.",
  },
  reconcile: {
    label: "Full inventory reconciliation",
    explain:
      "Like a stock count, but also lists every product that is MISSING from the sheet, so you can decide what to do with items you no longer stock. Nothing is deleted unless you choose it.",
  },
  product: {
    label: "Products (add / update details)",
    explain:
      "Create new products or update details — names, prices, brand, category, GST, descriptions. Only the columns present in your sheet are touched; everything else stays as it is.",
  },
  price: {
    label: "Price update only",
    explain: "Only MRP, selling price and cost price are changed. Stock and all other details are ignored.",
  },
};

// ---------- catalogue snapshot (loaded by the route, consumed here) ----------

export type CatalogVariant = {
  id: number;
  productId: number;
  sku: string;
  barcode: string;
  color: string;
  ram: string;
  storage: string;
  mrp: number;
  mop: number;
  stock: number;
  stockUpdatedAt: Date | null;
};

export type CatalogProduct = {
  id: number;
  name: string;
  brand: string;
  categoryId: number;
  sku: string;
  barcode: string;
  mrp: number;
  mop: number;
  stock: number;
  status: string;
  stockUpdatedAt: Date | null;
  variants: CatalogVariant[];
};

export type Catalog = {
  products: CatalogProduct[];
  categories: { id: number; name: string }[];
};

// ---------- plan output ----------

export type FieldChange = { field: string; label: string; from: string; to: string };

export type RowPlan = {
  rowNum: number; // 1-based row number in the original file (for error reports)
  action: "create" | "update" | "new_variant" | "update_variant" | "conflict" | "error" | "skip";
  productId: number | null;
  variantId: number | null;
  matchedBy: "id" | "variantSku" | "sku" | "barcode" | "name" | null;
  sku: string;
  name: string;
  /** Raw values from the sheet — ONLY the columns the file actually had. */
  payload: Partial<Record<ImportField, string>>;
  /** Field-level old → new, for the preview table and the audit trail. */
  changes: FieldChange[];
  /** Stock arithmetic for stock modes: what the admin must see before committing. */
  stock: { current: number; sheet: number; next: number } | null;
  warnings: string[];
  error: string;
};

export type PlanSummary = {
  totalRows: number;
  creates: number;
  updates: number;
  newVariants: number;
  variantUpdates: number;
  conflicts: number;
  errors: number;
  skips: number;
  /** Total stock across matched items before and after commit. */
  stockBefore: number;
  stockAfter: number;
  warnings: number;
  /** Rows whose target's stock changed in the DB after the sheet was exported. */
  staleRows: number;
  /** Reconcile only: catalogue items the sheet does not mention. */
  missing: { productId: number; variantId: number | null; name: string; sku: string; stock: number }[];
};

export type PlanResult = { rows: RowPlan[]; summary: PlanSummary };

export type PlanOptions = {
  /** Apply unique name-only matches as updates (off by default — suggestion only). */
  allowNameMatch?: boolean;
  /** From the sheet's "Exported At" column, if present: when the file was generated. */
  exportedAt?: Date | null;
};

// ---------- value parsing ----------

/** "₹89,999.00" → 89999; "" → null; junk → NaN. */
export function parseMoney(raw: string): number | null {
  const s = raw.replace(/[₹$]|rs\.?/gi, "").replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "+10" → 10, "-2" → -2, "10" → 10; "" → null; junk/decimals → NaN. */
export function parseQty(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN;
  return n;
}

/** Sentinel: a cell containing exactly CLEAR empties a text field on purpose. */
export function isClear(raw: string): boolean {
  return raw.trim().toUpperCase() === "CLEAR";
}

export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "256 GB" / "256gb" / "256" → "256gb"-style token for variant attribute matching. */
export function normAttr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

// ---------- the planner ----------

const TEXT_FIELDS: { field: ImportField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "brand", label: "Brand" },
  { field: "sku", label: "SKU" },
  { field: "barcode", label: "Barcode" },
  { field: "hsn", label: "HSN code" },
  { field: "warranty", label: "Warranty" },
  { field: "description", label: "Description" },
  { field: "specifications", label: "Specifications" },
  { field: "seoTitle", label: "SEO title" },
  { field: "metaDescription", label: "SEO description" },
];

export function planImport(
  dataRows: string[][],
  headerRowIndex: number,
  mapping: Mapping,
  mode: ImportMode,
  catalog: Catalog,
  opts: PlanOptions = {}
): PlanResult {
  // ---- index the catalogue for O(1) matching ----
  const byId = new Map<number, CatalogProduct>();
  const bySku = new Map<string, CatalogProduct[]>();
  const byBarcode = new Map<string, CatalogProduct[]>();
  const byName = new Map<string, CatalogProduct[]>();
  const variantBySku = new Map<string, CatalogVariant[]>();
  const variantByBarcode = new Map<string, CatalogVariant[]>();

  const push = <K,>(m: Map<K, CatalogProduct[]>, k: K, v: CatalogProduct) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  const pushV = <K,>(m: Map<K, CatalogVariant[]>, k: K, v: CatalogVariant) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };

  for (const p of catalog.products) {
    byId.set(p.id, p);
    if (p.sku) push(bySku, p.sku.toLowerCase(), p);
    if (p.barcode) push(byBarcode, p.barcode.toLowerCase(), p);
    const n = normName(p.name);
    if (n) push(byName, n, p);
    for (const v of p.variants) {
      if (v.sku) pushV(variantBySku, v.sku.toLowerCase(), v);
      if (v.barcode) pushV(variantByBarcode, v.barcode.toLowerCase(), v);
    }
  }
  const categoryByName = new Map(catalog.categories.map((c) => [normName(c.name), c]));

  // Rows already claimed in this file — the same physical item listed twice
  // must not be added or overwritten twice.
  const claimed = new Map<string, number>(); // "p:12" / "v:34" → rowNum

  const rows: RowPlan[] = [];
  const summary: PlanSummary = {
    totalRows: 0,
    creates: 0,
    updates: 0,
    newVariants: 0,
    variantUpdates: 0,
    conflicts: 0,
    errors: 0,
    skips: 0,
    stockBefore: 0,
    stockAfter: 0,
    warnings: 0,
    staleRows: 0,
    missing: [],
  };

  const seenTargets = new Set<string>(); // for reconcile "missing" report

  for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const rowNum = i + 1;

    // Collect ONLY mapped, present columns. A column the file doesn't have
    // simply doesn't exist in payload — that is the partial-update guarantee.
    const payload: Partial<Record<ImportField, string>> = {};
    for (const [idxStr, field] of Object.entries(mapping)) {
      const idx = Number(idxStr);
      const raw = (cells[idx] ?? "").trim();
      if (raw !== "") payload[field] = raw;
    }

    const plan: RowPlan = {
      rowNum,
      action: "skip",
      productId: null,
      variantId: null,
      matchedBy: null,
      sku: payload.variantSku || payload.sku || "",
      name: payload.name || "",
      payload,
      changes: [],
      stock: null,
      warnings: [],
      error: "",
    };
    rows.push(plan);
    summary.totalRows++;

    const fail = (msg: string) => {
      plan.action = "error";
      plan.error = msg;
      summary.errors++;
    };

    if (Object.keys(payload).length === 0) {
      plan.action = "skip";
      summary.skips++;
      continue;
    }

    // ---- 1. match ----
    let product: CatalogProduct | null = null;
    let variant: CatalogVariant | null = null;

    if (payload.id !== undefined) {
      const id = parseQty(payload.id);
      if (id === null || Number.isNaN(id) || !byId.has(id)) {
        fail(`No product with ID "${payload.id}" exists. Check the ID column, or leave it blank to match by SKU.`);
        continue;
      }
      product = byId.get(id!)!;
      plan.matchedBy = "id";
    }

    if (payload.variantSku) {
      const hits = variantBySku.get(payload.variantSku.toLowerCase()) || [];
      if (hits.length > 1) {
        fail(`Variant SKU "${payload.variantSku}" belongs to ${hits.length} different variants — fix the duplicate SKUs first (Products → edit variants).`);
        continue;
      }
      if (hits.length === 1) {
        if (product && hits[0].productId !== product.id) {
          fail(`Row mixes identities: ID ${product.id} is "${product.name}" but variant SKU "${payload.variantSku}" belongs to a different product.`);
          continue;
        }
        variant = hits[0];
        product = byId.get(variant.productId) || product;
        if (!plan.matchedBy) plan.matchedBy = "variantSku";
      }
    }

    if (!product && payload.sku) {
      const pHits = bySku.get(payload.sku.toLowerCase()) || [];
      if (pHits.length > 1) {
        fail(`SKU "${payload.sku}" is on ${pHits.length} different products — fix the duplicate SKUs first, then re-import.`);
        continue;
      }
      if (pHits.length === 1) {
        product = pHits[0];
        plan.matchedBy = "sku";
      } else {
        // A bare "SKU" column in many sheets actually holds variant SKUs.
        const vHits = variantBySku.get(payload.sku.toLowerCase()) || [];
        if (vHits.length === 1) {
          variant = vHits[0];
          product = byId.get(variant.productId) || null;
          plan.matchedBy = "sku";
        } else if (vHits.length > 1) {
          fail(`SKU "${payload.sku}" is on ${vHits.length} different variants — fix the duplicate SKUs first, then re-import.`);
          continue;
        }
      }
    }

    if (!product && payload.barcode) {
      const pHits = byBarcode.get(payload.barcode.toLowerCase()) || [];
      const vHits = variantByBarcode.get(payload.barcode.toLowerCase()) || [];
      if (pHits.length + vHits.length > 1) {
        fail(`Barcode "${payload.barcode}" is on more than one item — fix the duplicates first.`);
        continue;
      }
      if (pHits.length === 1) {
        product = pHits[0];
        plan.matchedBy = "barcode";
      } else if (vHits.length === 1) {
        variant = vHits[0];
        product = byId.get(variant.productId) || null;
        plan.matchedBy = "barcode";
      }
    }

    // Name: suggestion only, never an automatic match (unless explicitly allowed).
    if (!product && payload.name) {
      const hits = byName.get(normName(payload.name)) || [];
      if (hits.length === 1) {
        if (opts.allowNameMatch) {
          product = hits[0];
          plan.matchedBy = "name";
          plan.warnings.push(`Matched by name only (no ID/SKU in this row) to "${hits[0].name}" (ID ${hits[0].id}).`);
        } else if (mode === "product") {
          plan.action = "conflict";
          plan.productId = hits[0].id;
          plan.warnings.push(
            `A product with this exact name already exists: "${hits[0].name}" (ID ${hits[0].id}). ` +
              `To update it, add its ID or SKU to this row. To apply name-only matches, tick "Match by name" and preview again. Nothing was changed.`
          );
          summary.conflicts++;
          continue;
        }
      } else if (hits.length > 1 && mode === "product") {
        plan.action = "conflict";
        plan.warnings.push(`${hits.length} existing products share this name. Add an ID or SKU column to say which one you mean. Nothing was changed.`);
        summary.conflicts++;
        continue;
      }
    }

    // ---- 2. variant resolution by attributes (Blue + 256GB must never touch Black) ----
    const wantsAttrs = Boolean(payload.color || payload.ram || payload.storage);
    if (product && !variant && wantsAttrs) {
      const matches = product.variants.filter((v) => {
        if (payload.color !== undefined && normAttr(v.color) !== normAttr(payload.color)) return false;
        if (payload.ram !== undefined && normAttr(v.ram) !== normAttr(payload.ram)) return false;
        if (payload.storage !== undefined && normAttr(v.storage) !== normAttr(payload.storage)) return false;
        return true;
      });
      if (matches.length === 1) {
        variant = matches[0];
      } else if (matches.length > 1) {
        fail(
          `"${product.name}": ${matches.length} variants match colour/RAM/storage "${[payload.color, payload.ram, payload.storage].filter(Boolean).join(" / ")}". Add more detail (or the variant SKU) so exactly one matches.`
        );
        continue;
      } else if (product.variants.length > 0 || mode === "product") {
        // No such combination yet.
        if (mode === "product") {
          plan.action = "new_variant";
        } else {
          fail(
            `"${product.name}" has no ${[payload.color, payload.ram, payload.storage].filter(Boolean).join(" / ")} variant. Add the variant first (Products → variants) or import it with a Products file.`
          );
          continue;
        }
      }
    }

    // If the product has variants, stock lives on the variants — a stock row
    // that matched only the product would silently be overwritten by the
    // variant rollup, so make the admin say which variant they mean.
    if (
      product && !variant && plan.action !== "new_variant" &&
      product.variants.length > 0 &&
      mode !== "product" && mode !== "price" &&
      payload.stock !== undefined
    ) {
      fail(
        `"${product.name}" has ${product.variants.length} variants — stock is tracked per variant. Add colour/RAM/storage or variant SKU columns so the right variant is updated.`
      );
      continue;
    }

    // ---- 3. not matched at all ----
    if (!product && plan.action !== "new_variant") {
      if (mode === "product") {
        plan.action = "create";
      } else {
        fail(
          payload.sku || payload.barcode
            ? `No product found with SKU/barcode "${payload.sku || payload.barcode}". New products must be added with a Products import or Quick Add first.`
            : `Could not identify this row — add an ID, SKU or barcode column.` +
              (payload.name ? ` (No exact name match for "${payload.name}".)` : "")
        );
        continue;
      }
    }

    if (product) plan.productId = product.id;
    if (variant) plan.variantId = variant.id;
    if (!plan.name && product) plan.name = product.name;
    if (!plan.sku) plan.sku = variant?.sku || product?.sku || "";

    // ---- 4. duplicate rows for the same target in one file ----
    const key = variant ? `v:${variant.id}` : product ? `p:${product.id}` : `new:${normName(payload.name || String(rowNum))}`;
    const firstRow = claimed.get(key);
    if (firstRow !== undefined) {
      fail(`This item already appears on row ${firstRow} of this file. Remove one of the rows — importing both would apply the change twice.`);
      continue;
    }
    claimed.set(key, rowNum);
    seenTargets.add(key);

    // ---- 5. stale check (sheet older than the last stock movement) ----
    const target = variant ?? product;
    if (opts.exportedAt && target?.stockUpdatedAt && target.stockUpdatedAt > opts.exportedAt && payload.stock !== undefined && mode !== "product" && mode !== "price") {
      plan.warnings.push(
        `Stock changed on the website AFTER this sheet was exported (sheet: ${opts.exportedAt.toLocaleString("en-IN")}, last change: ${target.stockUpdatedAt.toLocaleString("en-IN")}). Current stock is ${target.stock} — make sure the sheet's number is still right.`
      );
      summary.staleRows++;
    }

    // ---- 6. build the changes ----
    const isCreate = plan.action === "create" || plan.action === "new_variant";
    const cur = variant ?? product ?? null;

    // 6a. prices (product/price mode; ignored in stock modes)
    if (mode === "product" || mode === "price") {
      const mrpRaw = payload.mrp !== undefined ? parseMoney(payload.mrp) : null;
      const mopRaw = payload.mop !== undefined ? parseMoney(payload.mop) : null;
      if (Number.isNaN(mrpRaw)) { fail(`MRP "${payload.mrp}" is not a number.`); continue; }
      if (Number.isNaN(mopRaw)) { fail(`Selling price "${payload.mop}" is not a number.`); continue; }
      if (mrpRaw !== null && mrpRaw < 0) { fail(`MRP cannot be negative (${mrpRaw}).`); continue; }
      if (mopRaw !== null && mopRaw < 0) { fail(`Selling price cannot be negative (${mopRaw}).`); continue; }

      const nextMrp = mrpRaw ?? cur?.mrp ?? null;
      const nextMop = mopRaw ?? cur?.mop ?? null;
      if (nextMrp !== null && nextMop !== null && nextMop > nextMrp) {
        fail(`Selling price ₹${nextMop} is higher than MRP ₹${nextMrp}. Fix the prices in the sheet.`);
        continue;
      }
      if (mopRaw !== null && cur && cur.mop > 0 && mopRaw < cur.mop * 0.5) {
        const pct = Math.round((1 - mopRaw / cur.mop) * 100);
        plan.warnings.push(`⚠ Selling price drops ${pct}% (₹${cur.mop} → ₹${mopRaw}). Double-check this is intended.`);
      }
      if (mrpRaw !== null && (isCreate || mrpRaw !== cur?.mrp)) plan.changes.push({ field: "mrp", label: "MRP", from: fmt(cur?.mrp ?? null), to: fmt(mrpRaw) });
      if (mopRaw !== null && (isCreate || mopRaw !== cur?.mop)) plan.changes.push({ field: "mop", label: "Selling price", from: fmt(cur?.mop ?? null), to: fmt(mopRaw) });
      if (payload.costPrice !== undefined) {
        const cost = parseMoney(payload.costPrice);
        if (Number.isNaN(cost) || (cost !== null && cost < 0)) { fail(`Cost price "${payload.costPrice}" is not a valid amount.`); continue; }
        if (cost !== null) plan.changes.push({ field: "costPrice", label: "Cost price", from: "(unchanged)", to: fmt(cost) });
      }
      if (payload.gstRate !== undefined && mode === "product") {
        const gst = parseMoney(payload.gstRate);
        if (Number.isNaN(gst) || (gst !== null && (gst < 0 || gst > 100))) { fail(`GST % "${payload.gstRate}" must be between 0 and 100.`); continue; }
        if (gst !== null) plan.changes.push({ field: "gstRate", label: "GST %", from: "(unchanged)", to: fmt(gst) });
      }
    }

    // 6b. stock
    const wantsStock = payload.stock !== undefined && mode !== "price";
    if (wantsStock) {
      const qty = parseQty(payload.stock!);
      if (qty === null || Number.isNaN(qty)) { fail(`Stock "${payload.stock}" is not a whole number.`); continue; }
      const current = isCreate ? 0 : (cur?.stock ?? 0);
      let next: number;
      if (mode === "receipt") {
        if (qty < 0) { fail(`Received quantity cannot be negative (${qty}). Use "Adjustment" mode for corrections.`); continue; }
        next = current + qty;
      } else if (mode === "adjust") {
        next = current + qty;
        if (next < 0) { fail(`Adjustment of ${qty} would take stock below zero (current: ${current}).`); continue; }
      } else {
        // snapshot / reconcile / product
        if (qty < 0) { fail(`Stock cannot be negative (${qty}).`); continue; }
        next = qty;
      }
      plan.stock = { current, sheet: qty, next };
      if (!isCreate && Math.abs(next - current) > Math.max(100, current * 10)) {
        plan.warnings.push(`⚠ Big stock change: ${current} → ${next}. Double-check the sheet.`);
      }
      if (next !== current || isCreate) {
        plan.changes.push({ field: "stock", label: "Stock", from: fmt(current), to: fmt(next) });
      }
      summary.stockBefore += current;
      summary.stockAfter += next;
    } else if (cur && mode !== "product" && mode !== "price") {
      fail(`No stock value in this row — nothing to do in this mode.`);
      continue;
    }

    // 6c. product-mode text/details fields
    if (mode === "product") {
      for (const { field, label } of TEXT_FIELDS) {
        const raw = payload[field];
        if (raw === undefined) continue; // column absent → untouched
        if (variant && field !== "sku" && field !== "barcode") continue; // variants only carry sku/barcode/attrs
        const value = isClear(raw) ? "" : raw;
        const currentVal =
          field === "name" ? (product?.name ?? "") :
          field === "brand" ? (product?.brand ?? "") :
          field === "sku" ? (cur?.sku ?? "") :
          field === "barcode" ? (cur?.barcode ?? "") : undefined;
        if (currentVal === undefined) {
          // Field not in the catalogue snapshot (description, warranty …):
          // record it as a change; commit writes it only if different.
          plan.changes.push({ field, label, from: "(current value)", to: value === "" ? "(cleared)" : value });
        } else if (isCreate || value !== currentVal) {
          plan.changes.push({ field, label, from: fmt(currentVal || null), to: value === "" ? "(cleared)" : value });
        }
      }
      if (payload.category !== undefined) {
        const cat = categoryByName.get(normName(payload.category));
        if (!cat) {
          plan.warnings.push(`Category "${payload.category}" doesn't exist — category left unchanged. (Existing categories are listed on the template sheet.)`);
        } else if (isCreate || cat.id !== product?.categoryId) {
          plan.changes.push({ field: "categoryId", label: "Category", from: "(current)", to: cat.name });
        }
      }
      if (payload.status !== undefined) {
        const s = payload.status.toLowerCase().trim();
        const nextStatus = ["active", "published", "visible", "yes", "live"].includes(s) ? "active" : "hidden";
        if (isCreate || nextStatus !== product?.status) {
          plan.changes.push({ field: "status", label: "Visibility", from: fmt(product?.status ?? null), to: nextStatus });
        }
      }
      if (payload.lowStockThreshold !== undefined) {
        const t = parseQty(payload.lowStockThreshold);
        if (t === null || Number.isNaN(t) || t < 0) { fail(`Low-stock alert level "${payload.lowStockThreshold}" must be a whole number ≥ 0.`); continue; }
        plan.changes.push({ field: "lowStockThreshold", label: "Low-stock alert", from: "(current)", to: fmt(t) });
      }
      if (isCreate && plan.action === "create") {
        if (!payload.name) { fail(`New products need a Name.`); continue; }
        if (payload.mrp === undefined || payload.mop === undefined) {
          fail(`New product "${payload.name}" needs both MRP and Selling price columns.`);
          continue;
        }
      }
      if (plan.action === "new_variant" && payload.mrp === undefined && payload.mop === undefined) {
        plan.warnings.push(`New variant has no prices in the sheet — it will use the product's current prices.`);
      }
    }

    // ---- 7. classify ----
    if (plan.action === "create") summary.creates++;
    else if (plan.action === "new_variant") summary.newVariants++;
    else if (variant) { plan.action = "update_variant"; summary.variantUpdates++; }
    else { plan.action = "update"; summary.updates++; }

    if (plan.changes.length === 0 && plan.action !== "create" && plan.action !== "new_variant") {
      plan.action = "skip";
      if (variant) summary.variantUpdates--; else summary.updates--;
      summary.skips++;
      plan.warnings.push("No changes — the sheet matches what's already on the website.");
    }

    summary.warnings += plan.warnings.length;
  }

  // ---- reconcile: what the sheet does NOT mention ----
  if (mode === "reconcile") {
    for (const p of catalog.products) {
      if (p.variants.length > 0) {
        for (const v of p.variants) {
          if (!seenTargets.has(`v:${v.id}`)) {
            summary.missing.push({ productId: p.id, variantId: v.id, name: `${p.name} (${[v.color, v.ram, v.storage].filter(Boolean).join(" / ")})`, sku: v.sku, stock: v.stock });
          }
        }
      } else if (!seenTargets.has(`p:${p.id}`)) {
        summary.missing.push({ productId: p.id, variantId: null, name: p.name, sku: p.sku, stock: p.stock });
      }
    }
  }

  return { rows, summary };
}
