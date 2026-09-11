/**
 * Import history: every upload ever made, newest first — who, when, which
 * file, which mode, what it did, and whether it can still be undone.
 */

import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const batches = await db
      .select({
        id: importBatches.id,
        fileName: importBatches.fileName,
        mode: importBatches.mode,
        status: importBatches.status,
        adminName: importBatches.adminName,
        summary: importBatches.summary,
        createdAt: importBatches.createdAt,
        committedAt: importBatches.committedAt,
        rolledBackAt: importBatches.rolledBackAt,
      })
      .from(importBatches)
      .orderBy(desc(importBatches.id))
      .limit(50);
    return Response.json({ batches });
  } catch (err) {
    reportError(err, "api/imports");
    return Response.json({ error: "Could not load import history." }, { status: 500 });
  }
}
