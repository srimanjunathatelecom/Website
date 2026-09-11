import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { putR2Object, r2Configured } from "@/lib/media/r2";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Admin media upload → Cloudflare R2 → public CDN URL.
 *
 * Before this route, every image the admin picked was read with
 * FileReader.readAsDataURL() and the base64 blob stored in Postgres. That is
 * fine for the generated SVG art the store launched with (a few KB each) and
 * catastrophic for phone photos (a 2 MB JPEG is ~2.7 MB of base64 pushed
 * through every query that touches the row — see the storage section of the
 * production audit).
 *
 * The admin UI calls this first and falls back to the old data-URL path when
 * it gets 503, so the store works identically before and after the owner
 * creates the R2 bucket. Nothing else changes: the URL returned here is
 * written into the same text columns the data URLs went into.
 *
 * Images are re-encoded server-side (max 1600px, WebP) so what reaches the
 * bucket is a bounded, web-ready file regardless of what a phone camera
 * produced. Animated GIFs and videos pass through untouched — re-encoding
 * video is out of scope for an upload route.
 */

// Image types sharp will re-encode. SVG is deliberately absent: a stored SVG
// executes scripts when opened directly, which turns an image bucket into an
// XSS host. The catalogue's existing SVG art lives as data: URLs and is
// unaffected.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const PASSTHROUGH_TYPES = new Set(["image/gif", "video/mp4", "video/webm", "video/quicktime"]);

const IMAGE_MAX_BYTES = 12 * 1024 * 1024; // matches "phone photo" reality
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // matches the admin UI's existing cap

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function POST(req: Request) {
  // Two callers, two trust levels. Admins upload anything the store needs
  // (banners, videos, product shots). Signed-in customers upload too — review
  // photos — but on a much shorter leash: images only, smaller cap, and a
  // per-account rate limit so one account can't fill the bucket. Anonymous
  // visitors still get 401.
  const admin = await getCurrentAdmin();
  const customer = admin ? null : await getCurrentCustomer();
  if (!admin && !customer) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // 503 (not 4xx) so the client helper can tell "not configured yet" apart
  // from "you sent something invalid" and quietly use the data-URL fallback.
  if (!r2Configured()) {
    return Response.json(
      { error: "Object storage is not configured. Set the R2_* variables to enable CDN uploads." },
      { status: 503 }
    );
  }

  // Generous limit for admins, because a stuck retry loop in a browser tab
  // shouldn't be able to hammer the bucket. Customers are limited per
  // account, not per IP — review photos arrive a handful at a time and
  // shared IPs (college hostels, office Wi-Fi) shouldn't lock everyone out.
  const rl = customer
    ? await checkRateLimit(`media-upload:cust:${customer.id}`, 20, 60 * 60 * 1000)
    : await checkRateLimit(`media-upload:${clientIp(req)}`, 120, 15 * 60 * 1000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return Response.json({ error: "Expected multipart form data with a 'file' field." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file provided." }, { status: 400 });

  const type = file.type;
  const isImage = IMAGE_TYPES.has(type);
  // GIF/video passthrough stores the file un-re-encoded, so it stays
  // admin-only; a customer's "photo" must survive the sharp pipeline.
  const isPassthrough = !customer && PASSTHROUGH_TYPES.has(type);
  if (customer && !isImage) {
    return Response.json({ error: "Review photos must be JPEG, PNG, WebP or AVIF images." }, { status: 400 });
  }
  if (!isImage && !isPassthrough) {
    return Response.json(
      { error: "Unsupported file type. Use JPEG/PNG/WebP/AVIF/GIF images or MP4/WebM videos." },
      { status: 400 }
    );
  }

  const maxBytes = type.startsWith("video/") ? VIDEO_MAX_BYTES : customer ? 8 * 1024 * 1024 : IMAGE_MAX_BYTES;
  if (file.size > maxBytes) {
    return Response.json(
      { error: `File too large. Maximum is ${Math.round(maxBytes / 1024 / 1024)} MB.` },
      { status: 400 }
    );
  }

  try {
    let body = Buffer.from(await file.arrayBuffer());
    let contentType = type;
    let ext = EXT[type] || "bin";

    if (isImage) {
      // Normalize every still image to bounded WebP. `withoutEnlargement`
      // keeps small images small; `rotate()` bakes in the EXIF orientation
      // that phones rely on (stripped metadata would otherwise show photos
      // sideways).
      body = Buffer.from(
        await sharp(body).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
      );
      contentType = "image/webp";
      ext = "webp";
    }

    // Random key rather than the original filename: filenames from a phone
    // collide ("IMG_0001.jpg") and can contain anything. Date prefix keeps
    // the bucket browsable for a human.
    const now = new Date();
    const key = `media/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${randomBytes(8).toString("hex")}.${ext}`;

    const { url } = await putR2Object({
      key,
      body,
      contentType,
      // Immutable is safe because keys are never reused — a replaced image is
      // a new key, so the CDN can cache forever.
      cacheControl: "public, max-age=31536000, immutable",
    });

    return Response.json({ ok: true, url });
  } catch (e) {
    reportError(e, "api/media/upload");
    return Response.json({ error: "Upload failed. Try again." }, { status: 502 });
  }
}
