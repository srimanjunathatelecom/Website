import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One empty state for the whole site.
 *
 * The cart, wishlist and compare pages each had their own hand-rolled version:
 * different headings, different button colours (blue pill vs near-black pill),
 * different vertical rhythm, and in the cart's case no <h1> at all, so an empty
 * cart had no page heading for screen readers or for anyone skimming. They now
 * share this component, so an empty page looks deliberate rather than broken.
 *
 * `title` renders as the page's <h1> by default, which is correct on pages
 * where the empty state replaces the entire page body. Pass headingLevel="h2"
 * when it sits inside a page that already has its own <h1>.
 */
export default function EmptyState({
  icon,
  title,
  message,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  headingLevel = "h1",
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center sm:py-24">
      {icon && (
        <div
          className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700"
          aria-hidden
        >
          {icon}
        </div>
      )}

      <Heading className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
        {title}
      </Heading>

      {message && (
        <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base dark:text-slate-400">
          {message}
        </p>
      )}

      {(primaryHref || secondaryHref) && (
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          {primaryHref && primaryLabel && (
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {primaryLabel}
            </Link>
          )}
          {secondaryHref && secondaryLabel && (
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800"
            >
              {secondaryLabel}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
