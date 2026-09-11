/**
 * Database side of the import pipeline: load the catalogue snapshot the
 * planner matches against, commit a previewed batch, and roll a committed
 * batch back.
 *
 * Two safety properties everything here is built around:
 *
 * 1. Commit re-checks against LIVE data. The admin may preview a file, go to
 *    lunch, sell three phones, then press Import. Set-type stock rows whose
 *    current stock no longer matches what the preview showed are NOT applied;
 *    they come back as conflicts with both numbers so the admin can decide.
 *    Add/adjust rows are deltas, so they apply safely on top of whatever the
 *    stock is now.
 *
 * 2. Rollback reverses exactly what the batch wrote, nothing else. Every
 *    committed row stores before/after per field; stock is reversed as a
 *    delta (not restored to a snapshot) so sales that happened after the
 *    import are not resurrected. Products created by the batch are hidden,
 *    never deleted — an order might already reference them.
 */

import { createHash } from "node:crypto";
import { db } from "@/db";
import {
  products,
  productVariants,
  categories,
  stockHistory,
  importBatches,
  importRows,
  importMappings,
} from "@/db/schema";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { slugify } from "@/lib/format";
import { syncProductRowFromVariants } from "@/lib/variantRollup";
import type { Catalog, ImportMode, RowPlan } from "./engine";
import type { Mapping } from "./mapping";

export function fileHashOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ---------- catalogue snapshot ----------

export async function loadCatalog(): Promise<Catalog> {
  const [prods, variants, cats] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        categoryId: products.categoryId,
        sku: products.sku,
        barcode: products.barcode,
        mrp: products.mrp,
        mop: products.mop,
        stock: products.stock,
        status: products.status,
        stockUpdatedAt: products.stockUpdatedAt,
      })
      .from(products),
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        color: productVariants.color,
        ram: productVariants.ram,
        storage: productVariants.storage,
        mrp: productVariants.mrp,
        mop: productVariants.mop,
        stock: productVariants.stock,
        stockUpdatedAt: productVariants.stockUpdatedAt,
      })
      .from(productVariants),
    db.select({ id: categories.id, name: categories.name }).from(categories),
  ]);

  const byProduct = new Map<number, Catalog["products"][number]>();
  for (const p of prods) {
    byProduct.set(p.id, {
      id: p.id,
      name: p.name,
      brand: p.brand,
      categoryId: p.categoryId,
      sku: p.sku,
      barcode: p.barcode,
      mrp: Number(p.mrp),
      mop: Number(p.mop),
      stock: p.stock,
      status: p.status,
      stockUpdatedAt: p.stockUpdatedAt,
      variants: [],
    });
  }
  for (const v of variants) {
    byProduct.get(v.productId)?.variants.push({
      id: v.id,
      productId: v.productId,
      sku: v.sku,
      barcode: v.barcode,
      color: v.color,
      ram: v.ram,
      storage: v.storage,
      mrp: Number(v.mrp),
      mop: Number(v.mop),
      stock: v.stock,
      stockUpdatedAt: v.stockUpdatedAt,
    });
  }
  return { products: [...byProduct.values()], categories: cats };
}

// ---------- remembered header mappings ----------

export async function rememberedMapping(signature: string): Promise<Mapping | null> {
  const [row] = await db.select().from(importMappings).where(eq(importMappings.signature, signature));
  return row ? (row.mapping as Mapping) : null;
}

export async function rememberMapping(signature: string, mapping: Mapping): Promise<void> {
  await db
    .insert(importMappings)
    .values({ signature, mapping, updatedAt: new Date() })
    .onConflictDoUpdate({ target: importMappings.signature, set: { mapping, updatedAt: new Date() } });
}

// ---------- duplicate-file detection ----------

export async function findPreviousImports(fileHash: string) {
  return db
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      mode: importBatches.mode,
      status: importBatches.status,
      adminName: importBatches.adminName,
      createdAt: importBatches.createdAt,
      committedAt: importBatches.committedAt,
    })
    .from(importBatches)
    .where(and(eq(importBatches.fileHash, fileHash), eq(importBatches.status, "committed")))
    .orderBy(desc(importBatches.id))
    .limit(5);
}

// ---------- commit ----------

