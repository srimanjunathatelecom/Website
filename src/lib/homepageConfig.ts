export const HOME_CONFIG_SLUG = "homepage-content";

export type TrustBadgeConfig = {
  title: string;
  subtitle: string;
  iconKey: "shield" | "card" | "wrench" | "refresh" | "map-pin";
};

export type BudgetCardConfig = {
  label: string;
  max: number | null;
  emoji: string;
  tone: string;
};

export type ProcessStepConfig = {
  title: string;
  body: string;
};

export type ServiceFaqConfig = {
  question: string;
  answer: string;
};

/**
 * A "Shop by use case" tile. `query` is the /products query string the
 * tile links to (e.g. "category=mobiles&minPrice=15000") — tiles are pure
 * deep-links into the real filter system, so they can never show a price
 * or product that doesn't exist.
 */
export type UseCaseTileConfig = {
  label: string;
  tagline: string;
  emoji: string;
  query: string;
  tone: string;
};

export type HomePageConfig = {
  marqueeItems: string[];
  headerDeliveryLabel: string;
  welcomeEyebrow: string;
  welcomeTitle: string;
  welcomeDescription: string;
  quickHighlights: string[];
  trustBadges: TrustBadgeConfig[];
  budgetsEyebrow: string;
  budgetsTitle: string;
  budgets: BudgetCardConfig[];
  serviceStripEyebrow: string;
  serviceStripTitle: string;
  serviceStripSubtitle: string;
  serviceStripButtonLabel: string;
  serviceStripHighlights: string[];
  processEyebrow: string;
  processTitle: string;
  processSubtitle: string;
  processSteps: ProcessStepConfig[];
  processFootnote: string;
  serviceFaqEyebrow: string;
  serviceFaqTitle: string;
  serviceFaqItems: ServiceFaqConfig[];
  serviceFaqHelpTitle: string;
  serviceFaqHelpBody: string;
  serviceBadge: string;
  serviceTitle: string;
  serviceDescription: string;
  serviceButtonLabel: string;
  repairShowcaseEyebrow: string;
  repairShowcaseTitle: string;
  repairShowcaseSubtitle: string;
  repairShowcaseButtonLabel: string;
  repairEyebrow: string;
  repairTitle: string;
  repairAccent: string;
  repairDescription: string;
  repairButtonLabel: string;
  storeEyebrow: string;
  storeTitle: string;
  // "Product spotlight" homepage section. null = automatic (the shop's
  // top featured product), a number = that exact product id.
  spotlightEyebrow: string;
  spotlightProductId: number | null;
  // "Deal of the day" section copy. The product itself always comes from
  // the live deals list — only the framing copy is configurable.
  dailyDropEyebrow: string;
  dailyDropTitle: string;
  // "Shop by use case" tiles.
  useCasesEyebrow: string;
  useCasesTitle: string;
  useCases: UseCaseTileConfig[];
};

