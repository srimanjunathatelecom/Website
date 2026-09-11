import Link from "next/link";
import AppShell from "@/components/AppShell";
import HeroCarousel from "@/components/HeroCarousel";
import CinematicHero from "@/components/CinematicHero";
import BrandStory from "@/components/BrandStory";
import BenefitCards from "@/components/BenefitCards";
import BrandStrip from "@/components/BrandStrip";
import CategoryCircleStrip from "@/components/CategoryCircleStrip";
import ServiceStrip from "@/components/ServiceStrip";
import ServiceProcess from "@/components/ServiceProcess";
import RepairServicesShowcase from "@/components/RepairServicesShowcase";
import ServiceFaq from "@/components/ServiceFaq";
import ServiceSolutions from "@/components/ServiceSolutions";
import { Phone } from "lucide-react";
import BestSellerShelf from "@/components/BestSellerShelf";
import DealShelf from "@/components/DealShelf";
import ScrollShelf from "@/components/ScrollShelf";
import ProductCard, { CardProduct } from "@/components/ProductCard";
import SafeImage from "@/components/SafeImage";
import Reveal from "@/components/Reveal";
import FlashSaleStrip from "@/components/FlashSaleStrip";
import ShopByBudget from "@/components/ShopByBudget";
import TrustBadges from "@/components/TrustBadges";
import ScratchCoupon from "@/components/ScratchCoupon";
import PromoBannerStrip from "@/components/PromoBannerStrip";
import BannerSlot from "@/components/BannerSlot";
import ProductSpotlight from "@/components/ProductSpotlight";
import BentoDeals from "@/components/BentoDeals";
import DailyDrop from "@/components/DailyDrop";
import UseCaseTiles from "@/components/UseCaseTiles";
import { pickDailyDrop } from "@/lib/dailyDrop";
import { db } from "@/db";
import { promoCards, coupons, contentPages } from "@/db/schema";
import { displayableCoupon } from "@/lib/coupon";
import { desc, eq } from "drizzle-orm";
import {
  getBanners, getEnrichedBanners, getCategories, getActiveBrands, getDeals, getFeatured, getProducts, getServices, getOutlets, getSettings,
} from "@/lib/queries";
import { fillHomeCopy, HOME_CONFIG_SLUG, parseHomePageConfig } from "@/lib/homepageConfig";
import { HOME_STORY_SLUG, parseHomeStoryConfig } from "@/lib/homepageStory";
import { HOME_SHOWCASE_SLUG, parseHomeShowcaseConfig } from "@/lib/homepageShowcase";
import TechShowcase from "@/components/TechShowcase";
import {
  HOMEPAGE_SECTIONS_SLUG,
  parseHomepageSectionsConfig,
  type SectionKey,
} from "@/lib/siteConfig";

// Was force-dynamic (a fresh DB round-trip — banners, deals, featured
// products, coupons — on every single request). Nothing on this page
// reads cookies/session (Header/cart/wishlist state is fetched client-side
// separately), so it's safe to cache and revalidate every 60s instead:
// same content freshness a shopkeeper would notice, far fewer duplicate
// queries under real traffic.
export const revalidate = 60;

const DEFAULT_PROMO_CARDS = [
  { id: 1, icon: "", title: "Easy EMI & Finance", subtitle: "Bajaj Finserv · DMI Finance", description: "Debit & Credit Card EMIs available.", themeColor: "text-amber-400" },
  { id: 2, icon: "", title: "DTH & Broadband", subtitle: "New Installation & Repair", description: "Fiber Setup: TATA Play · Airtel", themeColor: "text-sky-400" },
  { id: 3, icon: "", title: "Express Repair", subtitle: "Display · Battery · Mic", description: "Back Glass & Laptop Servicing.", themeColor: "text-emerald-400" },
  { id: 4, icon: "", title: "SIM & Cellular", subtitle: "Instant SIM Activation", description: "Quick activation for Jio, Airtel, Vi.", themeColor: "text-purple-400" },
];

