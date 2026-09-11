"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";

/**
 * The shared shell behind BrandCard, ModelCard and ServiceCard.
 *
 * One place owns the border, radius, shadow, hover lift, focus ring and
 * selected state, so the three grids cannot drift apart visually — which is
 * what happens when each card type carries its own copy of the same nine
 * Tailwind classes and only two of them get updated.
 *
 * It renders a real <Link> when given `href` and a real <button> otherwise.
 * That matters more than it looks: the brand and model steps are navigation
 * (they must be middle-clickable, shareable, and crawlable), while picking a
 * service is an action on the current page. A <div onClick> would have been one
 * component instead of two branches, and would have broken open-in-new-tab,
 * keyboard activation and screen-reader semantics all at once.
 *
 * ── Interaction feedback ────────────────────────────────────────────────────
 *
 * The card used to style hover and nothing else. On a phone, where hover does
 * not exist, that meant a tap produced no visual acknowledgement whatsoever —
 * the reported "did my click actually work?" in its purest form. Two things
 * changed:
 *
 *  1. `.press-surface` adds a `:active` scale-down and `touch-action:
 *     manipulation`. The latter is the more valuable of the two: it drops the
 *     ~300ms that mobile browsers hold a tap for while they wait to see whether
 *     it becomes a double-tap-to-zoom. That delay was real, measurable click
 *     latency on every card on the site, and it cost one CSS declaration to
 *     remove.
 *
 *  2. `PendingIndicator` reads `useLinkStatus`, which reports whether *this*
 *     link's navigation is still in flight. The card stays visibly held down and
 *     grows a thin progress bar along its bottom edge until the next route
 *     commits. Scoping it to the clicked card is the point — a global top-of-page
 *     spinner tells you the app is busy; this tells you that the thing you
 *     pressed is what it is busy with.
 *
 * `useLinkStatus` must be called from a component rendered *inside* the
 * <Link>, which is why the indicator is a separate child component and not a
 * hook call in this function body.
 *
 * Both effects are `transform`/`opacity` only, so neither can trigger layout,
 * and both are disabled under prefers-reduced-motion.
 */

function PendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      {/* The card's own held-down state is driven off the presence of this
          element, via `.press-surface:has(.nav-pending-bar)` in globals.css. */}
      <span className="nav-pending-bar" aria-hidden />
      {/* Announced once, not on a timer: assistive tech should hear "loading"
          once when the navigation starts, not repeatedly while it runs. */}
      <span className="sr-only" role="status">
        Loading
      </span>
    </>
  );
}

/** The <Link> branch, kept separate purely to keep the main function readable. */
function PendingLink({
  href,
  title,
  ariaLabel,
  cls,
  children,
}: {
  href: string;
  title?: string;
  ariaLabel?: string;
  cls: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} title={title} aria-label={ariaLabel} className={cls}>
      {children}
      <PendingIndicator />
    </Link>
  );
}

export default function SelectionCard({
  href,
  onClick,
  selected = false,
  title,
  ariaLabel,
  className = "",
  children,
}: {
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  /** Native tooltip — carries the full text when a long name is truncated. */
  title?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const base =
    "press-surface group relative flex flex-col overflow-hidden rounded-[10px] border bg-white text-left " +
    "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.18)] " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 " +
    "motion-reduce:hover:translate-y-0 " +
    "dark:bg-slate-900 dark:hover:border-slate-600";

  // The selected state is a ring plus a border colour, not a background fill:
  // these cards are mostly image, and tinting the card would fight the logo or
  // product shot sitting on top of it.
  const state = selected
    ? "border-blue-600 ring-2 ring-blue-600/25 shadow-[0_6px_16px_-6px_rgba(29,78,216,0.35)]"
    : "border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-800";

  const cls = `${base} ${state} ${className}`;

  if (href) {
    return (
      <PendingLink href={href} title={title} ariaLabel={ariaLabel} cls={cls}>
        {children}
      </PendingLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={selected}
      className={cls}
    >
      {children}
    </button>
  );
}