export const DEFAULT_HOME_CONFIG: HomePageConfig = {
  marqueeItems: [
    "We sell at MOP, not MRP",
    "30-minute delivery in Bengaluru",
    "Same-day expert repairs",
    "Genuine products, real warranty",
    "Festive offers live now — up to 55% off",
  ],
  headerDeliveryLabel: "30-Min Delivery",
  welcomeEyebrow: "Welcome to {brand}",
  welcomeTitle: "Bengaluru's trusted mobile & laptop store",
  welcomeDescription: "{tagline} · genuine products, honest repairs, {outletCount} outlets across the city.",
  quickHighlights: [
    "30-Min Delivery",
    "Genuine & Warranty",
    "Same-Day Repairs",
    "We Sell at MOP",
  ],
  trustBadges: [
    { title: "30-Min Delivery", subtitle: "Fast delivery across Bengaluru", iconKey: "refresh" },
    { title: "Same-Day Repair", subtitle: "Expert in-store service", iconKey: "wrench" },
    { title: "2 Physical Stores", subtitle: "K R Puram & Bidarahalli", iconKey: "map-pin" },
    { title: "100% Genuine", subtitle: "Authorized products only", iconKey: "shield" },
    { title: "Easy EMI", subtitle: "No-cost card EMIs", iconKey: "card" },
  ],
  budgetsEyebrow: "Pick Your Price",
  budgetsTitle: "Shop by Budget",
  budgets: [
    { label: "Under ₹5,000", max: 5000, emoji: "💸", tone: "from-emerald-500 to-teal-500" },
    { label: "Under ₹10,000", max: 10000, emoji: "🎯", tone: "from-sky-500 to-blue-600" },
    { label: "Under ₹20,000", max: 20000, emoji: "⚡", tone: "from-indigo-500 to-violet-600" },
    { label: "Under ₹30,000", max: 30000, emoji: "🔥", tone: "from-fuchsia-500 to-pink-600" },
    { label: "Under ₹50,000", max: 50000, emoji: "👑", tone: "from-amber-500 to-orange-600" },
    { label: "Premium & Above", max: null, emoji: "💎", tone: "from-slate-700 to-slate-900" },
  ],
  // Copy for the repairs/servicing strip that leads the homepage, above
  // "Shop by category". The tiles themselves are generated from the
  // services table (Admin > Services) — only this framing copy lives here.
  serviceStripEyebrow: "Repairs & Servicing",
  serviceStripTitle: "Device not working? We fix it.",
  serviceStripSubtitle:
    "Screen, battery, water damage, motherboard and data recovery — for phones and laptops, by real technicians at both our Bengaluru outlets.",
  serviceStripButtonLabel: "Book a Repair",
  // Kept to claims the shop makes elsewhere on the site: turnaround comes
  // from the services table, the 30-day figure from the Warranty &
  // Replacement Policy page, component-level repair from the service
  // descriptions, and "no advance payment" from the booking page.
  serviceStripHighlights: [
    "Same-day turnaround on most repairs",
    "30-day warranty on every repair",
    "Component-level board repair in-house",
    "Walk in at K R Puram or Bidarahalli",
  ],
  // "How a repair works" — the four steps mirror the four real booking
  // statuses the shop already moves a job through in Admin > Bookings
  // (Booked > In Progress > Ready > Delivered), so what a customer reads
  // here is exactly what they will later see on the Track page. The
  // wording of steps 1 and 2 comes from the booking page's own promise
  // ("No payment needed now — our team will call to confirm").
  processEyebrow: "How It Works",
  processTitle: "Four steps from broken to fixed",
  processSubtitle:
    "Booking takes under a minute and costs nothing. You only commit once we have seen the device and told you the price.",
  processSteps: [
    {
      title: "Book it online",
      body: "Pick the service, tell us your device and what went wrong, then choose K R Puram or Bidarahalli. No payment at this stage.",
    },
    {
      title: "We call to confirm",
      body: "Our team rings you to confirm the fault and the price before any work starts, so nothing is a surprise later.",
    },
    {
      title: "Repair in progress",
      body: "Your device goes to our bench for diagnosis and repair — including component-level board work we do in-house.",
    },
    {
      title: "Ready to collect",
      body: "We mark it ready and hand it back at your chosen outlet. Check the status any time with your booking number.",
    },
  ],
  processFootnote: "Every repair carries a 30-day service warranty.",
  // Answers are lifted from pages the site already publishes: the FAQ
  // page (brands covered, how to book), the booking page (no advance
  // payment), and the Warranty & Replacement Policy page (30-day repair
  // warranty, and what that warranty excludes). Nothing here promises
  // anything the shop has not already committed to elsewhere.
  serviceFaqEyebrow: "Before You Book",
  serviceFaqTitle: "Repair questions, answered",
  serviceFaqItems: [
    {
      question: "Do you repair all brands?",
      answer: "Yes — our technicians handle all major mobile and laptop brands.",
    },
    {
      question: "Do I have to pay anything to book?",
      answer:
        "No. Booking is free and no payment is needed up front. Our team calls you to confirm the fault and the price first, and you decide from there.",
    },
    {
      question: "Is there a warranty on the repair itself?",
      answer: "Yes. Every repair we carry out comes with a 30-day service warranty.",
    },
    {
      question: "What is not covered by that warranty?",
      answer:
        "Physical damage and water damage are not covered unless separately insured. We also do not offer old-phone exchange.",
    },
    {
      question: "Some services say 'price on inspection' — why?",
      answer:
        "Faults like liquid damage and motherboard issues cannot be priced honestly without opening the device. We inspect it, then quote you before doing any work.",
    },
    {
      question: "How do I check on my repair?",
      answer: "Open Track Order and enter the booking number we give you when you book.",
    },
  ],
  serviceFaqHelpTitle: "Not sure what is wrong?",
  serviceFaqHelpBody:
    "Describe the symptoms in your booking and our technicians will diagnose it, or call the outlet nearest you and ask.",
  serviceBadge: "Instant In-Store Solutions",
  serviceTitle: "Finance, Fiber, DTH & Component Repairs",
  serviceDescription: "Walk in for zero down-payment EMIs, high-speed connection setups, or instant SIM activations.",
  serviceButtonLabel: "Visit Store",
  // "Popular Repaired Services" photo rail. The services and photos come
  // from Admin > Services — only this framing copy lives here.
  repairShowcaseEyebrow: "Popular Repairs",
  repairShowcaseTitle: "Popular repaired services",
  repairShowcaseSubtitle:
    "The repairs customers book most — real photos, honest starting prices, and a technician you can talk to before any work begins.",
  repairShowcaseButtonLabel: "See all repair services",
  repairEyebrow: "Expert Repair Services",
  repairTitle: "Screen · Battery · Water Damage ·",
  repairAccent: "fixed same day.",
  repairDescription: "Real technicians at both our Bengaluru outlets. Honest diagnosis, fair pricing, no surprises.",
  repairButtonLabel: "Book a Repair",
  storeEyebrow: "Visit Our Stores",
  storeTitle: "Come say hi in Bengaluru",
  spotlightEyebrow: "In the Spotlight",
  spotlightProductId: null,
  dailyDropEyebrow: "24 Hours Only",
  dailyDropTitle: "Deal of the Day",
  useCasesEyebrow: "Shop Your Way",
  useCasesTitle: "What will you use it for?",
  useCases: [
    { label: "Gaming", tagline: "Big batteries and fast screens for serious play", emoji: "\uD83C\uDFAE", query: "category=mobiles&minPrice=15000&sort=price-desc", tone: "from-indigo-600 to-violet-700" },
    { label: "College & Campus", tagline: "Great phones that respect a student budget", emoji: "\uD83C\uDF93", query: "category=mobiles&maxPrice=15000&sort=price-asc", tone: "from-emerald-500 to-teal-600" },
    { label: "Work & Business", tagline: "Dependable daily drivers for calls, UPI and mail", emoji: "\uD83D\uDCBC", query: "category=mobiles&minPrice=10000&maxPrice=30000", tone: "from-sky-500 to-blue-700" },
    { label: "Camera First", tagline: "For the friend who shoots everything", emoji: "\uD83D\uDCF8", query: "category=mobiles&minPrice=20000", tone: "from-rose-500 to-orange-500" },
  ],
};

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const out = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return out.length ? out : fallback;
}

