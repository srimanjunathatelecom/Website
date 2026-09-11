// Visual storytelling content for the homepage: the animated brand/
// character block and the "why shop with us" benefit cards.
//
// Stored in the existing `content_pages` table under a single slug (same
// pattern as homepageConfig.ts / siteConfig.ts), so no new table and no
// migration is needed, and Admin > Storefront > Homepage CMS can edit it
// through the /api/content endpoint that already exists.
//
// Nothing here is hardcoded in a React component: every heading, body,
// image, icon, card and CTA on both sections comes through this config.

export const HOME_STORY_SLUG = "homepage-story";

/** Icon keys available to benefit cards. Mapped to lucide icons in BenefitCards.tsx. */
export const BENEFIT_ICON_KEYS = [
  "truck",
  "shield",
  "wrench",
  "rupee",
  "headset",
  "store",
  "sparkles",
  "card",
  "clock",
  "award",
  "map-pin",
  "package",
] as const;

export type BenefitIconKey = (typeof BENEFIT_ICON_KEYS)[number];

export type StoryStat = {
  value: string;
  label: string;
};

export type BenefitCardConfig = {
  iconKey: BenefitIconKey;
  /** Optional artwork. When set it replaces the icon on the card. */
  image: string;
  title: string;
  description: string;
  href: string;
  enabled: boolean;
};

export type HomeStoryConfig = {
  // ---- Animated brand / character block ----
  storyEnabled: boolean;
  storyEyebrow: string;
  storyHeading: string;
  storyBody: string;
  storyCtaLabel: string;
  storyCtaHref: string;
  /** Character/mascot or hero artwork. Empty = the block renders text-only. */
  characterImage: string;
  characterAlt: string;
  /** How the artwork moves: float (gentle bob) | drift (slow sway) | none. */
  characterAnimation: "float" | "drift" | "none";
  storyStats: StoryStat[];

  // ---- "Why shop with us" benefit cards ----
  whyEnabled: boolean;
  whyEyebrow: string;
  whyHeading: string;
  whySubtitle: string;
  benefits: BenefitCardConfig[];
};

export const DEFAULT_HOME_STORY: HomeStoryConfig = {
  storyEnabled: true,
  storyEyebrow: "Our Promise",
  storyHeading: "A real shop, run by real people.",
  storyBody:
    "We are not a warehouse with a website. Two outlets in Bengaluru, technicians who repair boards by hand, and prices quoted at MOP instead of MRP — so what you pay is what the phone is actually worth.",
  storyCtaLabel: "About SMS Stores",
  storyCtaHref: "/about",
  characterImage: "/images/store-interior.jpg",
  characterAlt: "Inside a Smart Mobile Stores outlet in Bengaluru",
  characterAnimation: "float",
  storyStats: [
    { value: "2", label: "Bengaluru outlets" },
    { value: "30 min", label: "City delivery" },
    { value: "30 day", label: "Repair warranty" },
    { value: "MOP", label: "Not MRP" },
  ],

  whyEnabled: true,
  whyEyebrow: "Why Shop With Us",
  whyHeading: "Six reasons people come back",
  whySubtitle: "Everything below is something we already do every day at both outlets — no fine print.",
  benefits: [
    {
      iconKey: "truck",
      image: "",
      title: "30-minute delivery",
      description: "Order before closing and we hand-deliver across Bengaluru the same day.",
      href: "/products",
      enabled: true,
    },
    {
      iconKey: "rupee",
      image: "",
      title: "We sell at MOP",
      description: "Market Operating Price on everything, so you never pay the printed MRP.",
      href: "/products",
      enabled: true,
    },
    {
      iconKey: "wrench",
      image: "",
      title: "In-house board repair",
      description: "Component-level motherboard work done on our own bench, not shipped out.",
      href: "/services",
      enabled: true,
    },
    {
      iconKey: "shield",
      image: "",
      title: "Genuine & warrantied",
      description: "Authorised stock only, with a 30-day warranty on every repair we carry out.",
      href: "/policy/warranty-policy",
      enabled: true,
    },
    {
      iconKey: "card",
      image: "",
      title: "Easy EMI & finance",
      description: "Debit and credit card EMIs, plus Bajaj Finserv and DMI Finance in store.",
      href: "/contact",
      enabled: true,
    },
    {
      iconKey: "store",
      image: "",
      title: "Walk in and talk",
      description: "Two outlets, open all seven days — bring the device and ask us directly.",
      href: "/contact",
      enabled: true,
    },
  ],
};

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Same as cleanString but allows an intentional empty value (images, optional CTAs). */
function optionalString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function cleanBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanStats(value: unknown): StoryStat[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_STORY.storyStats;
  const out = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<StoryStat>;
      const statValue = cleanString(raw.value, "");
      const label = cleanString(raw.label, "");
      // Half a stat renders as a floating number with no meaning, so
      // both halves are required rather than defaulted.
      if (!statValue || !label) return null;
      return { value: statValue, label };
    })
    .filter((x): x is StoryStat => x !== null)
    .slice(0, 4);
  // An admin who deliberately clears every stat gets a clean text block,
  // not the defaults forced back in.
  return out;
}

