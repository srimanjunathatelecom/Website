import { db } from "@/db";
import { banners } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateHomepage } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

const BANNER_TYPES = ["image", "split", "product", "category", "brand", "grid", "video"];
const ANIMATIONS = ["fade", "slide", "scale", "none"];
const IMAGE_SIDES = ["left", "right"];
const SIZES = ["full", "large", "medium", "small", "square", "wide", "half", "tall"];
const STYLES = ["minimal", "premium-product", "dark-tech", "light-retail", "sale", "editorial", "glass", "gradient"];
const TEXT_ANIMATIONS = ["fade", "fade-up", "slide", "stagger", "pop", "none"];
const PRODUCT_ANIMATIONS = ["none", "float", "glow", "tilt", "scale"];
const TRANSITIONS = ["fade", "slide", "scale", "fade-slide"];
const CONTENT_POSITIONS = ["left", "center", "right"];
const OVERLAY_STRENGTHS = ["soft", "medium", "strong"];

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await _req.json();
  const [existing] = await db.select().from(banners).where(eq(banners.id, id));
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  await db
    .update(banners)
    .set({
      title: b.title ?? existing.title,
      subtitle: b.subtitle ?? existing.subtitle,
      image: b.image !== undefined ? b.image : existing.image,
      link: b.link ?? existing.link,
      slot: b.slot ?? existing.slot,
      active: b.active !== undefined ? !!b.active : existing.active,
      sortOrder: b.sortOrder != null ? Number(b.sortOrder) : existing.sortOrder,
      bannerType: BANNER_TYPES.includes(b.bannerType) ? b.bannerType : existing.bannerType,
      size: SIZES.includes(b.size) ? b.size : existing.size,
      ctaLabel: b.ctaLabel !== undefined ? b.ctaLabel : existing.ctaLabel,
      mobileImage: b.mobileImage !== undefined ? b.mobileImage : existing.mobileImage,
      videoUrl: b.videoUrl !== undefined ? b.videoUrl : existing.videoUrl,
      // Explicit null clears the reference (e.g. switching layout away
      // from "product"); undefined leaves whatever was already stored.
      productId: b.productId !== undefined ? (b.productId === "" || b.productId === null ? null : Number(b.productId)) : existing.productId,
      categoryId: b.categoryId !== undefined ? (b.categoryId === "" || b.categoryId === null ? null : Number(b.categoryId)) : existing.categoryId,
      brandId: b.brandId !== undefined ? (b.brandId === "" || b.brandId === null ? null : Number(b.brandId)) : existing.brandId,
      startDate: b.startDate !== undefined ? b.startDate : existing.startDate,
      endDate: b.endDate !== undefined ? b.endDate : existing.endDate,
      animation: ANIMATIONS.includes(b.animation) ? b.animation : existing.animation,
      imageSide: IMAGE_SIDES.includes(b.imageSide) ? b.imageSide : existing.imageSide,
      autoplayMs: b.autoplayMs !== undefined ? (b.autoplayMs === "" || b.autoplayMs === null ? null : Number(b.autoplayMs)) : existing.autoplayMs,
      style: b.style !== undefined ? (STYLES.includes(b.style) ? b.style : existing.style) : existing.style,
      textAnimation: b.textAnimation !== undefined ? (TEXT_ANIMATIONS.includes(b.textAnimation) ? b.textAnimation : existing.textAnimation) : existing.textAnimation,
      productAnimation: b.productAnimation !== undefined ? (PRODUCT_ANIMATIONS.includes(b.productAnimation) ? b.productAnimation : existing.productAnimation) : existing.productAnimation,
      transition: b.transition !== undefined ? (TRANSITIONS.includes(b.transition) ? b.transition : existing.transition) : existing.transition,
      badge: b.badge !== undefined ? b.badge : existing.badge,
      contentPosition:
        b.contentPosition !== undefined
          ? (CONTENT_POSITIONS.includes(b.contentPosition) ? b.contentPosition : existing.contentPosition)
          : existing.contentPosition,
      overlayStrength:
        b.overlayStrength !== undefined
          ? (OVERLAY_STRENGTHS.includes(b.overlayStrength) ? b.overlayStrength : existing.overlayStrength)
          : existing.overlayStrength,
      mobileVideo: b.mobileVideo !== undefined ? !!b.mobileVideo : existing.mobileVideo,
    })
    .where(eq(banners.id, id));
  revalidateHomepage();
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(banners).where(eq(banners.id, Number((await params).id)));
  revalidateHomepage();
  return Response.json({ ok: true });
}