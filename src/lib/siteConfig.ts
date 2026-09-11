// Site-wide structural content: main navigation and footer link lists.
// Stored in the existing `content_pages` table (same pattern as
// homepageConfig.ts) so no new table/migration is needed. Admin edits
// these from Admin > Storefront > Navigation & Footer.

export const NAV_CONFIG_SLUG = "site-navigation";
export const FOOTER_CONFIG_SLUG = "site-footer";
export const SEO_CONFIG_SLUG = "site-seo";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // emoji, matches existing NAV style in Header.tsx
};

export type NavConfig = {
  items: NavItem[];
};

export const DEFAULT_NAV_CONFIG: NavConfig = {
  items: [
    { label: "All Products", icon: "📦", href: "/products" },
    { label: "Mobile Phones", icon: "📱", href: "/products?category=mobiles" },
    { label: "Mobile Service", icon: "🛠️", href: "/products?category=mobile-service" },
    { label: "Accessories", icon: "🎧", href: "/products?category=mobile-accessories" },
    { label: "Laptop Service", icon: "💻", href: "/products?category=laptop-service" },
    { label: "Laptop Gear", icon: "🔌", href: "/products?category=laptop-accessories" },
    // Same reasoning as the footer link: "Book a Repair" now opens the device-first
    // flow. A default only, so an owner who has edited their nav in Admin is
    // unaffected, and /services keeps working for anyone who lands there.
    { label: "Book a Repair", icon: "🔧", href: "/repair" },
    { label: "Track Order", icon: "📍", href: "/track" },
  ],
};

export type FooterLink = {
  label: string;
  href: string;
};

export type SocialLink = {
  platform: string; // e.g. "Instagram", "Facebook", "YouTube", "X"
  url: string;
};

export type FooterConfig = {
  shopHeading: string;
  shopLinks: FooterLink[];
  companyHeading: string;
  companyLinks: FooterLink[];
  storesHeading: string;
  newsletterLabel: string;
  socialLinks: SocialLink[];
  copyrightText: string;
};

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  shopHeading: "Shop",
  shopLinks: [
    // Points at the device-first flow, which is what someone clicking "Book a
    // Repair" is actually trying to do. /services still exists and still takes
    // bookings; this is a default, so an owner who has edited their footer links
    // in Admin keeps whatever they chose.
    { label: "Book a Repair", href: "/repair" },
    { label: "Track Order", href: "/track" },
  ],
  companyHeading: "Company",
  companyLinks: [
    { label: "About Us", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Help / FAQ", href: "/faq" },
    { label: "Terms & Conditions", href: "/policy/terms-and-conditions" },
    { label: "Privacy Policy", href: "/policy/privacy-policy" },
    { label: "Warranty & Replacement Policy", href: "/policy/warranty-policy" },
    { label: "Shipping Policy", href: "/policy/shipping-policy" },
  ],
  storesHeading: "Visit Our Stores",
  newsletterLabel: "Get offers & updates",
  socialLinks: [],
  copyrightText: "All rights reserved.",
};

// ---------- Homepage section order & visibility ----------
// These are the "content module" sections that come after the fixed
// header block (video hero, category strip, welcome strip, trust
// badges, hero carousel — those stay structural and aren't toggled,
// same as the original prompt's "don't over-engineer" guidance).
// Each key must match a case in the SECTION_RENDERERS map in page.tsx.
export const HOMEPAGE_SECTIONS_SLUG = "homepage-sections";

export type SectionKey =
  | "brand_strip"
  | "brand_story"
  | "product_spotlight"
  | "daily_drop"
  | "bento_deals"
  | "use_cases"
  | "why_us"
  | "tech_showcase"
  | "brand_video"
  | "flash_sale"
  | "deal_shelf"
  | "merchandising_1"
  | "best_sellers"
  | "strip_1"
  | "shop_by_budget"
  | "scratch_coupons"
  | "service_cta"
  | "laptop_gear"
  | "merchandising_2"
  | "featured"
  | "strip_3"
  | "accessories"
  | "merchandising_3"
  | "repair_showcase"
  | "repair_cta"
  | "service_process"
  | "service_faq"
  | "store_visit"
  | "bottom_banner";

