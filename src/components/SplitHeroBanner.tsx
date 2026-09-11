import Link from "next/link";
import SafeImage from "./SafeImage";
import BannerStyleFrame from "./BannerStyleFrame";

export type SplitBannerData = {
  id: number;
  title: string;
  subtitle?: string | null;
  image?: string | null;
  link: string;
  ctaLabel?: string | null;
  imageSide?: string | null; // "left" | "right"
  style?: string | null;
  textAnimation?: string | null;
  productAnimation?: string | null;
  badge?: string | null;
};

// Text + CTA on one side, image on the other. Renders null when there's
// no image — a split hero with a missing image is worse than no banner
// at all, and the caller (page.tsx) should simply not render this slot.
//
// When the banner has a non-"minimal" `style` set, delegate to the
// premium layered composition system (BannerStyleFrame) instead —
// existing rows default to "minimal" and keep this exact original
// layout untouched.
export default function SplitHeroBanner({ banner }: { banner: SplitBannerData }) {
  if (!banner.image) return null;

  if (banner.style && banner.style !== "minimal") {
    return (
      <BannerStyleFrame
        data={{
          id: banner.id,
          link: banner.link,
          badge: banner.badge,
          title: banner.title,
          subtitle: banner.subtitle,
          ctaLabel: banner.ctaLabel,
          image: banner.image,
          imageSide: banner.imageSide,
          style: banner.style,
          textAnimation: banner.textAnimation,
          productAnimation: banner.productAnimation,
        }}
      />
    );
  }

  const imageRight = (banner.imageSide ?? "right") !== "left";

  return (
    <section className="shell band-tight">
      <div
        className={`grid grid-cols-1 overflow-hidden rounded-3xl bg-slate-900 shadow-xl ring-1 ring-slate-800 sm:grid-cols-2 ${
          imageRight ? "" : "sm:[direction:rtl]"
        }`}
      >
        <div className={`flex flex-col justify-center gap-4 p-8 text-white sm:p-12 ${imageRight ? "" : "sm:[direction:ltr]"}`}>
          <h2 className="text-2xl font-black leading-tight tracking-tight sm:text-4xl">{banner.title}</h2>
          {banner.subtitle && <p className="max-w-sm text-sm text-slate-300 sm:text-base">{banner.subtitle}</p>}
          <Link
            href={banner.link}
            className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:scale-105"
          >
            {banner.ctaLabel || "Shop Now"} <span className="nudge-x">→</span>
          </Link>
        </div>
        <div className={`relative min-h-[220px] sm:min-h-[340px] ${imageRight ? "" : "sm:[direction:ltr]"}`}>
          <SafeImage src={banner.image} alt={banner.title} className="object-cover" />
        </div>
      </div>
    </section>
  );
}
