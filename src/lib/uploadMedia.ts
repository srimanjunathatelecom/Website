/**
 * Client-side media upload with graceful degradation.
 *
 * Tries the server upload route first (which stores the file in Cloudflare
 * R2 and returns a small CDN URL). If the deploy has no R2 keys yet — the
 * route answers 503 — or the network call fails outright, falls back to the
 * original behaviour: reading the file as a base64 data URL that gets saved
 * into the database.
 *
 * Every admin upload path funnels through this one function, so the day the
 * owner pastes R2 keys into the environment, all uploads switch to CDN URLs
 * with no further code change — and until then nothing is worse than before.
 */
export async function uploadMediaFile(file: File): Promise<string> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/media/upload", { method: "POST", body: fd });
    if (res.ok) {
      const j = await res.json().catch(() => null);
      if (j?.url && typeof j.url === "string") return j.url;
    } else if (res.status !== 503) {
      // A real rejection (bad type, too large) — surface it instead of
      // silently stuffing an oversized file into the database as base64.
      const j = await res.json().catch(() => null);
      if (j?.error) throw new Error(j.error);
    }
    // 503 = storage not configured: intentional fallthrough to data URL.
  } catch (e) {
    if (e instanceof Error && e.message && !/fetch|network/i.test(e.message)) throw e;
    // Network-level failure: fall back rather than losing the admin's work.
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Review-photo upload: downscale in the browser first, then hand off to the
 * shared uploader.
 *
 * Two reasons this exists instead of calling uploadMediaFile directly:
 * a 4 MB phone photo is a slow, flaky upload on the mobile connections most
 * shoppers are on — and when R2 isn't configured yet the fallback stores the
 * result as a base64 data URL in the reviews row, where an un-shrunk photo
 * would bloat every query that touches the product's reviews. 1280px WebP at
 * q0.82 lands well under 300 KB for a typical photo, which both paths can
 * live with.
 *
 * Falls back to the original file when canvas work fails (ancient browser,
 * exotic format) — the server re-encodes to bounded WebP anyway when R2 is
 * configured, so the downscale is an optimisation, not a gate.
 */
export async function uploadReviewPhoto(file: File): Promise<string> {
  const MAX_DIM = 1280;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (blob && blob.size > 0 && blob.size < file.size) {
      return uploadMediaFile(new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" }));
    }
  } catch {
    // Downscale is best-effort; the original still goes through the
    // size-checked upload route below.
  }
  return uploadMediaFile(file);
}
