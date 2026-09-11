import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type Accent = "brand" | "amber" | "rose" | "emerald";

const RAIL_CLASS: Record<Accent, string> = {
  brand: "accent-rail",
  amber: "accent-rail accent-rail--amber",
  rose: "accent-rail accent-rail--rose",
  emerald: "accent-rail accent-rail--emerald",
};

const EYEBROW_CLASS: Record<Accent, string> = {
  brand: "eyebrow",
  amber: "eyebrow eyebrow-accent",
  rose: "eyebrow text-rose-600",
  emerald: "eyebrow text-emerald-600",
};

/**
 * The single section header used across the homepage.
 *
 * Before this, each shelf styled its own heading: DealShelf used 3xl
 * brown text on peach, BestSellerShelf used 3xl white on navy, ScrollShelf
 * used an 18px slate label. Same page, three unrelated typographic
 * systems. Here the hierarchy is fixed — small tracked eyebrow, tight
 * display title, optional muted subtitle — and the section's category is
 * signalled only by a 3px accent rail and the eyebrow colour, so shelves
 * no longer need their own background colour to feel distinct.
 *
 * That unification fixed the inconsistency but overcorrected into monotony:
 * fourteen sections in a row opened with the same small eyebrow above a
 * 24px title, which is barely larger than the 13px body text beneath it, so
 * the page had almost no typographic hierarchy and every section announced
 * itself at the same volume. The title scale below is deliberately much
 * larger than the supporting copy — that contrast is what makes a section
 * read as a new chapter rather than another row.
 */
export default function SectionHead({
  eyebrow,
  title,
  subtitle,
  href,
  hrefLabel = "View all",
  accent = "brand",
  tone = "light",
  align = "left",
  actions,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  accent?: Accent;
  tone?: "light" | "ink";
  align?: "left" | "center";
  actions?: ReactNode;
  className?: string;
}) {
  const ink = tone === "ink";
  const centered = align === "center";

  const titleClass = ink
    ? "text-white"
    : "text-slate-900 dark:text-white";
  const subtitleClass = ink
    ? "text-white/65"
    : "text-slate-500 dark:text-slate-400";
  const eyebrowClass = ink ? "eyebrow eyebrow-ink" : EYEBROW_CLASS[accent];

  const heading = (
    <div className={centered ? "" : `${RAIL_CLASS[accent]} pl-3.5`}>
      {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
      <h2
        className={`font-display mt-1 text-[22px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[28px] lg:text-[32px] ${titleClass}`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-2 max-w-[54ch] text-[13.5px] leading-relaxed sm:text-[15px] ${subtitleClass}`}>{subtitle}</p>
      )}
    </div>
  );

  if (centered) {
    return (
      <div className={`mx-auto max-w-[62ch] text-center ${className}`}>
        {heading}
        {href && (
          <Link
            href={href}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-blue-700 transition hover:gap-2.5 hover:text-blue-800 dark:text-blue-400"
          >
            {hrefLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      {heading}
      <div className="flex shrink-0 items-center gap-2 pb-0.5">
        {href && (
          <Link
            href={href}
            className={`hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition sm:inline-flex ${
              ink
                ? "text-white/80 ring-1 ring-white/20 hover:bg-white/10 hover:text-white"
                : "text-slate-600 ring-1 ring-slate-200 hover:bg-white hover:text-blue-700 hover:ring-blue-200 dark:text-slate-300 dark:ring-slate-700"
            }`}
          >
            {hrefLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
        {actions}
      </div>
    </div>
  );
}