function cleanTrustBadges(value: unknown): TrustBadgeConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_CONFIG.trustBadges;
  const out = value
    .map((item, index) => {
      const fallback = DEFAULT_HOME_CONFIG.trustBadges[index] || DEFAULT_HOME_CONFIG.trustBadges[0];
      if (!item || typeof item !== "object") return fallback;
      const raw = item as Partial<TrustBadgeConfig>;
      const iconKey = ["shield", "card", "wrench", "refresh", "map-pin"].includes(String(raw.iconKey || ""))
        ? (raw.iconKey as TrustBadgeConfig["iconKey"])
        : fallback.iconKey;
      return {
        title: cleanString(raw.title, fallback.title),
        subtitle: cleanString(raw.subtitle, fallback.subtitle),
        iconKey,
      };
    })
    .slice(0, 5);
  return out.length ? out : DEFAULT_HOME_CONFIG.trustBadges;
}

// Both of these keep a fixed shape (title/body, question/answer) and fall
// back per-field rather than dropping a whole row, so a shopkeeper who
// clears one box while editing sees the default text return instead of an
// item vanishing from the live page.
function cleanProcessSteps(value: unknown): ProcessStepConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_CONFIG.processSteps;
  const out = value
    .map((item, index) => {
      const fallback = DEFAULT_HOME_CONFIG.processSteps[index] || DEFAULT_HOME_CONFIG.processSteps[0];
      if (!item || typeof item !== "object") return fallback;
      const raw = item as Partial<ProcessStepConfig>;
      return {
        title: cleanString(raw.title, fallback.title),
        body: cleanString(raw.body, fallback.body),
      };
    })
    .slice(0, 4);
  return out.length ? out : DEFAULT_HOME_CONFIG.processSteps;
}

