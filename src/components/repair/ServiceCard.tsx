"use client";

import CardImage from "./CardImage";
import type { RepairService } from "@/lib/repair/types";

/**
 * One repair in the Select Service grid.
 *
 * Deliberately NOT built on SelectionCard. The reference lays this out
 * horizontally — bordered image box on the left, name and a "Select" button
 * stacked on the right — and the card carries a real button inside it. Making
 * the whole card clickable as well would nest an interactive element inside an
 * interactive element, which is invalid HTML and gives keyboard users two stops
 * that do the same thing.
 *
 * So the button is the only control, and the surrounding card is presentational.
 * Clicking anywhere on the card still works, via a click handler on the wrapper
 * that is not itself focusable — a mouse convenience layered over a keyboard
 * path that already works.
 */
export default function ServiceCard({
  service,
  onSelect,
  selected = false,
  /** Compact variant used inside the Popular Repaired Services carousel. */
  compact = false,
}: {
  service: RepairService;
  onSelect: (service: RepairService) => void;
  selected?: boolean;
  compact?: boolean;
}) {
  // h-full matters more than it looks: grid rows stretch the <li>, but without
  // this the card inside only grows to its own content, so one repair whose name
  // wraps to a second line leaves its neighbours visibly shorter. Since the
  // owner can name a repair anything from Admin, the layout has to survive
  // "Handsfree Connector Jack Replacement" without the grid going ragged — the
  // same failure the brand grid hit with four glyph captions.
  const shell =
    "flex h-full items-center gap-3 rounded-[10px] border bg-white p-2.5 transition-[transform,box-shadow,border-color] duration-200 ease-out " +
    "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.18)] " +
    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-slate-900 dark:hover:border-slate-600";
  const state = selected
    ? "border-blue-600 ring-2 ring-blue-600/25"
    : "border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-slate-800";

  if (compact) {
    // Carousel variant: stacked, narrower, no Select button — the whole card is
    // one button, because in a scrolling rail a small secondary target inside a
    // moving card is a mis-tap waiting to happen.
    return (
      <button
        type="button"
        onClick={() => onSelect(service)}
        title={service.name}
        className={`${shell} !flex-col !items-stretch !gap-2 w-full text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${state}`}
      >
        <span className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800">
          <CardImage
            src={service.image}
            alt={service.imageAlt}
            heightClass="h-[74px]"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 150px"
          />
        </span>
        <span className="line-clamp-2 px-1 pb-1 text-[12px] font-semibold leading-snug text-slate-700 dark:text-slate-200">
          {service.name}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`${shell} ${state}`}
      onClick={() => onSelect(service)}
      role="presentation"
    >
      <span className="w-[86px] shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800">
        <CardImage
          src={service.image}
          alt={service.imageAlt}
          heightClass="h-[80px]"
          sizes="90px"
        />
      </span>
      <span className="flex min-w-0 flex-col items-start gap-2">
        <span
          title={service.name}
          className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-800 dark:text-slate-100"
        >
          {service.name}
        </span>
        <button
          type="button"
          onClick={(e) => {
            // The wrapper also handles clicks; without this the handler would
            // fire twice for one press.
            e.stopPropagation();
            onSelect(service);
          }}
          aria-label={`Select ${service.name}`}
          className="rounded-[5px] bg-blue-700 px-4 py-1.5 text-[12.5px] font-bold text-white transition-colors duration-150 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          {selected ? "Selected" : "Select"}
        </button>
      </span>
    </div>
  );
}