export const SECTION_LABELS: Record<SectionKey, string> = {
  brand_strip: "Brand strip",
  brand_story: "Brand story block (artwork/character + promise + proof stats)",
  product_spotlight: "Product spotlight (one flagship product on a big stage — pick it in Homepage content)",
  daily_drop: "Deal of the day (auto-rotates every midnight from your real discounts)",
  bento_deals: "Deal zone mosaic (your 5 biggest genuine discounts, one large + four small)",
  use_cases: "Shop by use case tiles (Gaming / College / Work… — edit in Homepage content)",
  why_us: "Why shop with us (benefit/trust cards)",
  tech_showcase: "Scroll-driven tech showcase (pinned cinematic chapters)",
  brand_video: "Cinematic brand video/moment",
  flash_sale: "Flash sale countdown",
  deal_shelf: "Deal shelf",
  merchandising_1: "Merchandising banner (after deals — split hero, product/category/brand spotlight, mixed grid, video)",
  best_sellers: "Best selling phones",
  strip_1: "Promo banner strip (after best sellers)",
  shop_by_budget: "Shop by budget",
  scratch_coupons: "Scratch & win coupons",
  service_cta: "Finance/DTH/repair services CTA block",
  laptop_gear: "Laptop accessories shelf",
  merchandising_2: "Merchandising banner (after laptop gear — split hero, product/category/brand spotlight, mixed grid, video)",
  featured: "Featured & trending shelf",
  strip_3: "Promo banner strip (after featured)",
  accessories: "Mobile accessories shelf",
  merchandising_3: "Merchandising banner (after accessories — split hero, product/category/brand spotlight, mixed grid, video)",
  repair_showcase: "Popular repaired services (photo rail of your repair services)",
  repair_cta: "Repair services CTA block",
  service_process: "How a repair works (4-step booking journey)",
  service_faq: "Repair & service FAQ (+ talk-to-a-technician card)",
  store_visit: "Visit our stores block",
  bottom_banner: "Bottom closing CTA banner",
};

export type HomepageSectionsConfig = {
  order: SectionKey[];
  hidden: SectionKey[];
};

// Interleaved on purpose: the three identical "3-equal-column" promo
// strips that used to sit back-to-back (strip_0/strip_2/strip_4) are
// down to one (strip_1), and the two freed-up spots plus the old single
// merchandising cluster are now three separate merchandising slots
// (merchandising_1/2/3) spread across the scroll. Each one independently
// renders whatever admin assigns it via BannerSlot — split hero, a
// product/category/brand spotlight, a mixed large+small grid, or video —
// so no two banner sections in a row look the same shape.
//
// brand_video sits right after brand_strip on purpose: it's an
// "immersive break" that should build trust/emotion once the visitor
// already knows what's sold (categories/hero/brands seen above), not
// the very last thing before the footer — closing dead-last after the
// bottom_banner CTA meant the highest-energy convert-now moment landed
// right before a slow cinematic beat, which drained momentum instead
// of building it.
//
// service_process and service_faq sit immediately after repair_cta on
// purpose, so the bottom of the page reads as one continuous service
// argument: the pitch (repair_cta), then how it actually works
// (service_process), then the objections that stop someone booking
// (service_faq), then where to walk in (store_visit). Splitting them up
// would make a visitor re-derive the same context three times.
// New sections are interleaved so no two "deal" moments sit back to back:
// product_spotlight is the early hero-product stage right after the brand
// story; daily_drop lands mid-page after best_sellers as a change of pace;
// use_cases follows shop_by_budget (both are "help me choose" navigation);
// bento_deals gives the lower half of the page its own deal moment after
// featured, far from flash_sale/deal_shelf at the top.
export const ALL_SECTION_KEYS: SectionKey[] = [
  "brand_strip", "brand_story", "product_spotlight", "brand_video", "flash_sale", "deal_shelf", "tech_showcase", "merchandising_1", "best_sellers", "daily_drop", "strip_1",
  "shop_by_budget", "use_cases", "scratch_coupons", "service_cta", "laptop_gear", "merchandising_2", "featured", "bento_deals", "strip_3",
  "accessories", "merchandising_3", "why_us", "repair_showcase", "repair_cta", "service_process", "service_faq", "store_visit", "bottom_banner",
];

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionsConfig = {
  order: ALL_SECTION_KEYS,
  hidden: [],
};

