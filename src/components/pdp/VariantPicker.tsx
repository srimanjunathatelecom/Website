"use client";

import SafeImage from "../SafeImage";
import type { VariantMatrix } from "@/lib/productContent";

/**
 * Colour + configuration selectors driven entirely by the real variant rows.
 *
 * A combination that was never created in Admin is rendered disabled, so the
 * shopper can never land on an invalid pair. Availability is communicated with
 * text and ARIA state as well as colour, never colour alone.
 */
export default function VariantPicker({
  matrix,
  selectedColor,
  selectedConfig,
  onColor,
  onConfig,
}: {
  matrix: VariantMatrix;
  selectedColor: string;
  selectedConfig: string;
  onColor: (c: string) => void;
  onConfig: (c: string) => void;
}) {
  if (!matrix.colors.length && !matrix.configs.length) return null;

  return (
    <div className="space-y-5">
      {matrix.configs.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
            RAM + Storage:{" "}
            <span className="text-blue-600 dark:text-blue-400">{selectedConfig || "Select"}</span>
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="RAM and storage">
            {matrix.configs.map((cfg) => {
              const pairExists = matrix.exists(cfg.label, selectedColor);
              const pairSellable = matrix.sellable(cfg.label, selectedColor);
              // Unavailable with the current colour, but pickable on its own —
              // choosing it moves the colour to one that exists.
              const disabled = !cfg.sellable;
              const active = selectedConfig === cfg.label;
              const note = !cfg.sellable
                ? "Unavailable"
                : !pairExists
                  ? "Not in this colour"
                  : !pairSellable
                    ? "Out of stock"
                    : "";
              return (
                <button
                  key={cfg.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  onClick={() => onConfig(cfg.label)}
                  className={`rounded-xl border-[1.5px] px-4 py-2 text-left text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-slate-200 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                  } ${disabled ? "cursor-not-allowed opacity-45 line-through" : ""}`}
                >
                  {cfg.label}
                  {note && (
                    <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 no-underline">
                      {note}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {matrix.colors.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">
            Colour:{" "}
            <span className="text-blue-600 dark:text-blue-400">{selectedColor || "Select"}</span>
          </legend>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Colour">
            {matrix.colors.map((c) => {
              const pairExists = selectedConfig ? matrix.exists(selectedConfig, c.name) : true;
              const pairSellable = selectedConfig ? matrix.sellable(selectedConfig, c.name) : c.sellable;
              const disabled = !c.sellable;
              const active = selectedColor === c.name;
              const note = !c.sellable
                ? "Unavailable"
                : !pairExists
                  ? `Not with ${selectedConfig}`
                  : !pairSellable
                    ? "Out of stock"
                    : "";
              return (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  title={note ? `${c.name} — ${note}` : c.name}
                  onClick={() => onColor(c.name)}
                  className={`group flex flex-col items-center gap-1.5 focus:outline-none ${
                    disabled ? "cursor-not-allowed" : ""
                  }`}
                >
                  <span
                    className={`relative grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 shadow-inner transition group-focus-visible:ring-2 group-focus-visible:ring-blue-600 group-focus-visible:ring-offset-2 ${
                      active
                        ? "border-blue-600 ring-2 ring-blue-600/30"
                        : "border-slate-200 group-hover:border-slate-400 dark:border-slate-700"
                    } ${disabled ? "opacity-45" : ""}`}
                    style={c.swatchImage ? undefined : { backgroundColor: c.hex }}
                  >
                    {c.swatchImage && (
                      <SafeImage src={c.swatchImage} alt="" className="h-full w-full object-cover" sizes="44px" />
                    )}
                    {/* Selection is also marked with a check, not colour alone. */}
                    {active && (
                      <svg viewBox="0 0 24 24" className="relative h-4 w-4 text-white drop-shadow" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {disabled && (
                      <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
                        <span className="h-[2px] w-full rotate-45 bg-rose-500/80" />
                      </span>
                    )}
                  </span>
                  <span
                    className={`max-w-[84px] truncate text-[11.5px] font-semibold ${
                      active ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {c.name}
                  </span>
                  {note && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{note}</span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
