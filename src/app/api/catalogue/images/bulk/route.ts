/**
 * POST /api/catalogue/images/bulk — bulk image upload with SKU mapping.
 *
 * multipart/form-data:
 *   files[]   individual images (jpg/png/webp/avif/gif) and/or .zip archives
 *   mode      "preview" → match filenames to products/variants by SKU and
 *             return suggestions, nothing is written;
 *             "apply"   → store the images whose mapping the admin confirmed
 *   mapping   (apply only) JSON [{ fileName, productId, variantId? }]
 *
 * Every file is verified by CONTENT (decoded with sharp) — extension and
 * declared MIME are treated as hints, never trusted. ZIPs are unpacked
 * server-side with per-entry and total size caps.
 */

import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { loadCatalogue } from "@/lib/catalogue/health";
import { mapFilenamesToSkus, buildAltText } from "@/lib/catalogue/classify";
import { attachImage, optimizeAndStore, verifyImageBuffer } from "@/lib/catalogue/imageStore";
import { readZipImages } from "@/lib/catalogue/zip";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILES = 300;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

type Incoming = { name: string; data: Buffer };

async function collectImages(form: FormData): Promise<{ images: Incoming[]; errors: string[] }> {
  const images: Incoming[] = [];
  const errors: string[] = [];
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  for (const f of files) {
    const name = f.name || "file";
    if (/\.zip$/i.test(name)) {
      if (f.size > MAX_ZIP_BYTES) { errors.push(`${name}: ZIP is over 200 MB.`); continue; }
      try {
        const entries = readZipImages(Buffer.from(await f.arrayBuffer()));
        if (entries.length === 0) errors.push(`${name}: no images found inside the ZIP.`);
        for (const e of entries) images.push({ name: e.name, data: e.data });
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : "could not read ZIP."}`);
      }
    } else {
      if (f.size > MAX_FILE_BYTES) { errors.push(`${name}: file is over 15 MB.`); continue; }
      images.push({ name, data: Buffer.from(await f.arrayBuffer()) });
    }
    if (images.length > MAX_FILES) throw new Error(`Too many images in one batch (max ${MAX_FILES}).`);
  }
  return { images, errors };
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`catalogue-bulk-images:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  try {
    const form = await req.formData();
    const mode = String(form.get("mode") || "preview");
    const { images, errors } = await collectImages(form);
    if (images.length === 0) {
      return Response.json({ error: errors[0] || "No image files received.", errors }, { status: 400 });
    }

    const { items } = await loadCatalogue({ kind: "all" });

    if (mode === "preview") {
      const suggestions = mapFilenamesToSkus(images.map((i) => i.name), items);
      return Response.json({
        suggestions,
        totalFiles: images.length,
        matched: suggestions.filter((s) => s.productId).length,
        errors,
      });
    }

    // ---- apply ----
    let mapping: { fileName: string; productId: number; variantId?: number | null }[] = [];
    try {
      mapping = JSON.parse(String(form.get("mapping") || "[]"));
    } catch {
      return Response.json({ error: "Invalid mapping." }, { status: 400 });
    }
    const byName = new Map(mapping.map((m) => [m.fileName, m]));

    const results: { fileName: string; ok: boolean; productId?: number; error?: string }[] = [];
    for (const img of images) {
      const m = byName.get(img.name);
      if (!m || !Number.isInteger(m.productId) || m.productId <= 0) {
        results.push({ fileName: img.name, ok: false, error: "Not mapped to a product — skipped." });
        continue;
      }
      const product = items.find((p) => p.id === m.productId);
      if (!product) {
        results.push({ fileName: img.name, ok: false, error: "Product not found." });
        continue;
      }
      try {
        const verified = await verifyImageBuffer(img.data);
        const ref = await optimizeAndStore(verified, `p${product.id}`);
        const variant = m.variantId ? product.variants.find((v) => v.id === m.variantId) || null : null;
        await attachImage({
          productId: product.id,
          variantId: variant?.id ?? null,
          variantColor: variant?.color || "",
          ref,
          alt: buildAltText(product, variant),
        });
        results.push({ fileName: img.name, ok: true, productId: product.id });
      } catch (e) {
        results.push({ fileName: img.name, ok: false, error: e instanceof Error ? e.message : "Failed." });
      }
    }

    return Response.json({
      results,
      applied: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      errors,
    });
  } catch (e) {
    reportError(e, "catalogue/bulkImages");
    return Response.json({ error: e instanceof Error ? e.message : "Bulk upload failed." }, { status: 500 });
  }
}
