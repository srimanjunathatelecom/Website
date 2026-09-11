import { db } from "@/db";
import { services } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";
import { imageRefError } from "@/lib/imageRef";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  const rows = admin
    ? await db.select().from(services).orderBy(asc(services.sortOrder))
    : await db.select().from(services).where(eq(services.status, "active")).orderBy(asc(services.sortOrder));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const name = String(b.name || "New Service").trim();

  // Guard against duplicate service names (case-insensitive) so accidental
  // double-submits or repeat manual entries can never create duplicates.
  const [existing] = await db
    .select({ id: services.id })
    .from(services)
    .where(sql`lower(${services.name}) = lower(${name})`);
  if (existing) {
    return Response.json({ error: `A service named "${name}" already exists.` }, { status: 409 });
  }

  const image = String(b.image || "").trim();
  if (image) {
    const refErr = imageRefError(image, "Service image");
    if (refErr) return Response.json({ error: refErr }, { status: 400 });
  }

  const [max] = await db.select({ m: services.sortOrder }).from(services).orderBy(services.sortOrder);
  const [s] = await db
    .insert(services)
    .values({
      name,
      description: String(b.description || ""),
      deviceTypes: String(b.deviceTypes || ""),
      startPrice: String(b.startPrice || "Price on inspection"),
      turnaround: String(b.turnaround || "Same day"),
      outletIds: String(b.outletIds || ""),
      sortOrder: Number(b.sortOrder ?? 0),
      status: b.status === "hidden" ? "hidden" : "active",
      image,
      imageAlt: String(b.imageAlt || "").trim(),
      imageSource: String(b.imageSource || ""),
      category: String(b.category || "").trim(),
      featured: Boolean(b.featured),
      badge: String(b.badge || "").trim(),
      ctaLabel: String(b.ctaLabel || "").trim(),
      bookingUrl: String(b.bookingUrl || "").trim(),
      seoTitle: String(b.seoTitle || "").trim(),
      metaDescription: String(b.metaDescription || "").trim(),
    })
    .returning();
  revalidateContent();
  return Response.json({ ok: true, service: s });
}