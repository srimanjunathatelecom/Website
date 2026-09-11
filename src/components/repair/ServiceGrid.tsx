"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import SearchInput from "./SearchInput";
import ServiceCard from "./ServiceCard";
import PopularServicesCarousel from "./PopularServicesCarousel";
import RepairBookingPanel from "./RepairBookingPanel";
import {
  matchesQuery,
  type RepairBrand,
  type RepairModel,
  type RepairService,
} from "@/lib/repair/types";

/**
 * Step three: the repair grid, plus the confirm panel that appears once a repair
 * is chosen.
 *
 * Columns run 1 / 2 / 3 — one on phones, two on tablets including 1024px, three
 * from 1280px up, matching the reference at desktop widths. Three of these cards
 * across a 1024px tablet leaves each about 320px wide, which is not enough for
 * an image, a two-line name and a button without the name clamping on almost
 * every repair. These cards are horizontal (image left, name and Select
 * button right) so they need real width; squeezing two onto a 375px screen would
 * clip the name to a couple of words, and "Camera replacement (front)" and
 * "Camera replacement (back)" are not safe to tell apart from their first two
 * words.
 *
 * Every card is generated from the services passed in, so a repair the owner
 * adds in Admin appears here with no code change. Nothing in this file names an
 * individual repair.
 */
export default function ServiceGrid({
  brand,
  model,
  services,
  popular,
  outlets,
}: {
  brand: RepairBrand;
  model: RepairModel;
  services: RepairService[];
  /** Owner-flagged shortcuts. The grid below is still the full list. */
  popular: RepairService[];
  outlets: { id: number; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // A repair chosen before signing in comes back as ?service=<id>.
  //
  // Confirming a booking requires an account, and a guest only finds that out
  // when they press Confirm. Before this, the sign-in redirect pointed at the
  // bare model URL, so they returned with nothing selected and had to find
  // their repair in the list a second time — after already choosing a brand, a
  // model and a repair. Carrying the id in the URL rather than in component
  // state is what makes it survive the round trip through /login, and it is
  // read here rather than in an effect so the panel is present in the very
  // first render instead of appearing a moment later.
  const searchParams = useSearchParams();
  const resumeId = Number(searchParams.get("service")) || 0;
  const [selected, setSelected] = useState<RepairService | null>(
    () => services.find((s) => s.id === resumeId) ?? null
  );

  // Only for the resumed case: the panel sits below a grid that can be several
  // screens tall, so landing at the top of the page would look like the sign-in
  // had lost their choice after all. Selections made by tapping a card are
  // scrolled by `choose` instead.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !resumeId || !panelRef.current) return;
    resumed.current = true;
    panelRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resumeId]);

  const visible = useMemo(
    () =>
      // Category is matched as well as name, using the same matcher the brand and
      // model steps use: "battery" should still find a repair the owner renamed
      // to "Power cell swap" if they filed it under Battery.
      services.filter(
        (s) => matchesQuery(s.name, query) || matchesQuery(s.category || "", query)
      ),
    [services, query]
  );

  function choose(service: RepairService) {
    setSelected(service);
    // The panel renders below a grid that can be several screens tall, so a
    // selection made at the bottom would otherwise look like nothing happened.
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  }

  return (
    <section aria-labelledby="service-heading">
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <h1
          id="service-heading"
          className="font-display text-[26px] font-extrabold tracking-tight text-slate-900 sm:text-[32px] lg:text-[36px] dark:text-white"
        >
          Select Service
        </h1>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search repairs"
          label="Search repairs"
          resultCount={visible.length}
        />
      </div>

      {/* Hidden while searching: a fixed rail of popular repairs sitting above
          filtered results would contradict them, showing repairs the query just
          excluded. */}
      {!query && (
        <PopularServicesCarousel
          services={popular}
          onSelect={choose}
          selectedId={selected?.id ?? null}
        />
      )}

      {visible.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-[14px] text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          No repairs match “{query}”. Try “screen”, “battery” or “camera”.
        </p>
      ) : (
        <ul
          aria-label="All repairs"
          className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 xl:grid-cols-3 xl:gap-3.5"
        >
          {visible.map((service) => (
            <li key={service.id}>
              <ServiceCard
                service={service}
                onSelect={choose}
                selected={selected?.id === service.id}
              />
            </li>
          ))}
        </ul>
      )}

      <div ref={panelRef} className="mt-6 scroll-mt-24">
        {selected && (
          <RepairBookingPanel
            brand={brand}
            model={model}
            service={selected}
            outlets={outlets}
            onCancel={() => setSelected(null)}
          />
        )}
      </div>
    </section>
  );
}
