/**
 * GET /api/catalogue/summary — the Catalogue Health dashboard payload:
 * health %, per-problem counts, the active job (if any), recent jobs and
 * whether the image search integration is configured.
 */

import { getCurrentAdmin } from "@/lib/auth";
import { computeHealthSummary, getCatalogueSettings } from "@/lib/catalogue/health";
import { getActiveJob } from "@/lib/catalogue/jobs";
import { imageSearchConfigured } from "@/lib/catalogue/imageHunt";
import { r2Configured } from "@/lib/media/r2";
import { db } from "@/db";
import { catalogueJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [summary, settings, activeJob, recentJobs] = await Promise.all([
      computeHealthSummary(),
      getCatalogueSettings(),
      getActiveJob(),
      db.select().from(catalogueJobs).orderBy(desc(catalogueJobs.id)).limit(5),
    ]);

    return Response.json({
      summary,
      settings: {
        dailyCheckEnabled: settings.dailyCheckEnabled,
        autoFixEnabled: settings.autoFixEnabled,
        autoApproveThreshold: settings.autoApproveThreshold,
        reviewThreshold: settings.reviewThreshold,
        requiredPublishFields: settings.requiredPublishFields,
      },
      capabilities: {
        imageSearchConfigured: imageSearchConfigured(),
        objectStorageConfigured: r2Configured(),
      },
      activeJob,
      recentJobs,
    });
  } catch (e) {
    reportError(e, "catalogue/summary");
    return Response.json({ error: "Failed to compute catalogue health." }, { status: 500 });
  }
}
