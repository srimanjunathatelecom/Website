import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";
import { imageRefError } from "@/lib/imageRef";

export const dynamic = "force-dynamic";

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await _req.json();
  const [existing] = await db.select().from(services).where(eq(services.id, id));
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  // Image refs are validated the same way as every other admin image field so
  // a stray non-URL string can never reach the storefront <img>.
  if (b.image != null && String(b.image).trim() !== "") {
    const refErr = imageRefError(String(b.image).trim(), "Service image");
    if (refErr) return Response.json({ error: refErr }, { status: 400 });
  }
  await db
    .update(services)
    .set({
      name: b.name ?? existing.name,
      description: b.description ?? existing.description,
      deviceTypes: b.deviceTypes ?? existing.deviceTypes,
      startPrice: b.startPrice ?? existing.startPrice,
      turnaround: b.turnaround ?? existing.turnaround,
      outletIds: b.outletIds ?? existing.outletIds,
      sortOrder: b.sortOrder != null ? Number(b.sortOrder) : existing.sortOrder,
      status: b.status ?? existing.status,
      image: b.image != null ? String(b.image).trim() : existing.image,
      imageAlt: b.imageAlt != null ? String(b.imageAlt).trim() : existing.imageAlt,
      imageSource: b.imageSource != null ? String(b.imageSource) : existing.imageSource,
      category: b.category != null ? String(b.category).trim() : existing.category,
      featured: b.featured != null ? Boolean(b.featured) : existing.featured,
      badge: b.badge != null ? String(b.badge).trim() : existing.badge,
      ctaLabel: b.ctaLabel != null ? String(b.ctaLabel).trim() : existing.ctaLabel,
      bookingUrl: b.bookingUrl != null ? String(b.bookingUrl).trim() : existing.bookingUrl,
      seoTitle: b.seoTitle != null ? String(b.seoTitle).trim() : existing.seoTitle,
      metaDescription: b.metaDescription != null ? String(b.metaDescription).trim() : existing.metaDescription,
    })
    .where(eq(services.id, id));
  revalidateContent();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(services).where(eq(services.id, Number((await params).id)));
  revalidateContent();
  return Response.json({ ok: true });
}
