import { SearchX } from "lucide-react";

/**
 * Shown when a search filters everything out.
 *
 * A blank area below a search box reads as a broken page — the customer cannot
 * tell whether nothing matched or nothing loaded. Naming the query they typed
 * makes the cause obvious, and the clear action gets them out in one tap
 * instead of making them select and delete the text.
 */
export default function NoResults({
  query,
  noun,
  onClear,
}: {
  query: string;
  /** e.g. "brands", "models" — used in the message. */
  noun: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <SearchX aria-hidden className="mx-auto h-7 w-7 text-slate-400" />
      <p className="mt-3 text-[15px] font-bold text-slate-800 dark:text-slate-100">
        No {noun} found
      </p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        Nothing matches{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          “{query}”
        </span>
        . Check the spelling, or clear the search to see everything we repair.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        Clear search
      </button>
    </div>
  );
}
