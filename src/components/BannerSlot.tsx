import type { EnrichedBanner } from "@/lib/queries";
import Reveal from "./Reveal";
import SplitHeroBanner from "./SplitHeroBanner";
import ProductLedBanner from "./ProductLedBanner";
import CategoryBanner from "./CategoryBanner";
import BrandBanner from "./BrandBanner";
import MixedBannerGrid from "./MixedBannerGrid";
import VideoBanner from "./VideoBanner";

// Maps banner.animation -> Reveal's variant prop, so admin's animation
// picker (fade/slide/scale/none) drives entrance behavior without any
// per-component wiring.
function toRevealVariant(animation: string | null | undefined): "fade" | "slide-left" | "scale" | "none" {
  if (animation === "slide") return "slide-left";
  if (animation === "scale") return "scale";
  if (animation === "none") return "none";
  return "fade";
}

// This is the "system" the spec's automatic content-based layout section
// asks for: given a slot's banners (already enriched with their live
// product/category/brand refs by getEnrichedBanners), pick the matching
// renderer per banner.bannerType. Admin never edits JSX — they set
// bannerType + the relevant fields, and the right layout follows.
//
// "grid" is the one banner type that composes multiple rows into a
// single MixedBannerGrid rather than one banner = one render, so it's
// handled once for the whole set instead of per-item.
export default function BannerSlot({ banners }: { banners: EnrichedBanner[] }) {
  if (banners.length === 0) return null;

  const gridBanners = banners.filter((b) => b.bannerType === "grid");
  const singleBanners = banners.filter((b) => b.bannerType !== "grid");

  return (
    <>
      {gridBanners.length > 0 && (
        <Reveal variant={toRevealVariant(gridBanners[0].animation)}>
          <MixedBannerGrid
            banners={gridBanners.map((b) => ({
              id: b.id,
              title: b.title,
              subtitle: b.subtitle,
              image: b.image,
              link: b.link,
              size: b.size,
            }))}
          />
        </Reveal>
      )}
      {singleBanners.map((b) => {
        const variant = toRevealVariant(b.animation);
        switch (b.bannerType) {
          case "split":
            return (
              <Reveal key={b.id} variant={variant}>
                <SplitHeroBanner
                  banner={{
                    id: b.id,
                    title: b.title,
                    subtitle: b.subtitle,
                    image: b.image,
                    link: b.link,
                    ctaLabel: b.ctaLabel,
                    imageSide: b.imageSide,
                    style: b.style,
                    textAnimation: b.textAnimation,
                    productAnimation: b.productAnimation,
                    badge: b.badge,
                  }}
                />
              </Reveal>
            );
          case "product":
            return (
              <Reveal key={b.id} variant={variant}>
                <ProductLedBanner
                  banner={{
                    id: b.id,
                    title: b.title,
                    subtitle: b.subtitle,
                    ctaLabel: b.ctaLabel,
                    refProduct: b.refProduct,
                    style: b.style,
                    textAnimation: b.textAnimation,
                    productAnimation: b.productAnimation,
                    imageSide: b.imageSide,
                    badge: b.badge,
                  }}
                />
              </Reveal>
            );
          case "category":
            return (
              <Reveal key={b.id} variant={variant}>
                <CategoryBanner banner={{ id: b.id, title: b.title, subtitle: b.subtitle, refCategory: b.refCategory }} />
              </Reveal>
            );
          case "brand":
            return (
              <Reveal key={b.id} variant={variant}>
                <BrandBanner banner={{ id: b.id, title: b.title, subtitle: b.subtitle, image: b.image, refBrand: b.refBrand }} />
              </Reveal>
            );
          case "video":
            return (
              <Reveal key={b.id} variant={variant}>
                <VideoBanner
                  banner={{ id: b.id, title: b.title, subtitle: b.subtitle, image: b.image, videoUrl: b.videoUrl, link: b.link, ctaLabel: b.ctaLabel }}
                />
              </Reveal>
            );
          case "image":
          default:
            // Plain image+link tile — same visual language as the
            // existing PromoBannerStrip fallback tiles, reused via
            // MixedBannerGrid's single-tile path for consistency.
            return (
              <Reveal key={b.id} variant={variant}>
                <MixedBannerGrid banners={[{ id: b.id, title: b.title, subtitle: b.subtitle, image: b.image, link: b.link }]} />
              </Reveal>
            );
        }
      })}
    </>
  );
}
