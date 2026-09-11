/**
 * GET  /api/catalogue/jobs/:id — poll a background job ("Processing 184 / 750").
 * POST /api/catalogue/jobs/:id — { action: "cancel" } stops it after the
 * current product; everything already done stays done.
 */

import { db } from "@/db";
import { catalogueJobs } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { reapStaleJobs } from "@/lib/catalogue/jobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) return Response.json({ error: "Invalid job id." }, { status: 400 });

  await reapStaleJobs();
  const [job] = await db.select().from(catalogueJobs).where(eq(catalogueJobs.id, jobId));
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  return Response.json({ job });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) return Response.json({ error: "Invalid job id." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (body.action !== "cancel") return Response.json({ error: "Unknown action." }, { status: 400 });

  await db
    .update(catalogueJobs)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(catalogueJobs.id, jobId), inArray(catalogueJobs.status, ["queued", "running"])));
  const [job] = await db.select().from(catalogueJobs).where(eq(catalogueJobs.id, jobId));
  return Response.json({ job });
}