export type CommitOptions = {
  /** Admin saw the "already imported" warning and chose to import again. */
  allowDuplicateFile?: boolean;
  /** Admin saw stale-sheet warnings and confirmed. */
  allowStale?: boolean;
  /** reconcile only: what to do with items the sheet doesn't mention. */
  reconcileMissing?: "ignore" | "zero" | "hide";
};

export type CommitConflict = { rowNum: number; name: string; sku: string; dbValue: number; previewValue: number; sheetValue: number };

export type CommitResult = {
  applied: number;
  created: number;
  variantsCreated: number;
  skipped: number;
  conflicts: CommitConflict[];
  reconciled: number;
};

type Snapshot = Record<string, string | number | null>;

/** Numeric columns stored as drizzle numeric (strings). */
const NUMERIC_FIELDS = new Set(["mrp", "mop", "costPrice", "gstRate"]);
/** Fields that live on the variant row when the plan targets a variant. */
const VARIANT_FIELDS = new Set(["mrp", "mop", "sku", "barcode", "stock"]);

export async function commitBatch(
  batchId: number,
  admin: { id: number; name: string },
  options: CommitOptions
): Promise<CommitResult> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new Error("Import not found.");
  if (batch.status !== "previewed") throw new Error(`This import is ${batch.status} — only a previewed import can be applied.`);

  const mode = batch.mode as ImportMode;
  const rows = await db.select().from(importRows).where(eq(importRows.importId, batchId)).orderBy(importRows.rowNum);
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), c.id]));

  const result: CommitResult = { applied: 0, created: 0, variantsCreated: 0, skipped: 0, conflicts: [], reconciled: 0 };
  const touchedVariantProducts = new Set<number>();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!["create", "update", "new_variant", "update_variant"].includes(row.action)) continue;
      const payload = row.payload as Record<string, string>;

      // Recover the plan pieces persisted at preview time.
      const planChanges = ((row.after as { planChanges?: { field: string; to: string }[] } | null)?.planChanges ?? []) as {
        field: string;
        to: string;
      }[];
      const planStock = (row.after as { planStock?: { current: number; sheet: number; next: number } } | null)?.planStock ?? null;

      const before: Snapshot = {};
      const after: Snapshot = {};

      // ---------- CREATE PRODUCT ----------
      if (row.action === "create") {
        const name = payload.name?.trim() ?? "";
        // Unique slug: base, then -2, -3…
        const base = slugify(name);
        let slug = base;
        for (let n = 2; ; n++) {
          const [hit] = await tx.select({ id: products.id }).from(products).where(eq(products.slug, slug));
          if (!hit) break;
          slug = `${base}-${n}`;
        }
        const catId = payload.category ? catByName.get(payload.category.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()) : undefined;
        const statusRaw = (payload.status ?? "").toLowerCase();
        const status = ["active", "published", "visible", "yes", "live"].includes(statusRaw) ? "active" : "hidden";
        const stockQty = planStock?.next ?? 0;

        const [created] = await tx
          .insert(products)
          .values({
            name,
            slug,
            brand: payload.brand ?? "",
            categoryId: catId ?? cats[0]?.id ?? 1,
            mrp: String(Number(payload.mrp?.replace(/[₹,\s]/g, "") ?? 0)),
            mop: String(Number(payload.mop?.replace(/[₹,\s]/g, "") ?? 0)),
            stock: stockQty,
            sku: payload.sku ?? "",
            barcode: payload.barcode ?? "",
            hsn: payload.hsn ?? "",
            costPrice: payload.costPrice ? String(Number(payload.costPrice.replace(/[₹,\s]/g, ""))) : null,
            gstRate: payload.gstRate ? String(Number(payload.gstRate.replace(/[%\s]/g, ""))) : null,
            description: payload.description ?? "",
            specifications: payload.specifications ?? "",
            warranty: payload.warranty ?? "",
            seoTitle: payload.seoTitle ?? "",
            metaDescription: payload.metaDescription ?? "",
            lowStockThreshold: payload.lowStockThreshold ? Number(payload.lowStockThreshold) : 5,
            // New products arrive hidden unless the sheet explicitly says
            // active — a typo-ridden row must never appear on the storefront.
            status,
          })
          .returning({ id: products.id });

        if (stockQty > 0) {
          await tx.insert(stockHistory).values({
            productId: created.id,
            productName: name,
            sku: payload.sku ?? "",
            oldStock: 0,
            newStock: stockQty,
            change: stockQty,
            adminId: admin.id,
            adminName: admin.name,
            reason: `Import #${batchId} (${batch.fileName})`,
            movementType: "import",
            importId: batchId,
          });
        }
        await tx
          .update(importRows)
          .set({ applied: true, productId: created.id, before: {}, after: { created: true, status, stock: stockQty, planChanges, planStock } })
          .where(eq(importRows.id, row.id));
        result.created++;
        result.applied++;
        continue;
      }

      // ---------- NEW VARIANT ----------
      if (row.action === "new_variant") {
        if (!row.productId) continue;
        const [parent] = await tx.select().from(products).where(eq(products.id, row.productId));
        if (!parent) continue;
        const stockQty = planStock?.next ?? 0;
        const [createdV] = await tx
          .insert(productVariants)
          .values({
            productId: parent.id,
            color: payload.color ?? "",
            ram: payload.ram ?? "",
            storage: payload.storage ?? "",
            mrp: payload.mrp ? String(Number(payload.mrp.replace(/[₹,\s]/g, ""))) : parent.mrp,
            mop: payload.mop ? String(Number(payload.mop.replace(/[₹,\s]/g, ""))) : parent.mop,
            stock: stockQty,
            sku: payload.variantSku ?? payload.sku ?? "",
            barcode: payload.barcode ?? "",
          })
          .returning({ id: productVariants.id });
        if (stockQty !== 0) {
          await tx.insert(stockHistory).values({
            productId: parent.id,
            productName: parent.name,
            sku: payload.variantSku ?? payload.sku ?? "",
            oldStock: 0,
            newStock: stockQty,
            change: stockQty,
            adminId: admin.id,
            adminName: admin.name,
            reason: `Import #${batchId} — new variant`,
            movementType: "import",
            importId: batchId,
            variantId: createdV.id,
            variantLabel: [payload.color, payload.ram, payload.storage].filter(Boolean).join(" / "),
          });
        }
        await tx
          .update(importRows)
          .set({ applied: true, variantId: createdV.id, before: {}, after: { created: true, stock: stockQty, planChanges, planStock } })
          .where(eq(importRows.id, row.id));
        touchedVariantProducts.add(parent.id);
        result.variantsCreated++;
        result.applied++;
        continue;
      }

      // ---------- UPDATE PRODUCT / VARIANT ----------
      const isVariant = row.action === "update_variant";
      const productRow = row.productId
        ? (await tx.select().from(products).where(eq(products.id, row.productId)))[0]
        : undefined;
      const variantRow = isVariant && row.variantId
        ? (await tx.select().from(productVariants).where(eq(productVariants.id, row.variantId)))[0]
        : undefined;
      if (!productRow || (isVariant && !variantRow)) {
        // Deleted since preview — surface as a conflict rather than vanishing.
        result.conflicts.push({
          rowNum: row.rowNum, name: row.name, sku: row.sku,
          dbValue: -1, previewValue: planStock?.current ?? 0, sheetValue: planStock?.sheet ?? 0,
        });
        result.skipped++;
        continue;
      }

      const target = isVariant ? variantRow! : productRow;
      const productUpdate: Record<string, unknown> = {};
      const variantUpdate: Record<string, unknown> = {};

      // ----- stock -----
      let stockChanged = false;
      let oldStock = 0;
      let newStock = 0;
      if (planStock) {
        oldStock = target.stock;
        const isDelta = mode === "receipt" || mode === "adjust";
        if (isDelta) {
          // Delta semantics stay valid whatever happened since preview.
          const delta = mode === "receipt" ? planStock.sheet : planStock.sheet;
          newStock = target.stock + delta;
          if (newStock < 0) {
            result.conflicts.push({ rowNum: row.rowNum, name: row.name, sku: row.sku, dbValue: target.stock, previewValue: planStock.current, sheetValue: planStock.sheet });
            result.skipped++;
            continue;
          }
        } else {
          // Set semantics: if stock moved since the preview (a sale, another
          // import), applying the sheet's absolute number would silently undo
          // it. Surface as a conflict instead.
          if (target.stock !== planStock.current) {
            result.conflicts.push({ rowNum: row.rowNum, name: row.name, sku: row.sku, dbValue: target.stock, previewValue: planStock.current, sheetValue: planStock.sheet });
            result.skipped++;
            continue;
          }
          newStock = planStock.next;
        }
        if (newStock !== oldStock) {
          stockChanged = true;
          (isVariant ? variantUpdate : productUpdate).stock = newStock;
        }
      }

      // ----- other fields from the preview's change list -----
      for (const ch of planChanges) {
        if (ch.field === "stock") continue;
        const payloadValue = payload[ch.field];
        const raw = payloadValue === undefined ? "" : payloadValue;
        const cleared = raw.trim().toUpperCase() === "CLEAR";
        const dest = isVariant && VARIANT_FIELDS.has(ch.field) ? variantUpdate : !isVariant ? productUpdate : null;
        if (!dest) continue;
        if (ch.field === "categoryId") {
          const catId = catByName.get((payload.category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
          if (catId) { before.categoryId = productRow.categoryId; dest.categoryId = catId; after.categoryId = catId; }
          continue;
        }
        if (ch.field === "status") {
          const s = (payload.status ?? "").toLowerCase();
          const next = ["active", "published", "visible", "yes", "live"].includes(s) ? "active" : "hidden";
          before.status = productRow.status; dest.status = next; after.status = next;
          continue;
        }
        if (ch.field === "lowStockThreshold") {
          before.lowStockThreshold = productRow.lowStockThreshold;
          dest.lowStockThreshold = Number(payload.lowStockThreshold);
          after.lowStockThreshold = Number(payload.lowStockThreshold);
          continue;
        }
        if (NUMERIC_FIELDS.has(ch.field)) {
          const num = Number(raw.replace(/[₹%,\s]/g, ""));
          if (!Number.isFinite(num)) continue;
          const rec = target as unknown as Record<string, unknown>;
          before[ch.field] = (rec[ch.field] as string | null) ?? null;
          dest[ch.field] = String(num);
          after[ch.field] = String(num);
          continue;
        }
        // text fields
        const value = cleared ? "" : raw;
        const rec = target as unknown as Record<string, unknown>;
        const prodRec = productRow as unknown as Record<string, unknown>;
        const currentVal = (isVariant && VARIANT_FIELDS.has(ch.field) ? rec[ch.field] : prodRec[ch.field]) as string | undefined;
        if (currentVal === undefined || currentVal === value) continue;
        before[ch.field] = currentVal;
        dest[ch.field] = value;
        after[ch.field] = value;
      }

      if (stockChanged) { before.stock = oldStock; after.stock = newStock; }

      if (Object.keys(productUpdate).length === 0 && Object.keys(variantUpdate).length === 0) {
        result.skipped++;
        await tx.update(importRows).set({ applied: false, before, after: { noop: true, planChanges, planStock } }).where(eq(importRows.id, row.id));
        continue;
      }

      if (Object.keys(variantUpdate).length > 0 && row.variantId) {
        await tx.update(productVariants).set(variantUpdate).where(eq(productVariants.id, row.variantId));
        touchedVariantProducts.add(productRow.id);
      }
      if (Object.keys(productUpdate).length > 0) {
        await tx.update(products).set(productUpdate).where(eq(products.id, productRow.id));
      }

      if (stockChanged) {
        const v = variantRow;
        await tx.insert(stockHistory).values({
          productId: productRow.id,
          productName: productRow.name,
          sku: row.sku,
          oldStock,
          newStock,
          change: newStock - oldStock,
          adminId: admin.id,
          adminName: admin.name,
          reason: `Import #${batchId} (${batch.fileName})`,
          movementType: "import",
          importId: batchId,
          variantId: isVariant ? row.variantId : null,
          variantLabel: v ? [v.color, v.ram, v.storage].filter(Boolean).join(" / ") : "",
        });
      }

      await tx.update(importRows).set({ applied: true, before, after: { ...after, planChanges, planStock } }).where(eq(importRows.id, row.id));
      result.applied++;
    }

    // ---------- reconcile: items the sheet did not mention ----------
    const missing = ((batch.summary as { missing?: { productId: number; variantId: number | null; name: string; sku: string; stock: number }[] })?.missing ?? []);
    const action = options.reconcileMissing ?? "ignore";
    if (mode === "reconcile" && action !== "ignore" && missing.length > 0) {
      for (const m of missing) {
        if (action === "zero") {
          if (m.variantId) {
            const [v] = await tx.select().from(productVariants).where(eq(productVariants.id, m.variantId));
            if (v && v.stock !== 0) {
              await tx.update(productVariants).set({ stock: 0 }).where(eq(productVariants.id, v.id));
              await tx.insert(stockHistory).values({
                productId: m.productId, productName: m.name, sku: m.sku,
                oldStock: v.stock, newStock: 0, change: -v.stock,
                adminId: admin.id, adminName: admin.name,
                reason: `Import #${batchId} — not in reconciliation sheet, stock set to 0`,
                movementType: "import", importId: batchId, variantId: v.id,
              });
              touchedVariantProducts.add(m.productId);
              result.reconciled++;
            }
          } else {
            const [p] = await tx.select().from(products).where(eq(products.id, m.productId));
            if (p && p.stock !== 0) {
              await tx.update(products).set({ stock: 0 }).where(eq(products.id, p.id));
              await tx.insert(stockHistory).values({
                productId: p.id, productName: p.name, sku: p.sku,
                oldStock: p.stock, newStock: 0, change: -p.stock,
                adminId: admin.id, adminName: admin.name,
                reason: `Import #${batchId} — not in reconciliation sheet, stock set to 0`,
                movementType: "import", importId: batchId,
              });
              result.reconciled++;
            }
          }
        } else if (action === "hide" && !m.variantId) {
          await tx.update(products).set({ status: "hidden" }).where(and(eq(products.id, m.productId), ne(products.status, "hidden")));
          result.reconciled++;
        }
      }
    }

    await tx
      .update(importBatches)
      .set({
        status: "committed",
        committedAt: new Date(),
        options: options as Record<string, unknown>,
        summary: {
          ...(batch.summary as Record<string, unknown>),
          committed: {
            applied: result.applied,
            created: result.created,
            variantsCreated: result.variantsCreated,
            skipped: result.skipped,
            conflicts: result.conflicts.length,
            reconciled: result.reconciled,
          },
        },
      })
      .where(eq(importBatches.id, batchId));
  });

  // Variant products: recompute the roll-up (price-from, summed stock) so
  // listing cards agree with the variants the import just changed.
  for (const pid of touchedVariantProducts) await syncProductRowFromVariants(pid);

  return result;
}

