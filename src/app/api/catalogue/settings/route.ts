/**
 * GET/PUT /api/catalogue/settings — the owner's automation preferences:
 * daily check on/off, auto-fix on/off, confidence thresholds and which
 * fields a product must have before it may be published (spec §23).
 */

import { db } from "@/db";
import { catalogueSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { getCatalogueSettings } from "@/lib/catalogue/health";

export const dynamic = "force-dynamic";

const FIELD_KEYS = new Set(["name", "brand", "categoryId", "mop", "mrp", "image", "description", "specifications", "sku"]);

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ settings: await getCatalogueSettings() });
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const current = await getCatalogueSettings();

  const updates: Partial<typeof current> = {};
  if (typeof body.dailyCheckEnabled === "boolean") updates.dailyCheckEnabled = body.dailyCheckEnabled;
  if (typeof body.autoFixEnabled === "boolean") updates.autoFixEnabled = body.autoFixEnabled;
  if (Number.isInteger(body.autoApproveThreshold) && body.autoApproveThreshold >= 80 && body.autoApproveThreshold <= 100) {
    updates.autoApproveThreshold = body.autoApproveThreshold;
  }
  if (Number.isInteger(body.reviewThreshold) && body.reviewThreshold >= 30 && body.reviewThreshold <= 95) {
    updates.reviewThreshold = body.reviewThreshold;
  }
  if (Array.isArray(body.requiredPublishFields)) {
    const fields = body.requiredPublishFields.map(String).filter((f: string) => FIELD_KEYS.has(f));
    if (fields.includes("name") && fields.includes("mop")) updates.requiredPublishFields = fields; // name+price are non-negotiable
  }
  // Review threshold can never sit above auto-approve.
  const auto = updates.autoApproveThreshold ?? current.autoApproveThreshold;
  const review = updates.reviewThreshold ?? current.reviewThreshold;
  if (review >= auto) updates.reviewThreshold = auto - 5;

  if (Object.keys(updates).length === 0) return Response.json({ settings: current });

  await db.update(catalogueSettings).set(updates).where(eq(catalogueSettings.id, 1));
  return Response.json({ settings: await getCatalogueSettings() });
}
