import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import Reveal from "@/components/Reveal";
import type { HomeStoryConfig } from "@/lib/homepageStory";

const ART_ANIMATION: Record<HomeStoryConfig["characterAnimation"], string> = {
  float: "story-art--float",
  drift: "story-art--drift",
  none: "",
};

/**
 * Brand storytelling block: an animated artwork/character panel beside a
 * short promise and up to four proof stats.
 *
 * Every string, the artwork itself and the artwork's motion style are
 * Admin-controlled (`homepage-story` content page) — nothing here is
 * hardcoded copy. The whole section is skipped when disabled or when the
 * heading is blank, so it can be turned off without leaving a gap.
 *
 * Motion is limited to two transform-only keyframes on a single element
 * and both are disabled under prefers-reduced-motion (see globals.css),
 * so this never becomes a continuous repaint on a long page.
 */
export default function BrandStory({ config }: { config: HomeStoryConfig }) {
  if (!config.storyEnabled || !config.storyHeading) return null;

  const hasArt = Boolean(config.characterImage);

  return (
    <section className="relative overflow-hidden">
      {/* Decorative field: two soft blobs + a dot grid, all painted once
          and never animated, so they cost a single composite layer. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="dot-grid absolute inset-0 opacity-[0.55]" />
        <div className="absolute -left-24 top-6 h-64 w-64 rounded-full bg-blue-400/15 blur-[80px]" />
        <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-indigo-400/15 blur-[90px]" />
      </div>

      <div className="shell band relative">
        <div
          className={`grid items-center gap-7 ${hasArt ? "lg:grid-cols-2 lg:gap-12" : "max-w-3xl"}`}
        >
          {hasArt && (
            <Reveal variant="slide-left" className="order-2 lg:order-1">
              <div className="relative">
                <div
                  className={`img-frame relative aspect-[4/3] overflow-hidden rounded-[26px] shadow-[0_36px_70px_-40px_rgba(15,23,42,0.5)] sm:aspect-[5/4] ${ART_ANIMATION[config.characterAnimation]}`}
                >
                  <SafeImage
                    src={config.characterImage}
                    alt={config.characterAlt}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
                {/* Ring accent behind the artwork, offset so it reads as
                    depth rather than a border. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-3 -right-3 -z-10 h-full w-full rounded-[26px] border border-blue-300/45 dark:border-blue-500/25"
                />
              </div>
            </Reveal>
          )}

          <div className={hasArt ? "order-1 lg:order-2" : ""}>
            <Reveal>
              <p className="eyebrow">{config.storyEyebrow}</p>
              <h2 className="font-display mt-2 text-[24px] font-black leading-[1.1] tracking-[-0.03em] text-slate-900 [text-wrap:balance] dark:text-white sm:text-[34px]">
                {config.storyHeading}
              </h2>
              <p className="mt-3 max-w-[54ch] text-[14px] leading-relaxed text-slate-600 dark:text-slate-300 sm:text-[15px]">
                {config.storyBody}
              </p>
            </Reveal>

            {config.storyStats.length > 0 && (
              <Reveal delay={90}>
                <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {config.storyStats.map((stat, index) => (
                    <div
                      key={`${stat.label}-${index}`}
                      className="rounded-2xl bg-white/85 p-3 text-center shadow-[0_0_0_1px_rgba(15,23,42,0.07)] transition-transform duration-300 hover:-translate-y-0.5 dark:bg-slate-900/80 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                    >
                      <dt className="font-display text-[20px] font-black leading-none tracking-[-0.02em] text-blue-700 dark:text-blue-400 sm:text-[24px]">
                        {stat.value}
                      </dt>
                      <dd className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            )}

            {config.storyCtaLabel && config.storyCtaHref && (
              <Reveal delay={140}>
                <Link
                  href={config.storyCtaHref}
                  className="shine-on-hover mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-[13px] font-black tracking-wide text-white transition-transform duration-200 hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"
                >
                  {config.storyCtaLabel} <span className="nudge-x">→</span>
                </Link>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
