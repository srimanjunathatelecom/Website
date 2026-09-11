"use client";

import { useMemo, useState } from "react";
import BrandCard from "./BrandCard";
import NoResults from "./NoResults";
import SearchInput from "./SearchInput";
import StepHeading from "./StepHeading";
import { matchesQuery, type RepairBrand } from "@/lib/repair/types";

/**
 * Step 1 of the repair flow: Select Brand.
 *
 * Every brand is rendered from the `brands` array — there is no per-brand markup
 * anywhere in this file, so a brand added in Admin appears here with no code
 * change. That is the whole point of the data architecture behind it.
 *
 * The grid's column counts are pinned to the reference at each width rather than
 * left to auto-fit. Auto-fit with a min track width drifts to 10-11 columns on a
 * wide screen, which makes the logos small enough to be hard to identify, and
 * the identifiability of the logo is the only reason this step is a grid of
 * images instead of a dropdown.
 *
 * The progression 2 -> 3 -> 5 -> 6 -> 9 hits every width in the brief:
 * 375px/2, 480px/3, 768px/5, 1024px/6, 1280px and 1440px/9. `min-[420px]` is an
 * arbitrary breakpoint because the jump to 3 columns needs to happen below
 * Tailwind's `sm`, or a 480px phone still shows two.
 *
 * 1024px counts as tablet here rather than desktop, which is why it gets 6 and
 * not the 7 a plain `lg` reading would give. The model and service grids draw the
 * line in the same place, so the three steps stay in proportion to one another as
 * the window narrows instead of one collapsing a breakpoint earlier.
 */
export default function BrandGrid({ brands }: { brands: RepairBrand[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => brands.filter((b) => matchesQuery(b.name, query)),
    [brands, query]
  );

  return (
    <section aria-labelledby="select-brand-heading">
      <StepHeading title="Select Brand">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search your brand"
          label="Search your brand"
          resultCount={filtered.length}
        />
      </StepHeading>
      <span id="select-brand-heading" className="sr-only">
        Select the brand of the device you need repaired
      </span>

      {brands.length === 0 ? (
        // Distinct from "no search results": nothing is marked repairable yet.
        // Saying so is more useful to the owner than an empty grid, and more
        // honest to a customer than a broken-looking page.
        <p className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center text-[14px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
          Our repair brand list is being updated. Please call the shop and we will
          confirm whether we service your device.
        </p>
      ) : filtered.length === 0 ? (
        <NoResults query={query} noun="brands" onClear={() => setQuery("")} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 md:grid-cols-5 md:gap-3.5 lg:grid-cols-6 xl:grid-cols-9">
          {filtered.map((brand, i) => (
            <li key={brand.id}>
              <BrandCard
                brand={brand}
                href={`/repair/${brand.slug}`}
                // Only the first row is above the fold; eager-loading the rest
                // would compete with it for bandwidth on a mobile connection.
                priority={i < 9}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
