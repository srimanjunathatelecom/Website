// Config for the scroll-driven "tech showcase" homepage section — the
// sticky, cinematic product spotlight where copy chapters swap while the
// device art stays pinned.
//
// Same storage pattern as homepageConfig.ts / homepageStory.ts: one row in
// the existing `content_pages` table, edited through Admin > Storefront >
// Homepage CMS via the /api/content endpoint. No new table, no migration.
//
// Every visible string, the device image, the link and each chapter comes
// from this config — nothing customer-facing is hardcoded in the component.

export const HOME_SHOWCASE_SLUG = "homepage-showcase";

export type ShowcaseChapter = {
  /** Small uppercase kicker above the chapter headline. */
  kicker: string;
  title: string;
  body: string;
  /** Optional big stat shown beside the chapter (e.g. "30 min"). */
  stat: string;
  statLabel: string;
};

export type HomeShowcaseConfig = {
  eyebrow: string;
  title: string;
  subtitle: string;
  /**
   * Device artwork URL. Empty string = use the built-in premium phone
   * render, so the section never shows a broken image on a fresh install.
   */
  image: string;
  imageAlt: string;
  link: string;
  ctaLabel: string;
  chapters: ShowcaseChapter[];
};

// Defaults reuse promises this storefront already makes elsewhere on the
// homepage (MOP pricing, 30-minute Bengaluru delivery, same-day repairs) —
// no new business claims are invented here.
export const DEFAULT_HOME_SHOWCASE: HomeShowcaseConfig = {
  eyebrow: "The SMS Stores difference",
  title: "Built around your next phone",
  subtitle: "Scroll to see why Bengaluru upgrades with us.",
  image: "",
  imageAlt: "Premium smartphone",
  link: "/products?category=mobiles",
  ctaLabel: "Browse phones",
  chapters: [
    {
      kicker: "Honest pricing",
      title: "MOP, not MRP",
      body: "Every phone is priced at the real market operating price — the number shops actually sell at, not the sticker used to fake a discount.",
      stat: "0",
      statLabel: "inflated price tags",
    },
    {
      kicker: "Fast delivery",
      title: "At your door in 30 minutes",
      body: "Order online and a rider from your nearest outlet brings it over — set up, sealed and billed.",
      stat: "30 min",
      statLabel: "delivery in Bengaluru",
    },
    {
      kicker: "After you buy",
      title: "Same-day expert repairs",
      body: "Screens, batteries, back glass — our in-store technicians fix what you own, usually before dinner.",
      stat: "Same day",
      statLabel: "screen & battery service",
    },
  ],
};

export function parseHomeShowcaseConfig(body?: string | null): HomeShowcaseConfig {
  let raw: any = {};
  if (body) {
    try {
      raw = JSON.parse(body);
    } catch {
      raw = {};
    }
  }
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const d = DEFAULT_HOME_SHOWCASE;
  const chaptersRaw = Array.isArray(raw.chapters) ? raw.chapters : d.chapters;
  const chapters: ShowcaseChapter[] = chaptersRaw
    .map((c: any) => ({
      kicker: str(c?.kicker, ""),
      title: str(c?.title, ""),
      body: str(c?.body, ""),
      stat: str(c?.stat, ""),
      statLabel: str(c?.statLabel, ""),
    }))
    // A chapter with no headline is treated as deleted.
    .filter((c: ShowcaseChapter) => c.title.trim().length > 0)
    .slice(0, 5);
  return {
    eyebrow: str(raw.eyebrow, d.eyebrow),
    title: str(raw.title, d.title),
    subtitle: str(raw.subtitle, d.subtitle),
    image: str(raw.image, d.image),
    imageAlt: str(raw.imageAlt, d.imageAlt),
    link: str(raw.link, d.link),
    ctaLabel: str(raw.ctaLabel, d.ctaLabel),
    chapters: chapters.length ? chapters : d.chapters,
  };
}