function cleanServiceFaqItems(value: unknown): ServiceFaqConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_CONFIG.serviceFaqItems;
  const out = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<ServiceFaqConfig>;
      const question = cleanString(raw.question, "");
      const answer = cleanString(raw.answer, "");
      // A half-filled row would render an expander that opens onto
      // nothing, so require both halves here.
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((x): x is ServiceFaqConfig => x !== null)
    .slice(0, 8);
  return out.length ? out : DEFAULT_HOME_CONFIG.serviceFaqItems;
}

function cleanBudgets(value: unknown): BudgetCardConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOME_CONFIG.budgets;
  const out = value
    .map((item, index) => {
      const fallback = DEFAULT_HOME_CONFIG.budgets[index] || DEFAULT_HOME_CONFIG.budgets[0];
      if (!item || typeof item !== "object") return fallback;
      const raw = item as any;
      const max = raw.max === null || raw.max === undefined || raw.max === ""
        ? null
        : Number.isFinite(Number(raw.max))
          ? Number(raw.max)
          : fallback.max;
      return {
        label: cleanString(raw.label, fallback.label),
        max,
        emoji: cleanString(raw.emoji, fallback.emoji),
        tone: cleanString(raw.tone, fallback.tone),
      };
    })
    .slice(0, 6);
  return out.length ? out : DEFAULT_HOME_CONFIG.budgets;
}

