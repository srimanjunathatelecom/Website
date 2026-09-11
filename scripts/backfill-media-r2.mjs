#!/usr/bin/env node
/**
 * Move base64 media out of PostgreSQL and into Cloudflare R2.
 *
 * Every image the admin uploaded before R2 was configured is sitting in a
 * text column as a `data:` URL. This script finds those, uploads the decoded
 * bytes to the bucket, and replaces the column value with the short CDN URL.
 * Renderers already accept plain URLs in every one of these columns, so no
 * other change is involved (audit §4, migration step 5).
 *
 * Safe to run any time, safe to interrupt, safe to re-run:
 *   - each row is updated only after its upload succeeded
 *   - a re-run only sees rows still starting with `data:` — finished rows
 *     no longer match
 *   - a guard re-checks the value hasn't changed since it was read, so an
 *     admin editing during the run can't have their change overwritten
 *
 * Deliberately skipped:
 *   - `data:image/svg+xml` values: the launch catalogue's generated SVG art.
 *     They are a few KB each (harmless in the DB) and serving user-openable
 *     SVGs from the media host is an XSS foothold. They stay where they are.
 *
 * Usage: node scripts/backfill-media-r2.mjs [--dry-run]
 * Needs: DATABASE_URL + all five R2_* variables (reads .env like check-env).
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import pg from "pg";

try {
  const dotenv = await import("dotenv");
  dotenv.config();
} catch {
  // Values may come from the host's environment instead. Carry on.
}

const DRY_RUN = process.argv.includes("--dry-run");

const env = (k) => (process.env[k] || "").trim();
const R2 = {
  accountId: env("R2_ACCOUNT_ID"),
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  bucket: env("R2_BUCKET"),
  publicBaseUrl: env("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
};

if (!env("DATABASE_URL")) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (!(R2.accountId && R2.accessKeyId && R2.secretAccessKey && R2.bucket && R2.publicBaseUrl)) {
  console.error("All five R2_* variables must be set. See .env.example (Media storage section).");
  process.exit(1);
}

// Every table/column pair that can hold a data: URL. Columns are verified
// against information_schema before querying, so this list can safely name a
// column that an older database doesn't have yet.
const TARGETS = [
  { table: "product_images", id: "id", column: "data_url" },
  { table: "banners", id: "id", column: "image" },
  { table: "banners", id: "id", column: "mobile_image" },
  { table: "promo_cards", id: "id", column: "image" },
  { table: "brands", id: "id", column: "logo_url" },
  { table: "categories", id: "id", column: "image" },
  { table: "product_variants", id: "id", column: "image" },
  { table: "product_variants", id: "id", column: "swatch_image" },
  { table: "outlets", id: "id", column: "photo" },
  { table: "services", id: "id", column: "image" },
  { table: "store_settings", id: "id", column: "logo_url" },
  { table: "store_settings", id: "id", column: "promo_video_url" },
];

const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const sha256Hex = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (key, d) => createHmac("sha256", key).update(d).digest();

/** Same SigV4 PUT as src/lib/media/r2.ts, in plain JS for a node script. */
async function putR2Object(key, body, contentType) {
  const host = `${R2.accountId}.r2.cloudflarestorage.com`;
  const uri = `/${R2.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const headers = {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(headers).sort();
  const canonical = ["PUT", uri, "", names.map((h) => `${h}:${headers[h]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${R2.secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const res = await fetch(`https://${host}${uri}`, {
    method: "PUT",
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${R2.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return `${R2.publicBaseUrl}/${key}`;
}

/** Decode a data: URL into bytes + content type. Returns null for SVG/unknown. */
function decodeDataUrl(value) {
  const m = /^data:([\w.+-]+\/[\w.+-]+)?(;base64)?,(.*)$/s.exec(value);
  if (!m) return null;
  const type = (m[1] || "").toLowerCase();
  if (!EXT[type]) return null; // SVG and anything exotic stays in the DB
  const bytes = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  if (bytes.length === 0) return null;
  return { bytes, type };
}

const client = new pg.Client({ connectionString: env("DATABASE_URL") });
await client.connect();

let moved = 0;
let skipped = 0;
let failed = 0;

try {
  for (const t of TARGETS) {
    const { rows: colCheck } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [t.table, t.column]
    );
    if (colCheck.length === 0) continue;

    const { rows } = await client.query(
      `SELECT ${t.id} AS id, ${t.column} AS value FROM ${t.table} WHERE ${t.column} LIKE 'data:%' ORDER BY ${t.id}`
    );
    if (rows.length === 0) continue;
    console.log(`${t.table}.${t.column}: ${rows.length} data-URL row(s)`);

    for (const row of rows) {
      const decoded = decodeDataUrl(row.value);
      if (!decoded) {
        skipped += 1;
        continue;
      }
      const kb = (decoded.bytes.length / 1024).toFixed(1);
      const key = `media/backfill/${t.table}/${row.id}-${randomBytes(6).toString("hex")}.${EXT[decoded.type]}`;
      if (DRY_RUN) {
        console.log(`  [dry-run] would move ${t.table}#${row.id} (${decoded.type}, ${kb} KB) -> ${key}`);
        moved += 1;
        continue;
      }
      try {
        const url = await putR2Object(key, decoded.bytes, decoded.type);
        // Update only if the value is still exactly what we read, so a
        // concurrent admin edit wins over the backfill.
        const res = await client.query(
          `UPDATE ${t.table} SET ${t.column} = $1 WHERE ${t.id} = $2 AND ${t.column} = $3`,
          [url, row.id, row.value]
        );
        if (res.rowCount === 1) {
          moved += 1;
          console.log(`  moved ${t.table}#${row.id} (${kb} KB) -> ${url}`);
        } else {
          skipped += 1;
          console.log(`  skipped ${t.table}#${row.id} — row changed while uploading`);
        }
      } catch (e) {
        failed += 1;
        console.error(`  FAILED ${t.table}#${row.id}: ${e.message}`);
      }
    }
  }
} finally {
  await client.end();
}

console.log(`\nDone. moved=${moved} skipped=${skipped} failed=${failed}${DRY_RUN ? " (dry run — nothing written)" : ""}`);
process.exit(failed > 0 ? 1 : 0);
