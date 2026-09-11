import { db } from "@/db";
import { stockAlerts, products, productVariants } from "@/db/schema";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { sendCustomerEmail } from "@/lib/notify";
import { reportError } from "@/lib/observability";

/**
 * Send back-in-stock emails for a product that may have just been restocked.
 *
 * Called after every admin path that can raise stock (single edit, bulk
 * action, variant edit). It re-reads stock from the database rather than
 * trusting the caller, so calling it "too often" is harmless: an alert is
 * only consumed when the exact thing the customer asked about (the variant
 * they picked, or the product as a whole) is actually purchasable again.
 *
 * Alerts are marked notified only when the email really went out. Without
 * SMTP configured the rows stay pending and are retried on the next restock —
 * honest behaviour, and it means enabling SMTP later delivers the backlog.
 *
 * Returns counts so callers (and tests) can observe what happened without
 * inspecting the mailbox: matched = pending alerts whose item is now in
 * stock, sent = emails that actually went out.
 */
export async function notifyStockAlerts(productId: number): Promise<{ matched: number; sent: number }> {
  const result = { matched: 0, sent: 0 };
  try {
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product || product.status !== "active") return result;

    const pending = await db
      .select()
      .from(stockAlerts)
      .where(and(eq(stockAlerts.productId, productId), isNull(stockAlerts.notifiedAt)));
    if (!pending.length) return result;

    // One query for every variant referenced by an alert.
    const variantIds = [...new Set(pending.map((a) => a.variantId).filter((v): v is number => v != null))];
    const variants = variantIds.length
      ? await db.select().from(productVariants).where(inArray(productVariants.id, variantIds))
      : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const siteUrl = (process.env.SITE_URL || "").replace(/\/+$/, "");
    const link = siteUrl ? `${siteUrl}/products/${product.slug}` : "";

    for (const alert of pending) {
      let inStock = false;
      let label = product.name;
      let price = Number(product.mop || 0);
      if (alert.variantId != null) {
        const v = variantById.get(alert.variantId);
        // Variant deleted since the customer subscribed: fall back to the
        // product itself so the request is still honoured.
        if (v) {
          inStock = v.stock > 0 && v.available;
          const parts = [v.color, v.ram, v.storage].filter(Boolean).join(" · ");
          if (parts) label = `${product.name} (${parts})`;
          price = Number(v.mop || price);
        } else {
          inStock = product.stock > 0;
        }
      } else {
        inStock = product.stock > 0;
      }
      if (!inStock) continue;
      result.matched += 1;

      const ok = await sendCustomerEmail(
        alert.email,
        `${product.name} is back in stock`,
        [
          `Good news — ${label} is back in stock at SMS Stores.`,
          ``,
          `Price: ₹${price.toLocaleString("en-IN")}`,
          link ? `Order now: ${link}` : ``,
          ``,
          `Stock is limited, so don't wait too long.`,
          `— SMS Stores, Bengaluru`,
        ].filter((l, i, a) => l !== `` || a[i - 1] !== ``).join("\n")
      );
      if (ok) {
        await db
          .update(stockAlerts)
          .set({ notifiedAt: new Date() })
          .where(eq(stockAlerts.id, alert.id));
        result.sent += 1;
      }
    }
  } catch (err) {
    // A failed alert run must never fail the stock update that triggered it.
    reportError(err, "lib/stockAlerts");
  }
  return result;
}
