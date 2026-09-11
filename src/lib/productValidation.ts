// Shared server-side validation for product create/update, reused by the
// standard product form (POST/PUT /api/products) and the Quick Add /
// smart-paste import flow, so every path into the products table goes
// through the same checks. Mirrors the equivalent client-side checks in
// ProductEditor so bad data is caught before a request is even sent —
// but the backend check here is the one that actually protects the data,
// per the rule that backend validation is mandatory, not optional.

import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

export type ProductInput = {
  name?: unknown;
  brand?: unknown;
  categoryId?: unknown;
  mrp?: unknown;
  mop?: unknown;
  stock?: unknown;
  lowStockThreshold?: unknown;
  sku?: unknown;
};

export type ValidationResult =
  | { ok: true; values: { name: string; mrp: number; mop: number; stock: number; lowStockThreshold: number; categoryId: number; sku: string } }
  | { ok: false; error: string; field?: string };

/**
 * Validates the numeric/required fields of a product payload and checks
 * SKU uniqueness against the database. Does not touch text fields like
 * description/specifications — those are free-form by design.
 *
 * @param excludeProductId - when updating, pass the product's own id so
 *   its own SKU doesn't collide with itself.
 */
export async function validateProductInput(
  b: ProductInput,
  opts: { excludeProductId?: number; requireCategory?: boolean } = {}
): Promise<ValidationResult> {
  const name = String(b.name ?? "").trim();
  if (!name) return { ok: false, error: "Product name is required.", field: "name" };
  if (name.length > 200) return { ok: false, error: "Product name is too long (max 200 characters).", field: "name" };

  // Category: required on create; optional (keep-existing) on update, so
  // only validate it here when a value was actually supplied or required.
  let categoryId = 0;
  if (b.categoryId != null && b.categoryId !== "") {
    categoryId = Number(b.categoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return { ok: false, error: "Invalid category.", field: "categoryId" };
    }
    const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId));
    if (!cat) return { ok: false, error: "Selected category does not exist.", field: "categoryId" };
  } else if (opts.requireCategory) {
    return { ok: false, error: "Please choose a category.", field: "categoryId" };
  }

  const mrpRaw = b.mrp;
  const mopRaw = b.mop;
  const mrp = mrpRaw == null || mrpRaw === "" ? 0 : Number(mrpRaw);
  const mop = mopRaw == null || mopRaw === "" ? 0 : Number(mopRaw);

  if (!Number.isFinite(mrp) || mrp < 0) return { ok: false, error: "MRP must be a valid number, 0 or more.", field: "mrp" };
  if (!Number.isFinite(mop) || mop < 0) return { ok: false, error: "Selling price (MOP) must be a valid number, 0 or more.", field: "mop" };
  if (mrp > 0 && mop > mrp) {
    return { ok: false, error: "Selling price (MOP) cannot be higher than MRP.", field: "mop" };
  }

  const stockRaw = b.stock;
  const stock = stockRaw == null || stockRaw === "" ? 0 : Number(stockRaw);
  if (!Number.isFinite(stock) || !Number.isInteger(stock) || stock < 0) {
    return { ok: false, error: "Stock must be a whole number, 0 or more.", field: "stock" };
  }

  const thresholdRaw = b.lowStockThreshold;
  const lowStockThreshold = thresholdRaw == null || thresholdRaw === "" ? 5 : Number(thresholdRaw);
  if (!Number.isFinite(lowStockThreshold) || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    return { ok: false, error: "Low-stock threshold must be a whole number, 0 or more.", field: "lowStockThreshold" };
  }

  const sku = String(b.sku ?? "").trim();
  if (sku) {
    const clause = opts.excludeProductId
      ? and(eq(products.sku, sku), ne(products.id, opts.excludeProductId))
      : eq(products.sku, sku);
    const [dup] = await db.select().from(products).where(clause);
    if (dup) return { ok: false, error: `SKU "${sku}" is already used by another product.`, field: "sku" };
  }

  return { ok: true, values: { name, mrp, mop, stock, lowStockThreshold, categoryId, sku } };
}