/**
 * Step 2: apply a previewed import. This is the ONLY place an import writes
 * to products, and it re-checks live data first:
 *
 * - if the same file was already imported, the admin must have explicitly
 *   confirmed "import again" (allowDuplicateFile) — re-uploading a receipt
 *   file must never silently double the inventory;
 * - if the preview showed stale-sheet warnings, allowStale must be set;
 * - set-type stock rows whose live stock no longer matches the preview are
 *   NOT applied — they come back as conflicts with both numbers.
 */

import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { commitBatch, findPreviousImports, type CommitOptions } from "@/lib/importing/db";
import { importRows } from "@/db/schema";
import { enqueueEnrichment } from "@/lib/catalogue/jobs";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`import-commit:${clientIp(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId)) return Response.json({ error: "Invalid import id." }, { status: 400 });

  let body: CommitOptions = {};
  try {
    body = await req.json();
  } catch {
    // empty body = default options
  }

  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) return Response.json({ error: "Import not found." }, { status: 404 });
    if (batch.status !== "previewed") {
      return Response.json({ error: `This import was already ${batch.status === "committed" ? "applied" : batch.status}.` }, { status: 409 });
    }

    // Duplicate-file gate: same content hash already committed.
    const dupes = (await findPreviousImports(batch.fileHash)).filter((d) => d.id !== batchId);
    if (dupes.length > 0 && !body.allowDuplicateFile) {
      return Response.json({
        error: "This exact file was already imported.",
        needsConfirmation: "duplicate_file",
        previousImports: dupes,
      }, { status: 409 });
    }

    // Stale gate: the preview counted rows whose stock moved after the sheet
    // was exported; committing over them needs an explicit yes.
    const staleRows = (batch.summary as { staleRows?: number })?.staleRows ?? 0;
    if (staleRows > 0 && !body.allowStale) {
      return Response.json({
        error: `${staleRows} item(s) had stock changes AFTER this sheet was made. Importing may overwrite newer numbers.`,
        needsConfirmation: "stale_file",
        staleRows,
      }, { status: 409 });
    }

    const result = await commitBatch(batchId, { id: admin.id, name: admin.name }, body);
    revalidateProduct();

    // Excel-to-complete-catalogue pipeline: every product this import touched
    // is handed to the catalogue engine in the background — enrich missing
    // data, find official images, or queue a review card. Fire-and-forget:
    // the import result never waits on (or fails because of) enrichment.
    try {
      const touched = await db
        .select({ productId: importRows.productId })
        .from(importRows)
        .where(eq(importRows.importId, batchId));
      await enqueueEnrichment(
        touched.map((t) => t.productId).filter((n): n is number => Number.isInteger(n) && (n as number) > 0),
        admin.name
      );
    } catch {
      // enrichment is a bonus, never a blocker
    }

    return Response.json({
      ok: true,
      ...result,
      message:
        result.conflicts.length === 0
          ? `Done — ${result.applied} change(s) applied.`
          : `${result.applied} change(s) applied. ${result.conflicts.length} row(s) were NOT applied because stock changed since the preview — check the list and re-import just those if needed.`,
    });
  } catch (err) {
    reportError(err, "api/imports/commit");
    const msg = err instanceof Error ? err.message : "The import could not be applied.";
    return Response.json({ error: msg }, { status: 400 });
  }
}