function cleanBenefits(value: unknown): BenefitCardConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_STORY.benefits;
  const out = value
    .map((item, index) => {
      const fallback = DEFAULT_HOME_STORY.benefits[index] || DEFAULT_HOME_STORY.benefits[0];
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<BenefitCardConfig>;
      const title = cleanString(raw.title, "");
      if (!title) return null; // a card with no title is an empty slot
      const iconKey = (BENEFIT_ICON_KEYS as readonly string[]).includes(String(raw.iconKey || ""))
        ? (raw.iconKey as BenefitIconKey)
        : fallback.iconKey;
      return {
        iconKey,
        image: optionalString(raw.image, ""),
        title,
        description: cleanString(raw.description, ""),
        href: optionalString(raw.href, ""),
        enabled: cleanBool(raw.enabled, true),
      };
    })
    .filter((x): x is BenefitCardConfig => x !== null)
    .slice(0, 8);
  return out;
}

export function parseHomeStoryConfig(body?: string | null): HomeStoryConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }

  return {
    storyEnabled: cleanBool(raw.storyEnabled, DEFAULT_HOME_STORY.storyEnabled),
    storyEyebrow: cleanString(raw.storyEyebrow, DEFAULT_HOME_STORY.storyEyebrow),
    storyHeading: cleanString(raw.storyHeading, DEFAULT_HOME_STORY.storyHeading),
    storyBody: cleanString(raw.storyBody, DEFAULT_HOME_STORY.storyBody),
    storyCtaLabel: optionalString(raw.storyCtaLabel, DEFAULT_HOME_STORY.storyCtaLabel),
    storyCtaHref: optionalString(raw.storyCtaHref, DEFAULT_HOME_STORY.storyCtaHref),
    characterImage: optionalString(raw.characterImage, DEFAULT_HOME_STORY.characterImage),
    characterAlt: cleanString(raw.characterAlt, DEFAULT_HOME_STORY.characterAlt),
    characterAnimation: ["float", "drift", "none"].includes(String(raw.characterAnimation))
      ? (raw.characterAnimation as HomeStoryConfig["characterAnimation"])
      : DEFAULT_HOME_STORY.characterAnimation,
    storyStats: cleanStats(raw.storyStats),

    whyEnabled: cleanBool(raw.whyEnabled, DEFAULT_HOME_STORY.whyEnabled),
    whyEyebrow: cleanString(raw.whyEyebrow, DEFAULT_HOME_STORY.whyEyebrow),
    whyHeading: cleanString(raw.whyHeading, DEFAULT_HOME_STORY.whyHeading),
    whySubtitle: optionalString(raw.whySubtitle, DEFAULT_HOME_STORY.whySubtitle),
    benefits: cleanBenefits(raw.benefits),
  };
}