export function parseHomepageSectionsConfig(body?: string | null): HomepageSectionsConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }
  const isKey = (v: unknown): v is SectionKey => typeof v === "string" && (ALL_SECTION_KEYS as string[]).includes(v);

  let order: SectionKey[] = Array.isArray(raw.order) ? raw.order.filter(isKey) : [];
  // Guarantee every known section is present exactly once, even if the
  // stored config predates a newly-added section key or dropped one.
  //
  // A missing key is inserted next to its intended neighbour rather than
  // appended to the end. Appending was fine when the stored order was
  // always the default, but once admin has reordered the page, a newly
  // shipped section would silently land dead-last above the footer —
  // e.g. "How a repair works" showing up after the closing CTA banner —
  // and look like a bug rather than a new feature. Anchoring to the
  // nearest preceding known section keeps admin's custom order intact
  // while still putting the new section where it was designed to go.
  const present = new Set(order);
  for (let i = 0; i < ALL_SECTION_KEYS.length; i++) {
    const key = ALL_SECTION_KEYS[i];
    if (present.has(key)) continue;
    let at = 0;
    for (let back = i - 1; back >= 0; back--) {
      const anchor = order.indexOf(ALL_SECTION_KEYS[back]);
      if (anchor !== -1) {
        at = anchor + 1;
        break;
      }
    }
    order.splice(at, 0, key);
    present.add(key);
  }
  order = order.filter((k: SectionKey, i: number) => order.indexOf(k) === i);

  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter(isKey) : [];

  return { order, hidden };
}

// ---------- Announcement bar ----------
// A single dismissible, dated strip — distinct from the header's
// always-on rolling marquee. Meant for things like festival sales,
// temporary notices, or "closed on X date" messages.
export const ANNOUNCEMENT_CONFIG_SLUG = "site-announcement";

export type AnnouncementConfig = {
  active: boolean;
  text: string;
  linkLabel: string;
  linkHref: string;
  startDate: string; // ISO date string, "" = no start restriction
  endDate: string; // ISO date string, "" = no end restriction
  backgroundColor: string; // tailwind gradient/bg class
  dismissible: boolean;
};

export const DEFAULT_ANNOUNCEMENT_CONFIG: AnnouncementConfig = {
  active: false,
  text: "",
  linkLabel: "",
  linkHref: "",
  startDate: "",
  endDate: "",
  backgroundColor: "bg-slate-900",
  dismissible: true,
};

export function parseAnnouncementConfig(body?: string | null): AnnouncementConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }
  return {
    active: typeof raw.active === "boolean" ? raw.active : DEFAULT_ANNOUNCEMENT_CONFIG.active,
    text: cleanString(raw.text, DEFAULT_ANNOUNCEMENT_CONFIG.text),
    linkLabel: cleanString(raw.linkLabel, DEFAULT_ANNOUNCEMENT_CONFIG.linkLabel),
    linkHref: cleanString(raw.linkHref, DEFAULT_ANNOUNCEMENT_CONFIG.linkHref),
    startDate: typeof raw.startDate === "string" ? raw.startDate : "",
    endDate: typeof raw.endDate === "string" ? raw.endDate : "",
    backgroundColor: cleanString(raw.backgroundColor, DEFAULT_ANNOUNCEMENT_CONFIG.backgroundColor),
    dismissible: typeof raw.dismissible === "boolean" ? raw.dismissible : DEFAULT_ANNOUNCEMENT_CONFIG.dismissible,
  };
}

