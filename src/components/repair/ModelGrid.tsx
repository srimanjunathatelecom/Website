"use client";

import { useMemo, useState } from "react";
import ModelCard from "./ModelCard";
import NoResults from "./NoResults";
import SearchInput from "./SearchInput";
import StepHeading from "./StepHeading";
import { matchesQuery, type RepairBrand, type RepairModel } from "@/lib/repair/types";

/**
 * Step 2 of the repair flow: Select Model.
 *
 * Same shape as BrandGrid — data in, cards out, no model named anywhere in the
 * markup — but the search box matters far more here. A brand list is twenty
 * items you can scan; Samsung alone has over thirty models, and the reference
 * site's own answer to that is a search field, so this one filters on every
 * keystroke against the already-loaded array.
 *
 * Columns run 2 -> 3 -> 4 -> 5 -> 7, which covers the brief's targets for this
 * step (2 on mobile, 3-5 on tablet, 6-7 on desktop) at all six test widths:
 * 375px/2, 480px/2, 768px/4, 1024px/5, 1280px and 1440px/7.
 *
 * Model cards are taller than brand cards because they hold a portrait handset
 * render plus a name, so the mobile breakpoint stays at 2 rather than climbing
 * to 3 the way the brand grid does — three portrait renders across a 480px
 * screen leaves each one too small to tell a Galaxy S23 from an S22.
 */
export default function ModelGrid({
  brand,
  models,
}: {
  brand: RepairBrand;
  models: RepairModel[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => models.filter((m) => matchesQuery(m.name, query)),
    [models, query]
  );

  return (
    <section aria-labelledby="select-model-heading">
      <StepHeading title="Select Model">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search your model"
          label={`Search ${brand.name} models`}
          resultCount={filtered.length}
        />
      </StepHeading>
      <span id="select-model-heading" className="sr-only">
        Select your {brand.name} model
      </span>

      {models.length === 0 ? (
        // The brand is listed as repairable but has no models yet. Saying so,
        // with a way to reach a human, beats an empty grid — the shop can still
        // take the job over the phone.
        <p className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center text-[14px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
          We are still listing {brand.name} models. Please call the shop and we
          will confirm whether we service your device.
        </p>
      ) : filtered.length === 0 ? (
        <NoResults query={query} noun="models" onClear={() => setQuery("")} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 md:grid-cols-4 md:gap-3.5 lg:grid-cols-5 xl:grid-cols-7">
          {filtered.map((model, i) => (
            <li key={model.id}>
              <ModelCard
                model={model}
                href={`/repair/${brand.slug}/${model.slug}`}
                // First row at the widest breakpoint (xl:grid-cols-7).
                //
                // Cutting this to `i < 2` (the first row on a phone) looked
                // obviously right and measured as nothing: over Fast 3G at
                // 390x844 with 4x CPU throttling and 11 distinct photos, LCP
                // went 2584ms -> 2556ms, inside run-to-run noise, while the
                // last image actually finished *later* (2285ms -> 2386ms).
                // This page ships ~68kB of images, so bandwidth is not the
                // constraint and there is nothing for the preloads to steal.
                // Left as it was; see docs/performance-audit.md section 8.
                priority={i < 7}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
