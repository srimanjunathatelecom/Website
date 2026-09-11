/**
 * Minimal ZIP reader for the bulk image upload (spec §10/§11).
 *
 * Reads the central directory of a standard ZIP and inflates STORED (0) and
 * DEFLATE (8) entries with node:zlib — the only two methods anything that
 * says "zip" actually produces. Hand-rolled for the same reason r2.ts
 * hand-rolls SigV4: the need is ~90 lines, a zip dependency is not.
 *
 * Only image-named entries are returned, directories and junk (__MACOSX,
 * dotfiles) are skipped, and per-entry + total size caps stop a zip bomb at
 * the door.
 */

import { inflateRawSync } from "node:zlib";

export type ZipImageEntry = { name: string; data: Buffer };

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|tiff?)$/i;
const MAX_ENTRY_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export function readZipImages(zip: Buffer): ZipImageEntry[] {
  // End Of Central Directory: scan back for its signature (0x06054b50).
  let eocd = -1;
  const min = Math.max(0, zip.length - 65557);
  for (let i = zip.length - 22; i >= min; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid ZIP file.");

  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  const out: ZipImageEntry[] = [];
  let total = 0;

  for (let n = 0; n < entryCount; n++) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50) break;
    const method = zip.readUInt16LE(offset + 10);
    const compSize = zip.readUInt32LE(offset + 20);
    const uncompSize = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const rawName = zip.slice(offset + 46, offset + 46 + nameLen).toString("utf8");
    offset += 46 + nameLen + extraLen + commentLen;

    const base = rawName.split("/").pop() || "";
    if (!base || rawName.endsWith("/")) continue;               // directory
    if (rawName.startsWith("__MACOSX") || base.startsWith(".")) continue; // junk
    if (!IMAGE_EXT.test(base)) continue;                        // not an image
    if (uncompSize > MAX_ENTRY_BYTES) continue;                 // absurd single file
    total += uncompSize;
    if (total > MAX_TOTAL_BYTES) throw new Error("ZIP contents exceed 200 MB — split it into smaller uploads.");

    // Local header: name/extra lengths there can differ from the central copy.
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lNameLen = zip.readUInt16LE(localOffset + 26);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = zip.slice(dataStart, dataStart + compSize);

    try {
      const data = method === 0 ? Buffer.from(comp) : method === 8 ? inflateRawSync(comp) : null;
      if (data) out.push({ name: base, data });
    } catch {
      // A single corrupt entry shouldn't kill the batch — skip it.
    }
  }
  return out;
}
