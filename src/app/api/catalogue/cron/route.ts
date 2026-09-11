/**
 * GET|POST /api/catalogue/cron — the daily health check (spec §22).
 *
 * Called by a scheduler (Vercel Cron, GitHub Actions, any curl with the
 * CRON_SECRET bearer token) or manually by a signed-in admin. Runs a full
 * scan+fix job and sends ONE grouped notification — but only when the owner
 * has the daily check switched on, and never while another job is running.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { catalogueSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { getCatalogueSettings } from "@/lib/catalogue/health";
import { getActiveJob, startCatalogueJob } from "@/lib/catalogue/jobs";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

async function isAuthorized(req: Request): Promise<boolean> {
  const admin = await getCurrentAdmin();
  if (admin) return true;
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const presented = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function run(req: Request) {
  if (!(await isAuthorized(req))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const settings = await getCatalogueSettings();
    if (!settings.dailyCheckEnabled) {
      return Response.json({ skipped: true, reason: "Daily health check is switched off in Catalogue settings." });
    }
    const active = await getActiveJob();
    if (active) return Response.json({ skipped: true, reason: "Another catalogue job is already running.", jobId: active.id });

    const { jobId } = await startCatalogueJob({ type: "daily_check", scope: { kind: "all" }, admin: { id: null, name: "daily check" } });
    await db.update(catalogueSettings).set({ lastDailyRunAt: new Date() }).where(eq(catalogueSettings.id, 1));
    return Response.json({ started: true, jobId });
  } catch (e) {
    reportError(e, "catalogue/cron");
    return Response.json({ error: "Daily check failed to start." }, { status: 500 });
  }
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
