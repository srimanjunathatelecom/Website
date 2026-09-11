/**
 * Undo a committed import — and ONLY that import.
 *
 * Stock is reversed as a delta (sales that happened after the import stay
 * deducted; if that would go below zero it stops at zero and says so).
 * Field edits are restored to their exact pre-import values. Products the
 * import created are hidden and zeroed, never deleted — an order may already
 * reference them.
 */

import { getCurrentAdmin } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";
import { revalidateProduct } from "@/lib/revalidateStorefront";
import { rollbackBatch } from "@/lib/importing/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`import-rollback:${clientIp(req)}`, 15, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId)) return Response.json({ error: "Invalid import id." }, { status: 400 });

  try {
    const result = await rollbackBatch(batchId, { id: admin.id, name: admin.name });
    revalidateProduct();
    return Response.json({
      ok: true,
      ...result,
      message:
        `Import undone — ${result.reversed} item(s) restored` +
        (result.hidden ? `, ${result.hidden} item(s) created by the import were hidden` : "") +
        (result.clamped.length
          ? `. Note: ${result.clamped.length} item(s) stopped at 0 stock because units were sold after the import: ${result.clamped.map((c) => c.name).slice(0, 5).join(", ")}`
          : "."),
    });
  } catch (err) {
    reportError(err, "api/imports/rollback");
    const msg = err instanceof Error ? err.message : "The import could not be undone.";
    return Response.json({ error: msg }, { status: 400 });
  }
}
