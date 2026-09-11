/**
 * Step 1 of every import: upload + preview. NOTHING is written to products
 * here — the file is parsed, mapped, matched and planned, and the full plan
 * is stored on an import_batches row in "previewed" state. Products change
 * only when the admin confirms in step 2 (…/commit).
 *
 * multipart/form-data:
 *   file      the .csv or .xlsx
 *   mode      snapshot | receipt | adjust | reconcile | product | price
 *   mapping   optional JSON {colIndex: field} — the admin's corrected mapping
 *   allowNameMatch  optional "1" — apply unique name-only matches as updates
 */

import { db } from "@/db";
import { importBatches, importRows } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";
import { parseUpload, detectHeaderRow } from "@/lib/importing/parse";
import { autoMap, headerSignature, looksLikeKnownHeader, IMPORT_FIELDS, FIELD_LABELS, type Mapping, type ImportField } from "@/lib/importing/mapping";
import { planImport, MODE_INFO, type ImportMode } from "@/lib/importing/engine";
import { loadCatalog, fileHashOf, findPreviousImports, rememberedMapping, rememberMapping, rowPlanToDbRow, batchRowsInChunks } from "@/lib/importing/db";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_ROWS = 5000;

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`import-preview:${clientIp(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "") as ImportMode;
    const allowNameMatch = form.get("allowNameMatch") === "1";

    if (!(file instanceof File)) {
      return Response.json({ error: "No file received. Choose a .csv or .xlsx file and try again." }, { status: 400 });
    }
    if (!MODE_INFO[mode]) {
      return Response.json({ error: "Please choose what this file contains (stock count, new stock, adjustment…) before uploading." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "File is larger than 8 MB. Split it into smaller files and import them one by one." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = fileHashOf(buffer);

    // "This file appears to have already been imported."
    const previousImports = await findPreviousImports(fileHash);

    let grid;
    try {
      grid = await parseUpload(file.name, buffer);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Could not read this file." }, { status: 400 });
    }
    if (grid.length < 2) {
      return Response.json({ error: "The file has no data rows — it needs a header row (e.g. SKU, Stock) plus at least one product row." }, { status: 400 });
    }
    if (grid.length > MAX_ROWS + 1) {
      return Response.json({ error: `The file has ${grid.length - 1} rows — the limit is ${MAX_ROWS} per import. Split it and import in parts.` }, { status: 400 });
    }

    const headerRowIndex = detectHeaderRow(grid, looksLikeKnownHeader);
    const headers = grid[headerRowIndex];
    const signature = headerSignature(headers);

    // Mapping priority: admin's explicit correction → remembered → auto-guess.
    let mapping: Mapping | null = null;
    const mappingParam = form.get("mapping");
    if (typeof mappingParam === "string" && mappingParam) {
      try {
        const parsed = JSON.parse(mappingParam) as Record<string, string>;
        mapping = {};
        for (const [idx, field] of Object.entries(parsed)) {
          if ((IMPORT_FIELDS as readonly string[]).includes(field)) mapping[Number(idx)] = field as ImportField;
        }
        await rememberMapping(signature, mapping);
      } catch {
        return Response.json({ error: "The column mapping sent by the browser was invalid — refresh and try again." }, { status: 400 });
      }
    }
    if (!mapping) mapping = await rememberedMapping(signature);
    if (!mapping) mapping = autoMap(headers);

    const mappedFields = Object.values(mapping);
    const hasIdentity = mappedFields.some((f) => ["id", "sku", "variantSku", "barcode", "name"].includes(f));
    if (!hasIdentity) {
      return Response.json({
        error: "None of the columns identify a product. The file needs at least one of: Product ID, SKU, Barcode or Name.",
        headers,
        mapping,
        needsMapping: true,
      }, { status: 400 });
    }

    // "Exported At" column (present in our own export files) → stale checks.
    let exportedAt: Date | null = null;
    const exportedAtCol = Object.entries(mapping).find(([, f]) => f === "exportedAt")?.[0];
    if (exportedAtCol !== undefined) {
      const raw = grid[headerRowIndex + 1]?.[Number(exportedAtCol)] ?? "";
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) exportedAt = d;
    }

    const catalog = await loadCatalog();
    const { rows, summary } = planImport(grid, headerRowIndex, mapping, mode, catalog, { allowNameMatch, exportedAt });

    const [batch] = await db
      .insert(importBatches)
      .values({
        fileName: file.name,
        fileHash,
        fileSize: file.size,
        mode,
        status: "previewed",
        adminId: admin.id,
        adminName: admin.name,
        mapping,
        summary: summary as unknown as Record<string, unknown>,
        options: { allowNameMatch },
      })
      .returning({ id: importBatches.id });

    await batchRowsInChunks(rows.map((p) => rowPlanToDbRow(batch.id, p)), 200, async (chunk) => {
      await db.insert(importRows).values(chunk);
    });

    // The response carries everything the wizard needs. Row details are
    // capped; the full list is available from GET /api/imports/[id].
    return Response.json({
      importId: batch.id,
      mode,
      modeInfo: MODE_INFO[mode],
      fileName: file.name,
      headers,
      mapping,
      fieldLabels: FIELD_LABELS,
      exportedAt: exportedAt?.toISOString() ?? null,
      previousImports,
      summary,
      rows: rows.slice(0, 200).map((p) => ({
        rowNum: p.rowNum,
        action: p.action,
        name: p.name,
        sku: p.sku,
        matchedBy: p.matchedBy,
        changes: p.changes,
        stock: p.stock,
        warnings: p.warnings,
        error: p.error,
      })),
      rowsTruncated: rows.length > 200 ? rows.length - 200 : 0,
    });
  } catch (err) {
    reportError(err, "api/imports/preview");
    return Response.json({ error: "Something went wrong while reading the file. Try again, or export a fresh template and copy your data into it." }, { status: 500 });
  }
}