function Eyebrow({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" }) {
  return (
    <p
      className={`text-[11px] font-black uppercase tracking-[0.3em] ${
        tone === "dark" ? "text-blue-300" : "text-blue-700"
      }`}
    >
      {children}
    </p>
  );
}

export default async function HomePage() {
  const [banners, heroVideoBanners, cats, shopBrands, deals, featured, mobiles, accessories, lapGear, services, outlets, settings, dbPromoCards, stripBanners, homePageContent, sectionsContent, storyContent, showcaseContent, merch1, merch2, merch3] = await Promise.all([
    getBanners("hero"),
    // Cinematic full-bleed hero. Opt-in only: this slot is empty on a
    // fresh install, in which case nothing renders and the existing hero
    // carousel below stays the page's opening beat. Video is never forced.
    getBanners("hero_video").catch(() => []),
    getCategories(),
    // Read here rather than fetched by BrandStrip after mount, so the rail
    // shows the shop's real brands in the first paint instead of flashing a
    // hardcoded placeholder list.
    getActiveBrands().catch(() => []),
    getDeals(12),
    getFeatured(10),
    getProducts({ categorySlug: "mobiles", limit: 12 }),
    getProducts({ categorySlug: "mobile-accessories", limit: 12 }),
    getProducts({ categorySlug: "laptop-accessories", limit: 12 }),
    getServices(),
    getOutlets(),
    getSettings(),
    db.select().from(promoCards).orderBy(desc(promoCards.sortOrder)).catch(() => []),
    getBanners("strip"),
    db.select().from(contentPages).where(eq(contentPages.slug, HOME_CONFIG_SLUG)).then((rows) => rows[0] || null).catch(() => null),
    db.select().from(contentPages).where(eq(contentPages.slug, HOMEPAGE_SECTIONS_SLUG)).then((rows) => rows[0] || null).catch(() => null),
    db.select().from(contentPages).where(eq(contentPages.slug, HOME_STORY_SLUG)).then((rows) => rows[0] || null).catch(() => null),
    db.select().from(contentPages).where(eq(contentPages.slug, HOME_SHOWCASE_SLUG)).then((rows) => rows[0] || null).catch(() => null),
    // Three separate merchandising slots, spread across the page instead
    // of one big cluster — each is independently admin-configurable
    // (split hero / product / category / brand / grid / video) via
    // BannerSlot, so the scroll alternates shapes instead of repeating
    // the same 3-equal-column strip five times.
    getEnrichedBanners("merchandising_1").catch(() => []),
    getEnrichedBanners("merchandising_2").catch(() => []),
    getEnrichedBanners("merchandising_3").catch(() => []),
  ]);

  const homeConfig = parseHomePageConfig(homePageContent?.body);
  const sectionsConfig = parseHomepageSectionsConfig(sectionsContent?.body);

  // Product spotlight: the exact product the admin picked in Homepage CMS,
  // else automatic — first featured product, else first mobile. Fetched
  // after config parsing because the pick lives inside the config JSON.
  const spotlightPick = homeConfig.spotlightProductId
    ? (await getProducts({ ids: [homeConfig.spotlightProductId], limit: 1 }).catch(() => []))[0]
    : undefined;
  const spotlightProduct = spotlightPick ?? featured[0] ?? mobiles[0];
  const spotlightAccessories = accessories.filter((a: any) => a.stock > 0).slice(0, 3);

  // Deal of the day: deterministic daily rotation over the live deals list
  // (day number in IST, so it flips at the store's midnight, not UTC's).
  const dailyDropProduct = pickDailyDrop(deals as any[]);
  const storyConfig = parseHomeStoryConfig(storyContent?.body);
  const showcaseConfig = parseHomeShowcaseConfig(showcaseContent?.body);
  const isHidden = (key: SectionKey) => sectionsConfig.hidden.includes(key);
  const cardsToDisplay = dbPromoCards && dbPromoCards.length > 0 ? dbPromoCards.filter((c) => c.active !== false) : DEFAULT_PROMO_CARDS;
  const outletCount = outlets.length > 0 ? outlets.length : "trusted service";
  const welcomeDescription = fillHomeCopy(homeConfig.welcomeDescription, {
    brand: settings?.brandName || "SMS Stores",
    tagline: settings?.tagline || "Real Prices. Real Savings. Every Day.",
    outletCount,
  });

  const activeCoupons = await db
    .select()
    .from(coupons)
    .where(displayableCoupon)
    .limit(8)
    .catch(() => []);

  // Cycle admin-managed "strip" banners into groups of 3 so each shelf below
  // gets a different trio instead of repeating the same three everywhere.
  // Only strip_1 and strip_3 remain as plain 3-equal-column strips now —
  // the rest of the old strip_0/2/4 slots became merchandising_1/2/3.
  //
  // FIX: when fewer than 3 strip banners have been uploaded, `% stripBanners.length`
  // used to wrap around and push the SAME banner into a group multiple times
  // (e.g. with 1 uploaded banner, every slot resolved to index 0, so PromoBannerStrip
  // showed one image repeated 3 times). We now only fill a group with banners that
  // actually exist and let PromoBannerStrip's own FALLBACK_SETS cover the remaining
  // tiles with real fallback content instead of a duplicate image.
  const stripGroups: (typeof stripBanners)[] = [];
  if (stripBanners.length > 0) {
    for (let i = 0; i < 2; i++) {
      const start = (i * 3) % stripBanners.length;
      const count = Math.min(3, stripBanners.length);
      const seen = new Set<number>();
      const group = [];
      for (let j = 0; j < count; j++) {
        const idx = (start + j) % stripBanners.length;
        if (seen.has(idx)) break; // fewer unique banners than slots — stop instead of repeating
        seen.add(idx);
        group.push(stripBanners[idx]);
      }
      stripGroups.push(group);
    }
  }
  // Keeps original fallbackSeed numbering (1 and 3) so PromoBannerStrip's
  // FALLBACK_SETS rotation still lines up with what admins saw before.
  const stripFor = (seed: number) => {
    const idx = seed === 1 ? 0 : 1;
    return stripGroups.length > 0 ? (stripGroups[idx] as any) : [];
  };

  // Each of these mirrors a block that used to be hardcoded, in a fixed
  // order, directly in this file's JSX. They're now rendered through
  // `sectionsConfig.order`, filtered by `sectionsConfig.hidden`, both of
  // which come from Admin > Storefront > Homepage CMS > Section order.
  // The `deals.length > 0` etc. guards are preserved unchanged — a
  // section with no matching data still won't render even if enabled.
  const SECTION_RENDERERS: Record<SectionKey, () => React.ReactNode> = {
    brand_strip: () => (
      <Reveal key="brand_strip">
        <BrandStrip brands={shopBrands} />
      </Reveal>
    ),
    // Brand storytelling. All copy, the artwork, its motion style and the
    // proof stats come from the `homepage-story` content page, so this is
    // fully rewritable from Admin > Homepage CMS. Returns null internally
    // when disabled there, so hiding it needs no separate section toggle.
    brand_story: () => <BrandStory key="brand_story" config={storyConfig} />,
    // One flagship product on a big dark stage, with floating chips parsed
    // from its real specifications. The product is admin-picked in
    // Homepage CMS (blank = automatic: first featured item).
    product_spotlight: () =>
      spotlightProduct ? (
        <ProductSpotlight
          key="product_spotlight"
          eyebrow={homeConfig.spotlightEyebrow}
          product={spotlightProduct as any}
          accessories={spotlightAccessories as any}
        />
      ) : null,
    // Deal of the day — rotates deterministically at midnight IST over the
    // live discounted list; renders nothing when no genuine deals exist.
    daily_drop: () =>
      dailyDropProduct ? (
        <DailyDrop
          key="daily_drop"
          eyebrow={homeConfig.dailyDropEyebrow}
          title={homeConfig.dailyDropTitle}
          product={dailyDropProduct as any}
        />
      ) : null,
    // Asymmetric deal mosaic — needs at least 3 real discounts to render
    // (the component itself enforces this too).
    bento_deals: () => <BentoDeals key="bento_deals" deals={deals as any} />,
    // Lifestyle deep-links into the products filter system; tiles are
    // edited in Homepage CMS.
    use_cases: () => (
      <UseCaseTiles
        key="use_cases"
        eyebrow={homeConfig.useCasesEyebrow}
        title={homeConfig.useCasesTitle}
        tiles={homeConfig.useCases}
      />
    ),
    // Scroll-pinned cinematic chapters. Copy, image, link and every
    // chapter come from the `homepage-showcase` content page (Admin >
    // Homepage CMS); reduced-motion visitors get a static stacked layout.
    tech_showcase: () => <TechShowcase key="tech_showcase" config={showcaseConfig} />,
    // "Why shop with us" benefit cards — same content page, placed low by
    // default (after the product shelves) where it answers the "should I
    // trust these people" question a browsing visitor has just formed,
    // rather than repeating the trust strip that sits under the hero.
    why_us: () =>
      storyConfig.whyEnabled ? (
        <BenefitCards
          key="why_us"
          eyebrow={storyConfig.whyEyebrow}
          heading={storyConfig.whyHeading}
          subtitle={storyConfig.whySubtitle}
          items={storyConfig.benefits}
        />
      ) : null,
    // Cinematic "immersive break" — sits right after the brand strip so
    // it builds trust/emotion once the visitor already knows what's
    // sold, rather than being either the very first thing they see
    // (delays their first look at products) or the very last thing
    // before the footer (drains momentum right after the closing CTA).
    brand_video: () => (
      <section key="brand_video" className="relative w-full overflow-hidden flex items-center justify-center group bg-[#0b0d14]">
        {settings?.promoVideoUrl ? (
          <video
            key={settings.promoVideoUrl}
            src={settings.promoVideoUrl}
            autoPlay
            loop
            muted
            playsInline
            controls={false}
            // Full opacity on the video itself — darkening is handled by a
            // single graduated vignette below instead of stacking two
            // separate dimming layers, which was washing the footage out.
            className="h-[52vh] max-h-[460px] min-h-[300px] w-full object-cover sm:h-[58vh]"
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          /* Previously an abstract blue gradient with two blur blobs and
             nothing else — 460px of empty page whenever no promo video is
             set in admin, which is the default state. It now shows the
             actual shop interior, so the block carries real content out of
             the box, and it is shorter so it reads as a break in the page
             rather than a hole in it. */
          <div className="relative h-[38vh] max-h-[380px] min-h-[260px] w-full sm:h-[44vh]">
            <SafeImage
              src="/images/store-interior.jpg"
              alt="Inside a Smart Mobile Stores outlet in Bengaluru"
              className="h-full w-full"
            />
            <div className="absolute inset-0 bg-blue-950/25 mix-blend-multiply" />
          </div>
        )}

        {/* Graduated vignette: darkest at the very bottom (where the text
            sits) and lighter toward the top, so the footage stays visible
            up top but copy at the bottom always has enough contrast,
            regardless of what's playing in that region of the frame. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />

        {/* Text sits anchored toward the bottom third, in its own reading
            column, instead of stacked dead-center where it has to fight
            whatever is busiest in the middle of the frame. */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 sm:pb-10 pointer-events-none px-4">
          <p className="text-blue-300 text-[11px] sm:text-xs font-black uppercase tracking-[0.3em] mb-2">
            {settings?.brandName || "Smart Mobile Stores"}
          </p>
          <h2 className="text-white text-2xl sm:text-4xl md:text-5xl font-black drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] text-center tracking-tight max-w-4xl leading-[1.05]">
            {settings?.promoVideoHeading || "Bengaluru's Most Trusted Mobile Store"}
          </h2>
          <p className="mt-3 text-white/90 text-sm sm:text-lg font-semibold text-center max-w-xl drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            {settings?.promoVideoSubtext || settings?.tagline || "Real Prices. Real Savings. Every Day."}
          </p>
        </div>

        {/* Soft fade into the section below so the hero doesn't cut off
            abruptly — reads as one intentional flow instead of stacked
            blocks with hard edges. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
      </section>
    ),
    flash_sale: () =>
      deals.length > 0 && (
        <Reveal key="flash_sale">
          <FlashSaleStrip dealCount={deals.length} />
        </Reveal>
      ),
    deal_shelf: () =>
      deals.length > 0 && (
        <Reveal key="deal_shelf">
          <DealShelf products={deals as CardProduct[]} />
        </Reveal>
      ),
    // Admin-driven merchandising banner — split hero, product/category/
    // brand spotlight, mixed grid, or video, whichever bannerType(s) an
    // admin has assigned to slot "merchandising_1". BannerSlot picks the
    // renderer per banner and wraps each in its own Reveal, so no outer
    // Reveal here (would double-wrap). Renders nothing until an admin
    // adds a banner to this slot.
    merchandising_1: () =>
      merch1.length > 0 && (
        <div key="merchandising_1">
          <BannerSlot banners={merch1} />
        </div>
      ),
    best_sellers: () => (
      <Reveal key="best_sellers">
        <BestSellerShelf title="Best Selling Phones" products={mobiles as CardProduct[]} />
      </Reveal>
    ),
    strip_1: () => (
      <Reveal key="strip_1">
        <PromoBannerStrip banners={stripFor(1)} fallbackSeed={1} />
      </Reveal>
    ),
    shop_by_budget: () => (
      <Reveal key="shop_by_budget">
        <ShopByBudget eyebrow={homeConfig.budgetsEyebrow} title={homeConfig.budgetsTitle} budgets={homeConfig.budgets} />
      </Reveal>
    ),
    scratch_coupons: () =>
      activeCoupons.length > 0 && (
        <Reveal key="scratch_coupons">
          <ScratchCoupon coupons={activeCoupons as any} />
        </Reveal>
      ),
    // The in-store solutions block: finance/EMI, DTH & broadband, express
    // repair, SIM activation. Previously four flat grey boxes with an
    // emoji each — the four most distinctive things the shop does,
    // rendered as the least distinctive block on the page. Each card is
    // now a photograph of the actual work with its own colour, resolved
    // from the card's existing themeColor and wording, so the section is
    // still driven entirely by Admin > Promo Cards. Card content stays
    // admin-editable; only the presentation moved into code.
    service_cta: () => (
      <Reveal key="service_cta">
        <ServiceSolutions
          badge={homeConfig.serviceBadge}
          title={homeConfig.serviceTitle}
          description={homeConfig.serviceDescription}
          buttonLabel={homeConfig.serviceButtonLabel}
          cards={cardsToDisplay as any}
        />
      </Reveal>
    ),
    laptop_gear: () =>
      lapGear.length > 0 && (
        <Reveal key="laptop_gear">
          <ScrollShelf title="Laptop Accessories & Gear" subtitle="Chargers, stands, SSDs, sleeves - priced at MOP." products={lapGear as CardProduct[]} tone="light" accent="blue" />
        </Reveal>
      ),
    // Second merchandising slot — same mechanism as merchandising_1, an
    // independent admin-configurable spot so the layout after laptop
    // gear doesn't repeat whatever appeared earlier on the page.
    merchandising_2: () =>
      merch2.length > 0 && (
        <div key="merchandising_2">
          <BannerSlot banners={merch2} />
        </div>
      ),
    featured: () =>
      featured.length > 0 && (
        <Reveal key="featured">
          <ScrollShelf title="Featured & Trending" subtitle="What everyone in Bengaluru is buying this week." products={featured as CardProduct[]} tone="light" accent="emerald" />
        </Reveal>
      ),
    strip_3: () =>
      featured.length > 0 && (
        <Reveal key="strip_3">
          <PromoBannerStrip banners={stripFor(3)} fallbackSeed={3} />
        </Reveal>
      ),
    accessories: () =>
      accessories.length > 0 && (
        <Reveal key="accessories">
          <ScrollShelf title="Mobile Accessories" subtitle="Audio, cases, chargers, cables - genuine, guaranteed." products={accessories as CardProduct[]} tone="light" accent="blue" />
        </Reveal>
      ),
    // Third merchandising slot — closes out the shelves before the
    // repair/store/CTA blocks with another admin-configurable layout
    // instead of a fourth or fifth identical 3-column strip.
    merchandising_3: () =>
      merch3.length > 0 && (
        <div key="merchandising_3">
          <BannerSlot banners={merch3} />
        </div>
      ),
    // Photo-led "Popular Repaired Services" rail. Sits directly above the
    // repair CTA so the visual proof (real repair photos) lands before the
    // pitch. Renders nothing if no service has an image yet.
    repair_showcase: () => (
      <RepairServicesShowcase
        key="repair_showcase"
        services={services as any}
        eyebrow={homeConfig.repairShowcaseEyebrow}
        title={homeConfig.repairShowcaseTitle}
        subtitle={homeConfig.repairShowcaseSubtitle}
        buttonLabel={homeConfig.repairShowcaseButtonLabel}
      />
    ),
    repair_cta: () => (
      <Reveal key="repair_cta">
        <section className="shell band-tight">
          {/* The right half of this block used to reference
              /images/cat-mobile-service.jpg, which was never present in
              public/images — so SafeImage fell back to a grey gradient that
              the dark scrim then hid completely, leaving half the panel
              visibly empty. A real repair-bench photograph now ships with
              the project, and the scrim is graduated so the image is
              actually legible instead of being crushed to black. */}
          <div className="surface-ink relative overflow-hidden">
            <div className="absolute inset-y-0 right-0 hidden w-[52%] md:block">
              <SafeImage src="/images/cat-mobile-service.jpg" alt="Technician repairing a smartphone at the SMS Stores service bench" className="h-full w-full" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0b1120] via-[#0b1120]/70 to-[#0b1120]/10" />
            </div>
            <div className="dot-grid pointer-events-none absolute inset-0 md:hidden" />
            <div className="relative p-6 sm:p-9 md:max-w-[58%] md:p-11">
              <Eyebrow tone="dark">{homeConfig.repairEyebrow}</Eyebrow>
              <h2 className="font-display mt-2 text-[26px] font-extrabold leading-[1.1] tracking-[-0.025em] [text-wrap:balance] sm:text-[34px]">
                {homeConfig.repairTitle} <span className="text-emerald-400">{homeConfig.repairAccent}</span>
              </h2>
              <p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-slate-300">{homeConfig.repairDescription}</p>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {services.slice(0, 6).map((s) => (
                  <Link key={s.id} href="/services" className="group rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.12] hover:ring-blue-400/50">
                    <p className="clamp-1 text-[13px] font-bold">{s.name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-emerald-300">{s.startPrice}</p>
                  </Link>
                ))}
              </div>
              <Link href="/services" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-bold text-slate-900 shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:text-white hover:shadow-blue-700/30">
                {homeConfig.repairButtonLabel} <span className="nudge-x">→</span>
              </Link>
            </div>
          </div>
        </section>
      </Reveal>
    ),
    // The two sections below extend the repair pitch above into the two
    // things that actually stop someone booking: not knowing what happens
    // after they submit the form, and unanswered doubts about payment and
    // warranty. Both are admin-reorderable and hideable like every other
    // section here.
    service_process: () => (
      <Reveal key="service_process">
        <ServiceProcess
          eyebrow={homeConfig.processEyebrow}
          title={homeConfig.processTitle}
          subtitle={homeConfig.processSubtitle}
          steps={homeConfig.processSteps}
          footnote={homeConfig.processFootnote}
          buttonLabel={homeConfig.serviceStripButtonLabel}
        />
      </Reveal>
    ),
    service_faq: () => (
      <Reveal key="service_faq">
        <ServiceFaq
          eyebrow={homeConfig.serviceFaqEyebrow}
          title={homeConfig.serviceFaqTitle}
          items={homeConfig.serviceFaqItems}
          helpTitle={homeConfig.serviceFaqHelpTitle}
          helpBody={homeConfig.serviceFaqHelpBody}
          outlets={outlets as any}
          services={services as any}
        />
      </Reveal>
    ),
    store_visit: () => (
      <Reveal key="store_visit">
        {/* The "come and see us" section is the emotional close of the page,
            so it gets its own soft, warm surface rather than sitting on the
            same flat page grey as the shelves above it. The blueprint grid
            and drifting blooms are aria-hidden decoration only. */}
        <section className="relative overflow-hidden">
          <span aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-70 dark:hidden" />
          <span aria-hidden className="aurora opacity-70 dark:opacity-40">
            <span className="-left-10 top-0 h-80 w-80 bg-blue-300/25" />
            <span className="right-[6%] bottom-0 h-72 w-72 bg-amber-300/20" />
          </span>
          <span aria-hidden className="edge-fade-t pointer-events-none absolute inset-x-0 top-0 dark:hidden" />
          <span aria-hidden className="edge-fade-b pointer-events-none absolute inset-x-0 bottom-0 dark:hidden" />

          <div className="relative shell band-tight">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <Eyebrow>{homeConfig.storeEyebrow}</Eyebrow>
              <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{homeConfig.storeTitle}</h2>
              {/* A short coloured rule under the heading, the same device
                  used by SectionHead elsewhere, so this hand-rolled
                  heading matches the rest of the page. */}
              <span aria-hidden className="mt-3 block h-[3px] w-14 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500" />
            </div>
            <Link href="/contact" className="hidden min-h-[24px] items-center text-sm font-bold text-blue-700 hover:underline sm:inline-flex">Both outlets →</Link>
          </div>
          <div className="stagger-in grid grid-cols-1 gap-4 md:grid-cols-2">
            {outlets.map((o, i) => (
              <div key={o.id} className="card-hover grad-ring group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-xl hover:shadow-blue-900/[0.07] dark:border-slate-800 dark:bg-slate-900">
                <div className="relative overflow-hidden">
                  <div className="img-frame !aspect-[16/9]"><SafeImage src={o.photo} alt={o.name} className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-110" /></div>
                  {/* Soft wash up from the base of the photo so the white
                      pill and the card body below meet the image without a
                      hard horizontal seam. */}
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
                  <div className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-black text-white shadow-lg ${o.isMain ? "bg-blue-700 shadow-blue-900/30" : "bg-indigo-600 shadow-indigo-900/30"}`}>
                    {o.isMain ? "Main Outlet" : "Store Location"}
                  </div>
                  {/* Open-all-week reassurance, on the photo where it is
                      seen before the address block is read. The hours come
                      from the outlets table, not written copy. */}
                  <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-black text-slate-800 shadow-lg backdrop-blur-sm">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${i % 2 === 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {o.hoursOpen}–{o.hoursClose} · All 7 days
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-lg font-black tracking-tight">{o.name}</p>
                  <p className="mt-1 clamp-2 text-sm text-slate-500">{o.addressLine}</p>
                  {/* Hours moved onto the photo pill above, so repeating
                      them here would say the same thing twice in one card.
                      This line is now just the phone number, and it is a
                      tel: link — most visitors are on a phone and were
                      previously shown a number they could not tap. */}
                  <a href={`tel:${o.contact}`} className="mt-2 inline-flex min-h-[24px] items-center gap-1.5 text-sm font-bold text-blue-700 hover:underline dark:text-blue-400">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {o.contact}
                  </a>
                  <div className="mt-3 flex gap-2">
                    {o.mapsUrl && <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-blue-700 dark:bg-white dark:text-slate-900">Get directions</a>}
                    <a href={`tel:${o.contact}`} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-200">Call store</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>
        </section>
      </Reveal>
    ),
    bottom_banner: () => (
      <Reveal key="bottom_banner">
        <section className="shell band-tight">
          <div className="relative grid place-items-center overflow-hidden rounded-3xl bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-700 p-9 text-center text-white shadow-2xl shadow-indigo-900/20 sm:p-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)] [background-size:26px_26px] pointer-events-none" />
            {/* Concentric rings behind the copy plus two drifting blooms.
                A flat blue rectangle was the last thing a visitor saw on
                the page; this gives the closing banner some depth and
                slow movement without touching the text contrast. */}
            <span aria-hidden className="rings-ink pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-60" />
            <span aria-hidden className="aurora opacity-60">
              <span className="-left-16 -top-16 h-72 w-72 bg-sky-400/25" />
              <span className="right-[10%] bottom-[-20%] h-64 w-64 bg-violet-400/25" />
            </span>
            <div className="relative z-10">
              <p className="font-display text-2xl font-black tracking-tight sm:text-4xl">Ready to find your next phone?</p>
              <p className="mt-2 text-white/80">{settings?.tagline || "Real Prices. Real Savings. Every Day."}</p>
              <span aria-hidden className="mx-auto mt-5 block h-[3px] w-16 rounded-full bg-white/35" />
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/products" className="shine-on-hover rounded-full bg-white px-7 py-3 text-sm font-black text-blue-700 shadow-lg transition hover:-translate-y-0.5 hover:scale-105">Start shopping</Link>
                <Link href="/services" className="rounded-full border border-white/50 px-7 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white/10">Book a repair</Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    ),
  };

  // Alternating surface bands.
  //
  // The page background is slate-50 and product cards are white, so a long
  // run of shelves reads as one uninterrupted column — the specific thing
  // that made scrolling feel repetitive. Giving a curated subset a white
  // band breaks that run into chapters without touching text colour, so
  // there is no contrast or legibility risk on either theme.
  //
  // Curated rather than every-other-index on purpose: alternating blindly
  // would eventually put a band behind a section that already brings its own
  // surface (brand_story, why_us, the service blocks), producing a panel
  // inside a panel. These four are the plain shelves spread across the
  // scroll, so the cadence lands roughly every third section.
  const BANDED_SECTIONS = new Set<SectionKey>(["best_sellers", "featured", "laptop_gear", "store_visit"]);

  const orderedSections = sectionsConfig.order
    .filter((key) => !isHidden(key))
    .map((key) => {
      const node = SECTION_RENDERERS[key]();
      return BANDED_SECTIONS.has(key) ? (
        <div key={`band-${key}`} className="home-band">
          {node}
        </div>
      ) : (
        node
      );
    });

  return (
    <AppShell>
      {/* The homepage's document heading.

          Every visible section on this page opens at h2, and the only h1 in
          the tree used to live inside the cinematic hero — a section that
          renders nothing until an admin uploads a video. With that slot
          empty (the default) the homepage shipped with no h1 at all, which
          costs us the strongest on-page signal we have and leaves screen
          reader users without a document title to land on.

          It is deliberately not the carousel headline: that text changes
          every few seconds as slides advance, and an h1 that rewrites
          itself is worse than no h1 for both crawlers and assistive tech.
          This is the one thing on the page that is always true, drawn from
          Admin > Settings rather than hard-coded, and visually hidden
          because the design's opening beat is the hero artwork, not a line
          of text. */}
      <h1 className="sr-only">
        {settings?.brandName || "SMS Stores"} — {settings?.tagline || "Real Prices. Real Savings. Every Day."}
      </h1>

      {/* 1. OFFERS HERO — the storefront's opening beat.

          This used to sit fourth, below the repairs strip and the category
          circles, which meant the first thing a visitor saw was a dark
          services band and the shop's actual merchandise started roughly a
          screen and a half down. The servicing-first argument below is a
          real one, but it was being made at the cost of ever showing that
          this is a phone shop — the hero is where price, offer and product
          land together, and it is the only section that answers "what is
          this site" in one glance.

          It is also full-bleed and tall now rather than a rounded card
          inside the content column. At 3.6:1 in a max-width shell it read
          as an advertising bar wedged above the page; edge-to-edge at
          roughly two-thirds of the viewport it reads as the front of a
          store. The seeded hero artwork is 2000x836 (about 2.4:1), so the
          new proportions crop it less than the old card did, not more.

          Slides, copy, badges, CTA labels, per-slide transitions and
          autoplay timing all still come from Admin > Promo Banners. */}
      <HeroCarousel
        banners={banners as any}
        fallbackTitle={settings?.tagline || "Real Prices. Real Savings. Every Day."}
        fallbackSubtitle={settings?.taglineAlt || undefined}
      />

      {/* 2. REPAIRS & SERVICING — the differentiator, immediately under
          the hero.

          Servicing is the differentiator: most competing storefronts sell
          phones but do not repair them, and a customer with a cracked
          screen has a far more urgent need than a browser. On a dark band
          directly beneath the hero it is still the first thing after the
          fold and cannot be scrolled past, while no longer displacing the
          products as the page's opening statement.

          Tiles come from the live `services` table (already fetched above
          for the mid-page CTA), so Admin > Services drives this strip with
          no code change. Surrounding copy is Homepage CMS. */}
      <ServiceStrip
        services={services as any}
        eyebrow={homeConfig.serviceStripEyebrow}
        title={homeConfig.serviceStripTitle}
        subtitle={homeConfig.serviceStripSubtitle}
        buttonLabel={homeConfig.serviceStripButtonLabel}
        highlights={homeConfig.serviceStripHighlights}
      />

      {/* 3. CINEMATIC HERO — opt-in, admin-driven (Promo Banners >
          "Cinematic hero (video)" slot). Renders nothing at all while
          that slot is empty, so the storefront's opening beat is
          unchanged until a shopkeeper actually uploads a video or a
          full-bleed still. Placed above the offers carousel so the
          atmospheric moment leads and the converting offers follow. */}
      <CinematicHero slides={heroVideoBanners as any} />

      {/* 4. CATEGORIES — what we sell, for a visitor who came to buy
          rather than repair and wants to self-select a department. */}
      <CategoryCircleStrip categories={cats as any} />

      {/* 5. WELCOME STRIP — a short, one-line brand introduction. The logo
          already appears in the header seconds earlier, and the four
          "quick highlight" pills said the exact same things the Trust
          Badges section repeats immediately below (delivery, warranty,
          repairs, pricing) — so this is now a single text line instead
          of a second logo + a second round of trust claims. */}
      <Reveal>
        <section className="w-full border-b border-slate-100 bg-white">
          <div className="shell band-tight">
            <p className="text-sm text-slate-600 sm:text-base">
              <span className="font-black text-slate-900">
                {fillHomeCopy(homeConfig.welcomeTitle, { brand: settings?.brandName || "SMS Stores" })}
              </span>
              <span className="text-slate-400"> · </span>
              {welcomeDescription}
            </p>
          </div>
        </section>
      </Reveal>

      {/* 6. TRUST BADGES — the single place trust/delivery/repair claims
          are made on the page (the header marquee still carries live
          offers separately). */}
      <Reveal>
        <TrustBadges items={homeConfig.trustBadges} />
      </Reveal>

      {/* 7. DEALS / BEST SELLERS / SHELVES / BRAND VIDEO — admin-ordered
          sections. brand_video is one of these now, positioned by
          default right after brand_strip instead of being pinned to the
          very end of the page. */}
      {orderedSections}
    </AppShell>
  );
}