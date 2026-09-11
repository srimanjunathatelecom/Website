import { db } from "@/db";
import { products, productImages, productVariants, categories, stockHistory } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { notifyStockAlerts } from "@/lib/stockAlerts";

export const dynamic = "force-dynamic";

type BulkAction =
  | { action: "stock_delta"; ids: number[]; delta: number; reason?: string }
  | { action: "stock_set"; ids: number[]; value: number; reason?: string }
  | { action: "set_status"; ids: number[]; status: "active" | "hidden" }
  | { action: "set_featured"; ids: number[]; value: boolean }
  | { action: "set_bestseller"; ids: number[]; value: boolean }
  | { action: "set_new_arrival"; ids: number[]; value: boolean }
  | { action: "set_category"; ids: number[]; categoryId: number }
  | { action: "set_brand"; ids: number[]; brand: string; preview?: boolean }
  // field: which price to change; value: absolute rupees for price_set,
  // percent (e.g. -10 = 10% cheaper) for price_delta. preview:true returns
  // the full before → after list without writing anything.
  | { action: "price_set"; ids: number[]; field: "mop" | "mrp"; value: number; preview?: boolean }
  | { action: "price_delta"; ids: number[]; field: "mop" | "mrp"; percent: number; preview?: boolean }
  | { action: "delete"; ids: number[] };

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: BulkAction;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body.");
  }

  const ids = Array.isArray((body as any).ids) ? (body as any).ids.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  if (ids.length === 0) return badRequest("No products selected.");
  if (ids.length > 500) return badRequest("Too many products selected at once (max 500).");

  const existingRows = await db.select().from(products).where(inArray(products.id, ids));
  if (existingRows.length === 0) return badRequest("None of the selected products were found.");
  const existingById = new Map(existingRows.map((p) => [p.id, p]));
  const foundIds = existingRows.map((p) => p.id);

  try {
    switch (body.action) {
      case "stock_delta": {
        const delta = Number(body.delta);
        if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
          return badRequest("Enter a non-zero whole number to adjust stock by.");
        }
        // Products with variants keep their real stock on the variant rows;
        // the product row is only a roll-up. Bulk-changing the roll-up would
        // silently drift it away from the variants (and the next variant sync
        // would erase the change), so those products are skipped and named.
        const variantOwners = await db
          .select({ productId: productVariants.productId })
          .from(productVariants)
          .where(inArray(productVariants.productId, foundIds));
        const hasVariants = new Set(variantOwners.map((v) => v.productId));
        const reason = String(body.reason || "").trim() || (delta > 0 ? "Bulk stock increase" : "Bulk stock decrease");
        const historyRows: (typeof stockHistory.$inferInsert)[] = [];
        const variantSkipped: string[] = [];
        const restockedIds: number[] = [];
        for (const id of foundIds) {
          const p = existingById.get(id)!;
          if (hasVariants.has(id)) {
            variantSkipped.push(p.name);
            continue;
          }
          const newStock = Math.max(0, p.stock + delta);
          if (newStock === p.stock) continue;
          await db.update(products).set({ stock: newStock }).where(eq(products.id, id));
          if (p.stock <= 0 && newStock > 0) restockedIds.push(id);
          historyRows.push({
            productId: id,
            productName: p.name,
            sku: p.sku,
            oldStock: p.stock,
            newStock,
            change: newStock - p.stock,
            adminId: admin.id,
            adminName: admin.name || admin.email || "Admin",
            reason,
          });
        }
        if (historyRows.length) await db.insert(stockHistory).values(historyRows);
        // Restock hook: honour "notify me when back" requests for every
        // product this bulk action brought back from zero.
        for (const id of restockedIds) await notifyStockAlerts(id);
        revalidateProduct();
        return Response.json({
          ok: true,
          updated: historyRows.length,
          skipped: foundIds.length - historyRows.length,
          variantSkipped,
          message: variantSkipped.length
            ? `${variantSkipped.length} product(s) were skipped because their stock is tracked per colour/size option — update those options individually or via a stock import.`
            : undefined,
        });
      }

      case "stock_set": {
        const value = Number(body.value);
        if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
          return badRequest("Enter a whole number, 0 or more, to set stock to.");
        }
        const reason = String(body.reason || "").trim() || "Bulk stock set";
        const variantOwners = await db
          .select({ productId: productVariants.productId })
          .from(productVariants)
          .where(inArray(productVariants.productId, foundIds));
        const hasVariants = new Set(variantOwners.map((v) => v.productId));
        const historyRows: (typeof stockHistory.$inferInsert)[] = [];
        const variantSkipped: string[] = [];
        const restockedIds: number[] = [];
        for (const id of foundIds) {
          const p = existingById.get(id)!;
          if (hasVariants.has(id)) {
            variantSkipped.push(p.name);
            continue;
          }
          if (value === p.stock) continue;
          await db.update(products).set({ stock: value }).where(eq(products.id, id));
          if (p.stock <= 0 && value > 0) restockedIds.push(id);
          historyRows.push({
            productId: id,
            productName: p.name,
            sku: p.sku,
            oldStock: p.stock,
            newStock: value,
            change: value - p.stock,
            adminId: admin.id,
            adminName: admin.name || admin.email || "Admin",
            reason,
          });
        }
        if (historyRows.length) await db.insert(stockHistory).values(historyRows);
        for (const id of restockedIds) await notifyStockAlerts(id);
        revalidateProduct();
        return Response.json({
          ok: true,
          updated: historyRows.length,
          skipped: foundIds.length - historyRows.length,
          variantSkipped,
          message: variantSkipped.length
            ? `${variantSkipped.length} product(s) were skipped because their stock is tracked per colour/size option — update those options individually or via a stock import.`
            : undefined,
        });
      }

      case "set_status": {
        const status = body.status === "hidden" ? "hidden" : body.status === "active" ? "active" : null;
        if (!status) return badRequest("Status must be 'active' or 'hidden'.");
        await db.update(products).set({ status }).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, updated: foundIds.length });
      }

      case "set_featured":
        await db.update(products).set({ featured: !!body.value }).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, updated: foundIds.length });

      case "set_bestseller":
        await db.update(products).set({ bestseller: !!body.value }).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, updated: foundIds.length });

      case "set_new_arrival":
        await db.update(products).set({ newArrival: !!body.value }).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, updated: foundIds.length });

      case "set_category": {
        const categoryId = Number(body.categoryId);
        if (!Number.isFinite(categoryId) || categoryId <= 0) return badRequest("Invalid category.");
        const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId));
        if (!cat) return badRequest("Selected category does not exist.");
        await db.update(products).set({ categoryId }).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, updated: foundIds.length });
      }

      case "set_brand": {
        const brand = String(body.brand || "").trim();
        if (!brand) return badRequest("Enter a brand name.");
        if (brand.length > 100) return badRequest("Brand name is too long (max 100 characters).");
        const rows = foundIds.map((id) => {
          const p = existingById.get(id)!;
          return { id, name: p.name, before: p.brand, after: brand, changed: p.brand !== brand };
        });
        if (body.preview) return Response.json({ ok: true, preview: true, rows });
        await db.update(products).set({ brand }).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, updated: rows.filter((r) => r.changed).length, rows });
      }

      case "price_set":
      case "price_delta": {
        const field = body.field === "mrp" ? "mrp" : body.field === "mop" ? "mop" : null;
        if (!field) return badRequest("Choose which price to change: selling price (mop) or MRP.");
        let describe: string;
        let apply: (current: number) => number;
        if (body.action === "price_set") {
          const value = Number(body.value);
          if (!Number.isFinite(value) || value <= 0) return badRequest("Enter a price greater than zero.");
          if (value > 10_000_000) return badRequest("That price looks too large — please check it.");
          apply = () => Math.round(value * 100) / 100;
          describe = `Bulk ${field === "mop" ? "selling price" : "MRP"} set to ₹${value}`;
        } else {
          const percent = Number(body.percent);
          if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 500) {
            return badRequest("Enter a percentage between -90 and 500 (for example -10 makes items 10% cheaper).");
          }
          apply = (current) => Math.round(current * (1 + percent / 100) * 100) / 100;
          describe = `Bulk ${field === "mop" ? "selling price" : "MRP"} change of ${percent}%`;
        }

        // Products with variants keep their real prices on the variant rows
        // (each colour/storage option has its own MRP and MOP). Editing the
        // parent's price would silently desync it from what the storefront
        // actually charges, exactly like the variant-stock guard above.
        const priceVariantOwners = await db
          .select({ productId: productVariants.productId })
          .from(productVariants)
          .where(inArray(productVariants.productId, foundIds));
        const priceHasVariants = new Set(priceVariantOwners.map((v) => v.productId));

        // Build the full before → after picture first. Rows that would end up
        // with a selling price above MRP are blocked — a shop displaying
        // "discounted" prices above the printed MRP is both illegal (Legal
        // Metrology) and a checkout-confusing bug — and rows dropping more
        // than 90% are blocked as probable typos. Both are reported by name.
        const rows = foundIds.map((id) => {
          const p = existingById.get(id)!;
          const currentMop = Number(p.mop);
          const currentMrp = Number(p.mrp);
          const current = field === "mop" ? currentMop : currentMrp;
          const next = apply(current);
          let blocked: string | null = null;
          if (priceHasVariants.has(id)) {
            blocked = "prices are tracked per colour/storage option — edit each option on the product page";
          } else if (field === "mop" && next > currentMrp) {
            blocked = `selling price ₹${next} would be above MRP ₹${currentMrp}`;
          } else if (field === "mrp" && next < currentMop) {
            blocked = `MRP ₹${next} would be below the selling price ₹${currentMop}`;
          } else if (current > 0 && next < current * 0.1) {
            blocked = `drop from ₹${current} to ₹${next} looks like a typo (more than 90% off)`;
          }
          return { id, name: p.name, before: current, after: next, changed: next !== current, blocked };
        });

        if (body.preview) return Response.json({ ok: true, preview: true, field, rows });

        let updated = 0;
        for (const r of rows) {
          if (r.blocked || !r.changed) continue;
          await db
            .update(products)
            .set(field === "mop" ? { mop: String(r.after) } : { mrp: String(r.after) })
            .where(eq(products.id, r.id));
          updated += 1;
        }
        revalidateProduct();
        const blockedRows = rows.filter((r) => r.blocked);
        return Response.json({
          ok: true,
          updated,
          blocked: blockedRows.map((r) => `${r.name}: ${r.blocked}`),
          rows,
          message:
            `${describe}: ${updated} product(s) updated` +
            (blockedRows.length ? `, ${blockedRows.length} blocked for safety — see the list.` : "."),
        });
      }

      case "delete": {
        await db.delete(productImages).where(inArray(productImages.productId, foundIds));
        await db.delete(products).where(inArray(products.id, foundIds));
        revalidateProduct();
        return Response.json({ ok: true, deleted: foundIds.length });
      }

      default:
        return badRequest("Unknown bulk action.");
    }
  } catch (error: any) {
    console.error("Bulk product action error:", error);
    if (error?.message?.toLowerCase().includes("foreign key") || error?.message?.toLowerCase().includes("constraint")) {
      return Response.json(
        { error: "Some products couldn't be deleted because they're linked to existing orders." },
        { status: 400 }
      );
    }
    return Response.json({ error: "Bulk action failed." }, { status: 500 });
  }
}