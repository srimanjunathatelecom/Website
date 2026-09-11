import Link from "next/link";
import {
  Banknote,
  CircuitBoard,
  Satellite,
  ShieldCheck,
  Smartphone,
  Store,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import SafeImage from "./SafeImage";

export type SolutionCard = {
  id?: number | string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  icon?: string | null;
  themeColor?: string | null;
};

/**
 * The in-store solutions block — finance/EMI, DTH & broadband, express
 * repair and SIM activation.
 *
 * This used to be four flat grey boxes with an emoji each, on a plain
 * white panel: the four most distinctive things the shop does, rendered as
 * the least distinctive block on the page. Each card is now a photograph
 * of the actual work with its own colour identity, which is the only
 * treatment that makes "we install your broadband" read as a real service
 * rather than a bullet point.
 *
 * The card content still comes from Admin > Promo Cards (or the built-in
 * defaults), so nothing here is hardcoded copy. What the code supplies is
 * the *presentation* for each card — photo, icon and colour — resolved
 * from the card's own theme colour and wording. That matters because the
 * promo_cards table has no image column: rather than force a schema
 * migration and make the shopkeeper upload four photos before the section
 * looks right, a card is matched to a shipped photograph by what it is
 * about. Rename "DTH & Broadband" to "Fiber Internet" and it still gets
 * the installation photo and the blue palette.
 */

type Palette = {
  /** Colour wash laid over the photo, so each card reads as its own thing. */
  wash: string;
  /** Corner bloom behind the photo. */
  glow: string;
  /** Subtitle / kicker colour. */
  label: string;
  /** Ring that appears on hover. */
  ring: string;
  /** Glass chip behind the icon. */
  chip: string;
};

const PALETTES: Record<string, Palette> = {
  amber: {
    wash: "from-amber-950/94 via-amber-950/55",
    glow: "bg-amber-400/25",
    label: "text-amber-300",
    ring: "group-hover:ring-amber-300/60",
    chip: "bg-amber-400/20 text-amber-200 ring-amber-300/30",
  },
  sky: {
    wash: "from-sky-950/94 via-sky-950/55",
    glow: "bg-sky-400/25",
    label: "text-sky-300",
    ring: "group-hover:ring-sky-300/60",
    chip: "bg-sky-400/20 text-sky-200 ring-sky-300/30",
  },
  emerald: {
    wash: "from-emerald-950/94 via-emerald-950/55",
    glow: "bg-emerald-400/25",
    label: "text-emerald-300",
    ring: "group-hover:ring-emerald-300/60",
    chip: "bg-emerald-400/20 text-emerald-200 ring-emerald-300/30",
  },
  violet: {
    wash: "from-violet-950/94 via-violet-950/55",
    glow: "bg-violet-400/25",
    label: "text-violet-300",
    ring: "group-hover:ring-violet-300/60",
    chip: "bg-violet-400/20 text-violet-200 ring-violet-300/30",
  },
  blue: {
    wash: "from-blue-950/94 via-blue-950/55",
    glow: "bg-blue-400/25",
    label: "text-blue-300",
    ring: "group-hover:ring-blue-300/60",
    chip: "bg-blue-400/20 text-blue-200 ring-blue-300/30",
  },
  rose: {
    wash: "from-rose-950/94 via-rose-950/55",
    glow: "bg-rose-400/25",
    label: "text-rose-300",
    ring: "group-hover:ring-rose-300/60",
    chip: "bg-rose-400/20 text-rose-200 ring-rose-300/30",
  },
};

/** Order used when a card gives no usable colour hint of its own. */
const PALETTE_CYCLE = ["amber", "sky", "emerald", "violet"];

/**
 * Subject matching. First rule whose keyword appears as a whole word wins,
 * so the specific terms sit above the generic ones — a card mentioning
 * both "SIM" and "repair" is about SIMs.
 */
const SUBJECT_RULES: Array<{
  keywords: string[];
  image: string;
  alt: string;
  icon: LucideIcon;
  palette: string;
}> = [
  {
    keywords: ["emi", "finance", "loan", "credit", "debit", "instalment", "installment", "bajaj", "dmi"],
    image: "/images/svc-finance.jpg",
    alt: "Card EMI payment being processed at the Smart Mobile Stores counter",
    icon: Banknote,
    palette: "amber",
  },
  {
    keywords: ["dth", "broadband", "fiber", "fibre", "wifi", "internet", "cable", "dish", "connection"],
    image: "/images/svc-dth.jpg",
    alt: "Technician fitting a fiber broadband router during a home installation",
    icon: Satellite,
    palette: "sky",
  },
  {
    keywords: ["sim", "cellular", "activation", "porting", "network"],
    image: "/images/svc-sim.jpg",
    alt: "Nano SIM card being fitted into a phone's SIM tray at the store counter",
    icon: Smartphone,
    palette: "violet",
  },
  {
    keywords: [
      "repair", "service", "servicing", "display", "screen", "battery", "mic",
      "speaker", "glass", "motherboard", "board", "component", "laptop", "water",
    ],
    image: "/images/svc-board.jpg",
    alt: "Component-level board repair under a bench microscope",
    icon: CircuitBoard,
    palette: "emerald",
  },
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function subjectFor(card: SolutionCard) {
  const haystack = `${card.title || ""} ${card.subtitle || ""} ${card.description || ""}`.toLowerCase();
  for (const rule of SUBJECT_RULES) {
    if (rule.keywords.some((kw) => new RegExp(`\\b${escapeRegex(kw)}\\b`).test(haystack))) {
      return rule;
    }
  }
  return null;
}

/**
 * A card's colour comes from the themeColor the admin already sets on it
 * (stored as e.g. "text-sky-400"), because that is a control the
 * shopkeeper has today and it would be rude to silently ignore it. Only
 * when it names no palette we recognise do we fall back to the subject
 * match, then to position in the row.
 */
function paletteFor(card: SolutionCard, subjectPalette: string | null, index: number): Palette {
  const raw = (card.themeColor || "").toLowerCase();
  const named = Object.keys(PALETTES).find((name) => raw.includes(name));
  // "purple" is the wording used in the shipped defaults; violet is the
  // closest palette we define, so treat them as the same choice.
  const mapped = named || (raw.includes("purple") ? "violet" : null);
  const key = mapped || subjectPalette || PALETTE_CYCLE[index % PALETTE_CYCLE.length];
  return PALETTES[key] || PALETTES.blue;
}

export default function ServiceSolutions({
  badge,
  title,
  description,
  buttonLabel,
  cards,
}: {
  badge: string;
  title: string;
  description: string;
  buttonLabel: string;
  cards: SolutionCard[];
}) {
  const list = (cards || []).filter((c) => c && c.title);
  if (list.length === 0) return null;

  // Column count follows the number of cards so three cards fill the row
  // instead of leaving a conspicuous gap where a fourth used to be.
  const cols =
    list.length === 1
      ? "grid-cols-1"
      : list.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : list.length === 3
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <section className="shell band-tight">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {/* Decoration: squared-paper grid plus two slow amber/blue blooms.
            Both sit on aria-hidden layers behind the content. */}
        <span aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-70" />
        <span aria-hidden className="aurora">
          <span className="left-[6%] top-[4%] h-64 w-64 bg-amber-300/25" />
          <span className="right-[8%] top-[38%] h-72 w-72 bg-blue-300/25" />
        </span>

        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <span className="sheen inline-block rounded-full bg-gradient-to-r from-amber-100 to-amber-50 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-amber-800 ring-1 ring-amber-300/70">
              {badge}
            </span>
            <h2 className="font-display mt-3 text-[26px] font-extrabold leading-[1.1] tracking-[-0.025em] text-slate-900 [text-wrap:balance] sm:text-[34px]">
              {title}
            </h2>
            <p className="mt-2.5 max-w-[54ch] text-[13.5px] leading-relaxed text-slate-600">
              {description}
            </p>
          </div>
          <Link
            href="/contact"
            className="group inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-[13px] font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-700/25"
          >
            <Store className="h-4 w-4" strokeWidth={2.1} />
            {buttonLabel}
            <span className="nudge-x">→</span>
          </Link>
        </div>

        <div className={`stagger-in relative mt-7 grid gap-4 ${cols}`}>
          {list.map((card, i) => {
            const subject = subjectFor(card);
            const palette = paletteFor(card, subject?.palette ?? null, i);
            const Icon = subject?.icon ?? Wrench;
            // Falling back to the shop interior rather than a grey
            // placeholder means a card about something we have no photo
            // for still looks like part of this shop.
            const image = subject?.image ?? "/images/store-interior.jpg";
            const alt = subject?.alt ?? `${card.title} at Smart Mobile Stores`;

            return (
              <article
                key={card.id ?? `${card.title}-${i}`}
                className="group relative flex min-h-[264px] flex-col justify-end overflow-hidden rounded-2xl ring-1 ring-slate-900/10 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-slate-900/20 sm:min-h-[290px]"
              >
                <div aria-hidden className="absolute inset-0">
                  <SafeImage
                    src={image}
                    alt={alt}
                    className="photo-zoom h-full w-full object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                </div>
                {/* Two-stop scrim: near-opaque at the bottom where all the
                    text sits, clearing toward the top so the photograph is
                    still legible. Tinted per card so the colour reads as
                    part of the image rather than a sticker on top of it. */}
                <div
                  aria-hidden
                  className={`absolute inset-0 bg-gradient-to-t ${palette.wash} to-transparent`}
                />
                {/* A second, bottom-weighted black layer. The tinted wash
                    alone left the pale photographs (the fiber install and
                    the SIM close-up) too bright for white body copy; this
                    guarantees the text band is dark on every image, whatever
                    photo or theme colour the shopkeeper ends up with. */}
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-slate-950/10" />
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl ${palette.glow}`}
                />
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/0 transition duration-300 ${palette.ring}`}
                />

                <div className="relative p-4 sm:p-5">
                  <span
                    className={`mb-3 grid h-10 w-10 place-items-center rounded-xl backdrop-blur-sm ring-1 ${palette.chip}`}
                  >
                    {/* The shopkeeper's own emoji wins — it is a control
                        they have in Admin > Promo Cards today. But "✨" is
                        the placeholder the old code fell back to, so a card
                        still carrying it gets the icon matched to its
                        subject instead of a meaningless sparkle. */}
                    {card.icon && card.icon.trim() && card.icon.trim() !== "✨" ? (
                      <span className="text-lg leading-none">{card.icon}</span>
                    ) : (
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    )}
                  </span>
                  <h3 className="text-[15.5px] font-extrabold leading-tight tracking-tight text-white">
                    {card.title}
                  </h3>
                  {card.subtitle ? (
                    <p className={`mt-1 text-[12.5px] font-bold leading-snug ${palette.label}`}>
                      {card.subtitle}
                    </p>
                  ) : null}
                  {card.description ? (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-200/90">
                      {card.description}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {/* Anchors the block to the two real outlets and the one promise the
            warranty policy already makes, so it closes on something
            checkable rather than trailing off after the last card. */}
        <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200 pt-5">
          <span className="inline-flex items-center gap-2 text-[12.5px] font-bold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={2.1} />
            30-day service warranty on repairs
          </span>
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
            <Store className="h-4 w-4 text-slate-400" strokeWidth={2.1} />
            Available at both K R Puram and Bidarahalli
          </span>
        </div>
      </div>
    </section>
  );
}
