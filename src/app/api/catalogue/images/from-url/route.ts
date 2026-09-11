/**
 * POST /api/catalogue/images/from-url — import one image from a URL the
 * admin pasted. Same guarantees as every other image path: downloaded,
 * decoded, size-checked, re-encoded to WebP; never trusted as-is.
 *
 * Body: { productId, variantId?, url }
 */

import { db } from "@/db";
import { products, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { attachImage, fetchRemoteImage, optimizeAndStore } from "@/lib/catalogue/imageStore";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`catalogue-image-url:${clientIp(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  try {
    const body = await req.json().catch(() => ({}));
    const productId = Number(body.productId);
    const variantId = body.variantId ? Number(body.variantId) : null;
    const url = String(body.url || "").trim();
    if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: "Invalid product." }, { status: 400 });
    if (!url) return Response.json({ error: "Paste an image URL first." }, { status: 400 });

    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    let variantColor = "";
    if (variantId) {
      const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
      if (!v || v.productId !== productId) return Response.json({ error: "Variant not found." }, { status: 404 });
      variantColor = v.color;
    }

    const fetched = await fetchRemoteImage(url);
    const ref = await optimizeAndStore(fetched, `p${productId}`);
    const res = await attachImage({
      productId,
      variantId,
      variantColor,
      ref,
      alt: `${product.brand ? product.brand + " " : ""}${product.name}`.trim().slice(0, 140),
    });

    return Response.json({ ok: true, imageId: res.imageId, width: fetched.width, height: fetched.height });
  } catch (e) {
    reportError(e, "catalogue/imageFromUrl");
    return Response.json({ error: e instanceof Error ? e.message : "Import failed." }, { status: 502 });
  }
}