// ---------- rollback ----------

export type RollbackResult = { reversed: number; hidden: number; clamped: { name: string; sku: string }[] };

export async function rollbackBatch(batchId: number, admin: { id: number; name: string }): Promise<RollbackResult> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new Error("Import not found.");
  if (batch.status !== "committed") throw new Error(`Only an imported batch can be undone — this one is ${batch.status}.`);

  const rows = await db
    .select()
    .from(importRows)
    .where(and(eq(importRows.importId, batchId), eq(importRows.applied, true)))
    .orderBy(desc(importRows.rowNum));

  const result: RollbackResult = { reversed: 0, hidden: 0, clamped: [] };
  const touchedVariantProducts = new Set<number>();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const before = (row.before ?? {}) as Snapshot;
      const after = (row.after ?? {}) as Snapshot & { created?: boolean };
      const isVariant = row.action === "update_variant" || (row.action === "new_variant" && !!row.variantId);

      // Products/variants the batch CREATED: hide, never delete.
      if (after.created) {
        if (row.action === "new_variant" && row.variantId) {
          await tx.update(productVariants).set({ available: false, stock: 0 }).where(eq(productVariants.id, row.variantId));
          if (row.productId) touchedVariantProducts.add(row.productId);
        } else if (row.productId) {
          await tx.update(products).set({ status: "hidden", stock: 0 }).where(eq(products.id, row.productId));
        }
        result.hidden++;
        continue;
      }

      if (!row.productId) continue;
      const [productRow] = await tx.select().from(products).where(eq(products.id, row.productId));
      if (!productRow) continue;

      const productUpdate: Record<string, unknown> = {};
      const variantUpdate: Record<string, unknown> = {};

      // Reverse stock as a DELTA so later sales stay deducted.
      if (typeof before.stock === "number" && typeof after.stock === "number") {
        const delta = (after.stock as number) - (before.stock as number);
        if (isVariant && row.variantId) {
          const [v] = await tx.select().from(productVariants).where(eq(productVariants.id, row.variantId));
          if (v) {
            let next = v.stock - delta;
            if (next < 0) { next = 0; result.clamped.push({ name: row.name, sku: row.sku }); }
            variantUpdate.stock = next;
            await tx.insert(stockHistory).values({
              productId: row.productId, productName: productRow.name, sku: row.sku,
              oldStock: v.stock, newStock: next, change: next - v.stock,
              adminId: admin.id, adminName: admin.name,
              reason: `Undo of import #${batchId}`,
              movementType: "import_rollback", importId: batchId, variantId: row.variantId,
            });
          }
        } else {
          let next = productRow.stock - delta;
          if (next < 0) { next = 0; result.clamped.push({ name: row.name, sku: row.sku }); }
          productUpdate.stock = next;
          await tx.insert(stockHistory).values({
            productId: row.productId, productName: productRow.name, sku: row.sku,
            oldStock: productRow.stock, newStock: next, change: next - productRow.stock,
            adminId: admin.id, adminName: admin.name,
            reason: `Undo of import #${batchId}`,
            movementType: "import_rollback", importId: batchId,
          });
        }
      }

      // Restore every non-stock field to its exact pre-import value.
      for (const [field, value] of Object.entries(before)) {
        if (field === "stock") continue;
        const dest = isVariant && VARIANT_FIELDS.has(field) ? variantUpdate : productUpdate;
        dest[field] = value;
      }

      if (Object.keys(variantUpdate).length > 0 && row.variantId) {
        await tx.update(productVariants).set(variantUpdate).where(eq(productVariants.id, row.variantId));
        touchedVariantProducts.add(row.productId);
      }
      if (Object.keys(productUpdate).length > 0) {
        await tx.update(products).set(productUpdate).where(eq(products.id, row.productId));
      }
      result.reversed++;
    }

    // Reverse reconcile zeroing, if any: restore from its history rows.
    const zeroed = await tx
      .select()
      .from(stockHistory)
      .where(and(eq(stockHistory.importId, batchId), eq(stockHistory.movementType, "import"), sql`${stockHistory.reason} LIKE '%not in reconciliation sheet%'`));
    for (const h of zeroed) {
      const delta = h.change; // negative
      if (h.variantId) {
        const [v] = await tx.select().from(productVariants).where(eq(productVariants.id, h.variantId));
        if (v) {
          await tx.update(productVariants).set({ stock: v.stock - delta }).where(eq(productVariants.id, h.variantId));
          touchedVariantProducts.add(h.productId);
        }
      } else {
        const [p] = await tx.select().from(products).where(eq(products.id, h.productId));
        if (p) await tx.update(products).set({ stock: p.stock - delta }).where(eq(products.id, h.productId));
      }
      await tx.insert(stockHistory).values({
        productId: h.productId, productName: h.productName, sku: h.sku,
        oldStock: h.newStock, newStock: h.newStock - delta, change: -delta,
        adminId: admin.id, adminName: admin.name,
        reason: `Undo of import #${batchId} (reconciliation)`,
        movementType: "import_rollback", importId: batchId, variantId: h.variantId,
      });
      result.reversed++;
    }

    await tx
      .update(importBatches)
      .set({ status: "rolled_back", rolledBackAt: new Date() })
      .where(eq(importBatches.id, batchId));
  });

  for (const pid of touchedVariantProducts) await syncProductRowFromVariants(pid);
  return result;
}

export async function batchRowsInChunks<T>(items: T[], size: number, insert: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await insert(items.slice(i, i + size));
}

/** Trim a RowPlan for storage/response: keep what the UI and commit need. */
export function rowPlanToDbRow(importId: number, plan: RowPlan) {
  return {
    importId,
    rowNum: plan.rowNum,
    action: plan.action,
    productId: plan.productId,
    variantId: plan.variantId,
    sku: plan.sku,
    name: plan.name,
    payload: plan.payload as Record<string, string>,
    // planChanges/planStock ride along in `after` until commit overwrites it
    // with the real written values — before commit `after` is "what WOULD be
    // written", which is exactly what the preview shows.
    after: { planChanges: plan.changes, planStock: plan.stock },
    warnings: plan.warnings,
    error: plan.error,
  };
}
