import Link from "next/link";
import {
  Award,
  Clock,
  CreditCard,
  Headset,
  IndianRupee,
  MapPin,
  Package,
  Shield,
  Sparkles,
  Store,
  Truck,
  Wrench,
} from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHead from "@/components/SectionHead";
import SafeImage from "@/components/SafeImage";
import type { BenefitCardConfig, BenefitIconKey } from "@/lib/homepageStory";

// Icon set offered to the Admin dropdown. Kept in lockstep with
// BENEFIT_ICON_KEYS in lib/homepageStory.ts — adding a key there without
// adding it here falls back to the sparkles glyph rather than crashing.
const ICONS: Record<BenefitIconKey, React.ComponentType<{ className?: string }>> = {
  truck: Truck,
  shield: Shield,
  wrench: Wrench,
  rupee: IndianRupee,
  headset: Headset,
  store: Store,
  sparkles: Sparkles,
  card: CreditCard,
  clock: Clock,
  award: Award,
  "map-pin": MapPin,
  package: Package,
};

/**
 * "Why shop with us" — the benefit/trust card grid.
 *
 * Deliberately distinct from TrustBadges: that strip is a compact
 * five-across reassurance rail directly under the hero, this is a fuller
 * editorial block with room for a sentence per point. All copy, icons,
 * artwork and links come from the `homepage-story` content page, so the
 * shopkeeper can rewrite or reorder the whole section without a deploy.
 */
export default function BenefitCards({
  eyebrow,
  heading,
  subtitle,
  items,
}: {
  eyebrow: string;
  heading: string;
  subtitle?: string;
  items: BenefitCardConfig[];
}) {
  const cards = items.filter((c) => c.enabled && c.title);
  if (cards.length === 0) return null;

  return (
    <section className="shell band">
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={heading} subtitle={subtitle || undefined} />
      </Reveal>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = ICONS[card.iconKey] || Sparkles;
          const body = (
            <>
              {/* Corner glow: a transform/opacity-only hover accent, so it
                  costs nothing to animate on a long grid. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-500/0 blur-2xl transition-colors duration-300 group-hover:bg-blue-500/20"
              />

              {card.image ? (
                <div className="img-frame relative h-11 w-11 overflow-hidden rounded-xl">
                  <SafeImage src={card.image} alt="" sizes="44px" />
                </div>
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 transition-all duration-300 group-hover:scale-105 group-hover:bg-blue-700 group-hover:text-white dark:bg-blue-500/10 dark:text-blue-400 dark:group-hover:bg-blue-600 dark:group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
              )}

              <div className="relative min-w-0">
                <h3 className="text-[15px] font-extrabold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white">
                  {card.title}
                </h3>
                {card.description && (
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {card.description}
                  </p>
                )}
                {card.href && (
                  <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-blue-700 dark:text-blue-400">
                    Learn more <span className="nudge-x">→</span>
                  </span>
                )}
              </div>
            </>
          );

          const shell =
            "group relative flex items-start gap-3.5 overflow-hidden rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_0_1px_rgba(30,64,175,0.22),0_22px_44px_-26px_rgba(15,23,42,0.42)] dark:bg-slate-900 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07)] sm:p-5";

          return (
            // Stagger capped at 4 steps so a long grid never leaves the
            // last card waiting a full second to appear.
            <Reveal key={`${card.title}-${index}`} delay={(index % 4) * 70}>
              {card.href ? (
                <Link href={card.href} className={shell}>
                  {body}
                </Link>
              ) : (
                <div className={shell}>{body}</div>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
