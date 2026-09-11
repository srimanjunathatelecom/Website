import { db } from "@/db";
import { banners } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
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

// Shared between POST and PUT so both accept exactly the same shape and
// fall back to the same safe defaults for anything missing/invalid.
function toBannerValues(b: any) {
  return {
    title: String(b.title || "New Offer"),
    subtitle: b.subtitle || "",
    image: b.image || null,
    link: b.link || "/products",
    slot: b.slot || "hero",
    active: b.active !== false,
    bannerType: BANNER_TYPES.includes(b.bannerType) ? b.bannerType : "image",
    size: SIZES.includes(b.size) ? b.size : "full",
    ctaLabel: b.ctaLabel || null,
    mobileImage: b.mobileImage || null,
    videoUrl: b.videoUrl || null,
    productId: b.productId != null && b.productId !== "" ? Number(b.productId) : null,
    categoryId: b.categoryId != null && b.categoryId !== "" ? Number(b.categoryId) : null,
    brandId: b.brandId != null && b.brandId !== "" ? Number(b.brandId) : null,
    startDate: b.startDate || null,
    endDate: b.endDate || null,
    animation: ANIMATIONS.includes(b.animation) ? b.animation : "fade",
    imageSide: IMAGE_SIDES.includes(b.imageSide) ? b.imageSide : "right",
    autoplayMs: b.autoplayMs != null && b.autoplayMs !== "" ? Number(b.autoplayMs) : null,
    style: STYLES.includes(b.style) ? b.style : "minimal",
    textAnimation: TEXT_ANIMATIONS.includes(b.textAnimation) ? b.textAnimation : "fade-up",
    productAnimation: PRODUCT_ANIMATIONS.includes(b.productAnimation) ? b.productAnimation : "none",
    transition: TRANSITIONS.includes(b.transition) ? b.transition : "fade",
    badge: b.badge || null,
    contentPosition: CONTENT_POSITIONS.includes(b.contentPosition) ? b.contentPosition : "left",
    overlayStrength: OVERLAY_STRENGTHS.includes(b.overlayStrength) ? b.overlayStrength : "medium",
    mobileVideo: b.mobileVideo === true,
  };
}

export async function GET(_req: Request) {
  const admin = await getCurrentAdmin();
  const rows = admin
    ? await db.select().from(banners).orderBy(asc(banners.sortOrder))
    : await db.select().from(banners).where(eq(banners.active, true)).orderBy(asc(banners.sortOrder));
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const [max] = await db.select({ m: banners.sortOrder }).from(banners).orderBy(banners.sortOrder);
  const [ban] = await db
    .insert(banners)
    .values({
      ...toBannerValues(b),
      sortOrder: Number(b.sortOrder ?? (max?.m ?? 0) + 1),
    })
    .returning();
  revalidateHomepage();
  return Response.json({ ok: true, banner: ban });
}