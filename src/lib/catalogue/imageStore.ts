/**
 * Importing an image INTO the catalogue: download → verify it really is an
 * image (magic bytes via sharp, never the file extension) → optimize
 * (bounded WebP, same pipeline as /api/media/upload) → store (R2 when
 * configured, data URL fallback otherwise) → attach to the product/variant.
 *
 * Safety rules enforced here, not left to callers:
 * - attachment only ever INSERTs into product_images / sets variant.image —
 *   stock, price, SKU and product info are untouchable from this module;
 * - a good existing image is never deleted; replacement is only offered for
 *   images the scan classified placeholder/broken, and even then the old
 *   row is only removed after the new one is safely written;
 * - alt text is generated from real product fields (classify.buildAltText).
 */

import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { db } from "@/db";
import { productImages, productVariants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { putR2Object, r2Configured } from "@/lib/media/r2";

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;

export type FetchedImage = { buffer: Buffer; contentType: string; width: number; height: number };

/** Download and verify a remote image. Throws with an owner-readable message on any failure. */
export async function fetchRemoteImage(url: string): Promise<FetchedImage> {
  if (!/^https:\/\//i.test(url)) throw new Error("Only https image sources are allowed.");
  const res = await fetch(url, {
    headers: { "user-agent": "SMSStores-CatalogueHealth/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Image download failed (HTTP ${res.status}).`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_DOWNLOAD_BYTES) throw new Error("Image is too large (over 12 MB).");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error("Image is too large (over 12 MB).");
  return verifyImageBuffer(buffer);
}

/** Verify a buffer is a real, decodable raster image — content, not extension. */
export async function verifyImageBuffer(buffer: Buffer): Promise<FetchedImage> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new Error("The file is not a readable image.");
  }
  const format = meta.format || "";
  if (!["jpeg", "png", "webp", "avif", "gif", "tiff"].includes(format)) {
    throw new Error(`Unsupported image format: ${format || "unknown"}.`);
  }
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 200 || height < 200) {
    throw new Error(`Image is too small to be a product photo (${width}×${height}).`);
  }
  return { buffer, contentType: `image/${format}`, width, height };
}

/**
 * Optimize + store. Returns the reference to save in product_images.data_url:
 * an R2 CDN URL when object storage is configured, otherwise a bounded WebP
 * data URL (same graceful degradation as every other upload path).
 */
export async function optimizeAndStore(img: FetchedImage, keyHint = "catalogue"): Promise<string> {
  const webp = await sharp(img.buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  if (r2Configured()) {
    const now = new Date();
    const key = `media/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${keyHint}-${randomBytes(8).toString("hex")}.webp`;
    const { url } = await putR2Object({
      key,
      body: webp,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    return url;
  }
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

export type AttachResult = { imageId: number; ref: string; replacedImageId: number | null };

/**
 * Attach a stored image to a product (and optionally a variant).
 *
 * `replaceImageId` may only reference an image the scan flagged bad; passing
 * it deletes that row AFTER the new image is inserted. Nothing else changes.
 */
export async function attachImage(args: {
  productId: number;
  variantId?: number | null;
  variantColor?: string;
  ref: string;
  alt: string;
  replaceImageId?: number | null;
}): Promise<AttachResult> {
  // New image first — if this fails, the old (even bad) image survives,
  // which beats a product with nothing at all.
  const existing = await db
    .select({ id: productImages.id, sortOrder: productImages.sortOrder })
    .from(productImages)
    .where(eq(productImages.productId, args.productId));

  const replacing = args.replaceImageId ? existing.find((e) => e.id === args.replaceImageId) : undefined;
  const sortOrder = replacing ? replacing.sortOrder : existing.length;

  const [row] = await db
    .insert(productImages)
    .values({
      productId: args.productId,
      dataUrl: args.ref,
      alt: args.alt.slice(0, 140),
      sortOrder,
      variantColor: (args.variantColor || "").trim(),
      mediaType: "image",
    })
    .returning({ id: productImages.id });

  let replacedImageId: number | null = null;
  if (replacing) {
    await db.delete(productImages).where(eq(productImages.id, replacing.id));
    replacedImageId = replacing.id;
  }

  // Variant thumbnail: fill only when empty or when we are replacing its
  // known-bad source — never clobber a good variant image.
  if (args.variantId) {
    const [v] = await db
      .select({ id: productVariants.id, image: productVariants.image })
      .from(productVariants)
      .where(eq(productVariants.id, args.variantId));
    if (v && (!v.image || (args.replaceImageId && replacedImageId))) {
      await db.update(productVariants).set({ image: args.ref }).where(eq(productVariants.id, v.id));
    }
  }

  return { imageId: row.id, ref: args.ref, replacedImageId };
}
