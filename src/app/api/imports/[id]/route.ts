/**
 * One import in full: the batch plus every row's plan/outcome.
 *
 * ?format=errors downloads a CSV error report — row number, item, problem,
 * how to fix — that the admin can open in Excel next to their original file.
 */

import { db } from "@/db";
import { importBatches, importRows } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId)) return Response.json({ error: "Invalid import id." }, { status: 400 });

  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    if (!batch) return Response.json({ error: "Import not found." }, { status: 404 });

    const rows = await db.select().from(importRows).where(eq(importRows.importId, batchId)).orderBy(importRows.rowNum);

    const url = new URL(req.url);
    if (url.searchParams.get("format") === "errors") {
      const lines = ["Row,Item,SKU,Problem,What to do"];
      for (const r of rows) {
        const problems: string[] = [];
        if (r.error) problems.push(r.error);
        for (const w of (r.warnings as string[]) ?? []) problems.push(w);
        if (problems.length === 0) continue;
        for (const p of problems) {
          lines.push(
            [String(r.rowNum), csvEscape(r.name), csvEscape(r.sku), csvEscape(p), csvEscape(r.error ? "Fix this row in your file and upload it again." : "Check and confirm — this was a warning, not an error.")].join(",")
          );
        }
      }
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="import-${batchId}-problems.csv"`,
        },
      });
    }

    return Response.json({ batch, rows });
  } catch (err) {
    reportError(err, "api/imports/detail");
    return Response.json({ error: "Could not load this import." }, { status: 500 });
  }
}