export function parseHomePageConfig(body?: string | null): HomePageConfig {
  let raw: any = {};
  try {
    raw = body ? JSON.parse(body) : {};
  } catch {
    raw = {};
  }

  return {
    marqueeItems: cleanStringArray(raw.marqueeItems, DEFAULT_HOME_CONFIG.marqueeItems),
    headerDeliveryLabel: cleanString(raw.headerDeliveryLabel, DEFAULT_HOME_CONFIG.headerDeliveryLabel),
    welcomeEyebrow: cleanString(raw.welcomeEyebrow, DEFAULT_HOME_CONFIG.welcomeEyebrow),
    welcomeTitle: cleanString(raw.welcomeTitle, DEFAULT_HOME_CONFIG.welcomeTitle),
    welcomeDescription: cleanString(raw.welcomeDescription, DEFAULT_HOME_CONFIG.welcomeDescription),
    quickHighlights: cleanStringArray(raw.quickHighlights, DEFAULT_HOME_CONFIG.quickHighlights).slice(0, 4),
    trustBadges: cleanTrustBadges(raw.trustBadges),
    budgetsEyebrow: cleanString(raw.budgetsEyebrow, DEFAULT_HOME_CONFIG.budgetsEyebrow),
    budgetsTitle: cleanString(raw.budgetsTitle, DEFAULT_HOME_CONFIG.budgetsTitle),
    budgets: cleanBudgets(raw.budgets),
    serviceStripEyebrow: cleanString(raw.serviceStripEyebrow, DEFAULT_HOME_CONFIG.serviceStripEyebrow),
    serviceStripTitle: cleanString(raw.serviceStripTitle, DEFAULT_HOME_CONFIG.serviceStripTitle),
    serviceStripSubtitle: cleanString(raw.serviceStripSubtitle, DEFAULT_HOME_CONFIG.serviceStripSubtitle),
    serviceStripButtonLabel: cleanString(raw.serviceStripButtonLabel, DEFAULT_HOME_CONFIG.serviceStripButtonLabel),
    serviceStripHighlights: cleanStringArray(
      raw.serviceStripHighlights,
      DEFAULT_HOME_CONFIG.serviceStripHighlights
    ).slice(0, 4),
    processEyebrow: cleanString(raw.processEyebrow, DEFAULT_HOME_CONFIG.processEyebrow),
    processTitle: cleanString(raw.processTitle, DEFAULT_HOME_CONFIG.processTitle),
    processSubtitle: cleanString(raw.processSubtitle, DEFAULT_HOME_CONFIG.processSubtitle),
    processSteps: cleanProcessSteps(raw.processSteps),
    processFootnote: cleanString(raw.processFootnote, DEFAULT_HOME_CONFIG.processFootnote),
    serviceFaqEyebrow: cleanString(raw.serviceFaqEyebrow, DEFAULT_HOME_CONFIG.serviceFaqEyebrow),
    serviceFaqTitle: cleanString(raw.serviceFaqTitle, DEFAULT_HOME_CONFIG.serviceFaqTitle),
    serviceFaqItems: cleanServiceFaqItems(raw.serviceFaqItems),
    serviceFaqHelpTitle: cleanString(raw.serviceFaqHelpTitle, DEFAULT_HOME_CONFIG.serviceFaqHelpTitle),
    serviceFaqHelpBody: cleanString(raw.serviceFaqHelpBody, DEFAULT_HOME_CONFIG.serviceFaqHelpBody),
    serviceBadge: cleanString(raw.serviceBadge, DEFAULT_HOME_CONFIG.serviceBadge),
    serviceTitle: cleanString(raw.serviceTitle, DEFAULT_HOME_CONFIG.serviceTitle),
    serviceDescription: cleanString(raw.serviceDescription, DEFAULT_HOME_CONFIG.serviceDescription),
    serviceButtonLabel: cleanString(raw.serviceButtonLabel, DEFAULT_HOME_CONFIG.serviceButtonLabel),
    repairShowcaseEyebrow: cleanString(raw.repairShowcaseEyebrow, DEFAULT_HOME_CONFIG.repairShowcaseEyebrow),
    repairShowcaseTitle: cleanString(raw.repairShowcaseTitle, DEFAULT_HOME_CONFIG.repairShowcaseTitle),
    repairShowcaseSubtitle: cleanString(raw.repairShowcaseSubtitle, DEFAULT_HOME_CONFIG.repairShowcaseSubtitle),
    repairShowcaseButtonLabel: cleanString(raw.repairShowcaseButtonLabel, DEFAULT_HOME_CONFIG.repairShowcaseButtonLabel),
    repairEyebrow: cleanString(raw.repairEyebrow, DEFAULT_HOME_CONFIG.repairEyebrow),
    repairTitle: cleanString(raw.repairTitle, DEFAULT_HOME_CONFIG.repairTitle),
    repairAccent: cleanString(raw.repairAccent, DEFAULT_HOME_CONFIG.repairAccent),
    repairDescription: cleanString(raw.repairDescription, DEFAULT_HOME_CONFIG.repairDescription),
    repairButtonLabel: cleanString(raw.repairButtonLabel, DEFAULT_HOME_CONFIG.repairButtonLabel),
    storeEyebrow: cleanString(raw.storeEyebrow, DEFAULT_HOME_CONFIG.storeEyebrow),
    storeTitle: cleanString(raw.storeTitle, DEFAULT_HOME_CONFIG.storeTitle),
    spotlightEyebrow: cleanString(raw.spotlightEyebrow, DEFAULT_HOME_CONFIG.spotlightEyebrow),
    spotlightProductId: cleanNullableId(raw.spotlightProductId),
    dailyDropEyebrow: cleanString(raw.dailyDropEyebrow, DEFAULT_HOME_CONFIG.dailyDropEyebrow),
    dailyDropTitle: cleanString(raw.dailyDropTitle, DEFAULT_HOME_CONFIG.dailyDropTitle),
    useCasesEyebrow: cleanString(raw.useCasesEyebrow, DEFAULT_HOME_CONFIG.useCasesEyebrow),
    useCasesTitle: cleanString(raw.useCasesTitle, DEFAULT_HOME_CONFIG.useCasesTitle),
    useCases: cleanUseCases(raw.useCases),
  };
}

// A positive integer id, or null for "pick automatically". Accepts the
// number itself or a numeric string (the admin form sends text).
function cleanNullableId(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function cleanUseCases(value: unknown): UseCaseTileConfig[] {
  const fallbacks = DEFAULT_HOME_CONFIG.useCases;
  if (!Array.isArray(value)) return fallbacks;
  const tiles = value
    .slice(0, 6)
    .map((raw: any, i: number) => {
      const fallback = fallbacks[i % fallbacks.length];
      if (!raw || typeof raw !== "object") return null;
      const label = cleanString(raw.label, "");
      if (!label) return null;
      return {
        label,
        tagline: cleanString(raw.tagline, fallback.tagline),
        emoji: cleanString(raw.emoji, fallback.emoji),
        // Strip a leading "?" or full "/products?" if the admin pastes a
        // whole URL — we only store the query string.
        query: cleanString(raw.query, fallback.query).replace(/^.*\?/, ""),
        tone: cleanString(raw.tone, fallback.tone),
      };
    })
    .filter(Boolean) as UseCaseTileConfig[];
  return tiles.length ? tiles : fallbacks;
}

export function fillHomeCopy(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}