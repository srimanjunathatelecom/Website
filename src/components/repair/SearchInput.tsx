"use client";

import { Search, X } from "lucide-react";
import { useId } from "react";

/**
 * The "Search your brand" / "Search your model" field.
 *
 * Filtering is done by the parent against an already-loaded array, so there is
 * no debounce and no request per keystroke here — the whole list is in memory
 * and filtering it is cheaper than scheduling a timer. Debouncing would only
 * add latency to something that is already instant.
 *
 * The visible <label> is screen-reader-only because the reference shows a bare
 * field with a placeholder. A placeholder is not an accessible name (it
 * disappears on input and is skipped by some readers), so the label exists in
 * the markup regardless.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  resultCount,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  /** Announced politely so keyboard/AT users hear the list shrink as they type. */
  resultCount?: number;
}) {
  const id = useId();

  return (
    <div className="w-full sm:max-w-[420px]">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="search"
          role="searchbox"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-4 pr-11 text-[14px] text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-colors duration-150 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-slate-800"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : (
          <Search
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
          />
        )}
      </div>
      {resultCount != null && (
        <p aria-live="polite" className="sr-only">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </p>
      )}
    </div>
  );
}