// Whether an announcement should currently be shown, given its dates.
// Kept separate from parsing so both server (AppShell) and any future
// caller can reuse the exact same "is it live right now" logic.
export function isAnnouncementLive(cfg: AnnouncementConfig, now: Date = new Date()): boolean {
  if (!cfg.active || !cfg.text) return false;
  if (cfg.startDate) {
    const start = new Date(cfg.startDate);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (cfg.endDate) {
    const end = new Date(cfg.endDate);
    // End date is inclusive through the end of that day.
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (now > end) return false;
    }
  }
  return true;
}

export type SeoConfig = {
  siteTitle: string;
  titleTemplate: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  siteName: string;
};

export const DEFAULT_SEO_CONFIG: SeoConfig = {
  siteTitle: "SMS Stores — Genuine Products, Honest Pricing",
  titleTemplate: "%s | SMS Stores",
  metaDescription:
    "SMS Stores (Smart Mobile Stores) — mobiles, laptops, accessories & expert repair services in Bengaluru. We sell at MOP, not MRP. Real prices, real savings.",
  ogTitle: "SMS Stores — Genuine Products, Honest Pricing",
  ogDescription:
    "SMS Stores (Smart Mobile Stores) — mobiles, laptops, accessories & expert repair services in Bengaluru. We sell at MOP, not MRP. Real prices, real savings.",
  ogImage: "",
  siteName: "SMS Stores",
};

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNavItems(value: unknown, fallback: NavItem[]): NavItem[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const out = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<NavItem>;
      const href = cleanString(raw.href, "");
      const label = cleanString(raw.label, "");
      if (!href || !label) return null;
      return {
        label,
        href,
        icon: cleanString(raw.icon, "🔗"),
      };
    })
    .filter((x): x is NavItem => x !== null);
  return out.length > 0 ? out : fallback;
}

function cleanFooterLinks(value: unknown, fallback: FooterLink[]): FooterLink[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<FooterLink>;
      const href = cleanString(raw.href, "");
      const label = cleanString(raw.label, "");
      if (!href || !label) return null;
      return { label, href };
    })
    .filter((x): x is FooterLink => x !== null);
  return out;
}

function cleanSocialLinks(value: unknown, fallback: SocialLink[]): SocialLink[] {
  if (!Array.isArray(value)) return fallback;
  const out = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<SocialLink>;
      const url = cleanString(raw.url, "");
      const platform = cleanString(raw.platform, "");
      if (!url || !platform) return null;
      return { platform, url };
    })
    .filter((x): x is SocialLink => x !== null);
  return out;
}

export function parseNavConfig(body?: string | null): NavConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }
  return {
    items: cleanNavItems(raw.items, DEFAULT_NAV_CONFIG.items).slice(0, 12),
  };
}

export function parseFooterConfig(body?: string | null): FooterConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }
  return {
    shopHeading: cleanString(raw.shopHeading, DEFAULT_FOOTER_CONFIG.shopHeading),
    shopLinks: cleanFooterLinks(raw.shopLinks, DEFAULT_FOOTER_CONFIG.shopLinks).slice(0, 12),
    companyHeading: cleanString(raw.companyHeading, DEFAULT_FOOTER_CONFIG.companyHeading),
    companyLinks: cleanFooterLinks(raw.companyLinks, DEFAULT_FOOTER_CONFIG.companyLinks).slice(0, 12),
    storesHeading: cleanString(raw.storesHeading, DEFAULT_FOOTER_CONFIG.storesHeading),
    newsletterLabel: cleanString(raw.newsletterLabel, DEFAULT_FOOTER_CONFIG.newsletterLabel),
    socialLinks: cleanSocialLinks(raw.socialLinks, DEFAULT_FOOTER_CONFIG.socialLinks).slice(0, 8),
    copyrightText: cleanString(raw.copyrightText, DEFAULT_FOOTER_CONFIG.copyrightText),
  };
}

