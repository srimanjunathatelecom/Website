import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * HOME / SAMSUNG / GALAXY Z FOLD 5 / SERVICES
 *
 * Uppercased in CSS rather than in the data, so the accessible name and the
 * document title keep their real casing ("Galaxy Z Fold 5", not "GALAXY Z FOLD
 * 5" — which some screen readers spell out letter by letter).
 *
 * On narrow screens the middle crumbs are hidden and only the last two remain.
 * A four-level breadcrumb at 375px either wraps to three lines or scrolls
 * sideways, and neither is worth the space on a page whose next tap is right
 * below it.
 */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          // Keep the first crumb, the last, and the one before it; drop the
          // middle on mobile.
          const hideOnMobile = !isLast && i !== 0 && i !== items.length - 2;
          return (
            <li
              key={`${item.label}-${i}`}
              className={`flex items-center gap-x-1.5 ${hideOnMobile ? "hidden sm:flex" : "flex"}`}
            >
              {i > 0 && (
                <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-slate-300" />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="max-w-[14ch] truncate transition-colors duration-150 hover:text-blue-700 sm:max-w-none dark:hover:text-blue-300"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="max-w-[18ch] truncate text-slate-600 sm:max-w-none dark:text-slate-300"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
