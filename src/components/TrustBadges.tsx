import type { TrustBadgeConfig } from "@/lib/homepageConfig";
import { DEFAULT_HOME_CONFIG } from "@/lib/homepageConfig";

const ICONS: Record<TrustBadgeConfig["iconKey"], React.ReactNode> = {
  shield: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 12l1.8 1.8L14.5 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  card: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 15h4" strokeLinecap="round" />
    </svg>
  ),
  wrench: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 3.3a1 1 0 011.4 1.4l-2 2 3.2 3.2 2-2a1 1 0 011.4 1.4l-5 5a1 1 0 01-1.4-1.4l1-1-3.2-3.2-1 1a1 1 0 01-1.4-1.4z" />
      <path d="M9 15l-5.5 5.5" strokeLinecap="round" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4v6h6M20 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 10a8 8 0 0114-5M20 14a8 8 0 01-14 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  "map-pin": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  ),
};

export default function TrustBadges({ items = DEFAULT_HOME_CONFIG.trustBadges }: { items?: TrustBadgeConfig[] }) {
  return (
    <section className="shell band">
      {/* Icon-left rows rather than the old centred icon-above-text cards.
          Five centred cards each needed ~150px of height for two short
          lines of text, which turned a supporting reassurance strip into
          one of the tallest blocks on the page. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {items.map((b, index) => (
          <div
            key={`${b.title}-${index}`}
            className="group flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-[0_0_0_1px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(30,64,175,0.2),0_14px_28px_-20px_rgba(15,23,42,0.3)] dark:bg-slate-900 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07)] sm:p-4"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 transition-colors duration-200 group-hover:bg-blue-700 group-hover:text-white dark:bg-blue-500/10 dark:text-blue-400">
              <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]">{ICONS[b.iconKey] || ICONS.shield}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                {b.title}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">{b.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