export function parseSeoConfig(body?: string | null): SeoConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }
  return {
    siteTitle: cleanString(raw.siteTitle, DEFAULT_SEO_CONFIG.siteTitle),
    titleTemplate: cleanString(raw.titleTemplate, DEFAULT_SEO_CONFIG.titleTemplate),
    metaDescription: cleanString(raw.metaDescription, DEFAULT_SEO_CONFIG.metaDescription),
    ogTitle: cleanString(raw.ogTitle, DEFAULT_SEO_CONFIG.ogTitle),
    ogDescription: cleanString(raw.ogDescription, DEFAULT_SEO_CONFIG.ogDescription),
    ogImage: cleanString(raw.ogImage, DEFAULT_SEO_CONFIG.ogImage),
    siteName: cleanString(raw.siteName, DEFAULT_SEO_CONFIG.siteName),
  };
}

// ---------- Link validation ----------
// A link entered here is either an internal path ("/products", "#faq")
// or an external URL ("https://instagram.com/..."). Anything else —
// a bare word, a javascript: pseudo-link, an empty string on a required
// field — would silently break navigation or be a script-injection
// vector, so every save runs through this check first.

const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];

/** True if `href` is safe to use as an internal path or external URL. */
export function isValidLinkHref(href: string): boolean {
  const v = (href || "").trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  if (DANGEROUS_SCHEMES.some((s) => lower.startsWith(s))) return false;
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("?")) return true;
  if (/^https?:\/\/.+/i.test(v)) return true;
  if (/^mailto:.+@.+/i.test(v)) return true;
  if (/^tel:\+?\d+/i.test(v)) return true;
  return false;
}

export type LinkValidationError = { section: string; label: string; message: string };

/**
 * Validates every href/url across nav, footer, and announcement configs
 * in one pass. Returns an empty array when everything is valid — the
 * caller blocks save and shows these messages otherwise.
 */
export function validateSiteLinks(
  nav: NavConfig,
  footer: FooterConfig,
  announcement: AnnouncementConfig
): LinkValidationError[] {
  const errors: LinkValidationError[] = [];

  nav.items.forEach((item, i) => {
    if (!isValidLinkHref(item.href)) {
      errors.push({
        section: "Navigation",
        label: item.label || `Item ${i + 1}`,
        message: `"${item.label || `Item ${i + 1}`}" has an invalid link destination: "${item.href}". Use a path like /products or a full https:// URL.`,
      });
    }
  });

  footer.shopLinks.forEach((link, i) => {
    if (!isValidLinkHref(link.href)) {
      errors.push({
        section: "Footer — Shop links",
        label: link.label || `Link ${i + 1}`,
        message: `"${link.label || `Link ${i + 1}`}" has an invalid link destination: "${link.href}".`,
      });
    }
  });

  footer.companyLinks.forEach((link, i) => {
    if (!isValidLinkHref(link.href)) {
      errors.push({
        section: "Footer — Company links",
        label: link.label || `Link ${i + 1}`,
        message: `"${link.label || `Link ${i + 1}`}" has an invalid link destination: "${link.href}".`,
      });
    }
  });

  footer.socialLinks.forEach((social, i) => {
    const v = (social.url || "").trim();
    if (v && !/^https?:\/\/.+/i.test(v)) {
      errors.push({
        section: "Footer — Social links",
        label: social.platform || `Social ${i + 1}`,
        message: `"${social.platform || `Social ${i + 1}`}" URL must start with https:// — got "${social.url}".`,
      });
    }
  });

  if (announcement.active && announcement.linkHref && !isValidLinkHref(announcement.linkHref)) {
    errors.push({
      section: "Announcement bar",
      label: "Link destination",
      message: `Announcement bar link destination "${announcement.linkHref}" is invalid. Use a path like /products or a full https:// URL, or leave it blank.`,
    });
  }

  return errors;
}