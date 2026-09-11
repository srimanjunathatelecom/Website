"use client";

/**
 * The /services experience — a merchandised, photo-led service storefront.
 * Intentionally separate from RepairServicesShowcase (the homepage teaser
 * rail) — both read the same services table via getServices().
 *
 * Composition (top to bottom):
 *   1. Dark hero with rotating device word, truthful proof stats and a
 *      "Book a repair" CTA that scrolls to the booking form.
 *   2. Category chips derived from the real `services.category` values
 *      (no hardcoded category list) with live counts.
 *   3. Photo-led service cards using each service's real, licence-verified
 *      repair photograph. Services without a photo (e.g. laptop services)
 *      fall back to the same icon treatment as before — nothing breaks
 *      when admin adds a service without an image. Every card's "Book"
 *      button selects that service in the booking form and scrolls to it.
 *   4. The existing ServiceBooking form (unchanged flow, coordinated with
 *      the catalog above it).
 *   5. A featured-service spotlight (admin's `featured` flag), a "Why
 *      SMS Stores" band built only from claims the site already makes
 *      (CMS-driven serviceStripHighlights), and a closing CTA.
 *
 * All names, prices, turnarounds, categories and photos come from the
 * services table (Admin > Services). Nothing here invents a price, a
 * turnaround or a guarantee.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BatteryCharging,
  Camera,
  CircuitBoard,
  Clock,
  Droplets,
  HardDrive,
  IndianRupee,
  Keyboard,
  Laptop,
  Layers,
  MapPin,
  Monitor,
  PlugZap,
  Settings2,
  ShieldCheck,
  Volume2,
  Wrench,
} from "lucide-react";
import ServiceBooking from "@/components/ServiceBooking";
import AutoImage from "@/components/AutoImage";
import Reveal from "@/components/Reveal";

type Service = {
  id: number;
  name: string;
  description: string;
  deviceTypes: string;
  startPrice: string;
  turnaround: string;
  image?: string | null;
  imageAlt?: string | null;
  category?: string | null;
  featured?: boolean | null;
  badge?: string | null;
  ctaLabel?: string | null;
};

type Outlet = { id: number; name: string };

/** Keyword → icon mapping so services without a photo still get a face. */
function iconFor(name: string) {
  const n = name.toLowerCase();
  if (/(screen|display|glass|touch)/.test(n)) return Monitor;
  if (/(battery|charging health)/.test(n)) return BatteryCharging;
  if (/(water|liquid|damage)/.test(n)) return Droplets;
  if (/(board|mother|ic|chip|logic)/.test(n)) return CircuitBoard;
  if (/(camera|lens)/.test(n)) return Camera;
  if (/(speaker|mic|audio|sound|ear|ringer)/.test(n)) return Volume2;
  if (/(charge|charging|port|connector)/.test(n)) return PlugZap;
  if (/(software|os|update|unlock|flash)/.test(n)) return Settings2;
  if (/(data|recovery|storage|ssd|hard)/.test(n)) return HardDrive;
  if (/(keyboard|keypad|hinge)/.test(n)) return Keyboard;
  if (/(laptop|macbook|notebook)/.test(n)) return Laptop;
  if (/(back glass|panel|body|frame|housing)/.test(n)) return Layers;
  return Wrench;
}

const ROTATING = ["phone", "laptop", "tablet", "smartwatch"];

const FALLBACK_CATEGORY = "Other";

export default function ServicesShowcase({
  services,
  outlets,
  whyTitle = "Why fix it at SMS Stores?",
  whyPoints = [],
}: {
  services: Service[];
  outlets: Outlet[];
  whyTitle?: string;
  whyPoints?: string[];
}) {
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [word, setWord] = useState(0);
  const bookRef = useRef<HTMLDivElement>(null);

  // Rotating device word in the hero headline. Skipped entirely for
  // reduced-motion visitors — they see the static word "device".
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setWord((w) => (w + 1) % ROTATING.length), 2600);
    return () => clearInterval(t);
  }, [reduced]);

  // Category chips from the data itself, in first-seen (admin sort) order.
  const categoryChips = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of services) {
      const label = (s.category || "").trim() || FALLBACK_CATEGORY;
      seen.set(label, (seen.get(label) || 0) + 1);
    }
    return Array.from(seen.entries());
  }, [services]);

  const visible = useMemo(
    () =>
      category === "all"
        ? services
        : services.filter((s) => (((s.category || "").trim() || FALLBACK_CATEGORY) === category)),
    [services, category]
  );

  const featuredService = useMemo(
    () => services.find((s) => s.featured && s.image),
    [services]
  );

  function book(id: number) {
    setSelected(id);
    bookRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  return (
    <>
      {/* ---- HERO ---- */}
      <section className="relative overflow-hidden bg-[#0b1120] text-white">
        <span aria-hidden className="aurora opacity-50">
          <span className="-left-20 -top-24 h-96 w-96 bg-blue-500/25" />
          <span className="right-[-6%] bottom-[-30%] h-80 w-80 bg-indigo-500/25" />
        </span>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] [background-size:26px_26px]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-300">
            Repairs &amp; Servicing
          </p>
          <h1 className="font-display mt-2 max-w-3xl text-3xl font-black leading-[1.08] tracking-tight sm:text-5xl">
            We bring your{" "}
            <span className="relative inline-block align-baseline text-sky-400">
              {reduced ? "device" : ROTATING[word]}
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-sky-400/60" />
            </span>{" "}
            back to life.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Honest diagnosis by real technicians at both our Bengaluru outlets.
            You approve the price before any work starts.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => book(selected ?? services[0]?.id ?? 0)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-black text-slate-900 shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:bg-sky-400 hover:text-slate-900"
            >
              Book a repair <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
            <a
              href="/track"
              className="rounded-full border border-white/30 px-7 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white/10"
            >
              Track a repair
            </a>
          </div>

          {/* Proof stats — every figure is real: counts from the DB, the
              warranty and payment claims from existing site policy. */}
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Wrench, k: `${services.length}+`, v: "repair services" },
              { icon: MapPin, k: String(outlets.length), v: "Bengaluru outlets" },
              { icon: ShieldCheck, k: "30-day", v: "repair warranty" },
              { icon: IndianRupee, k: "₹0", v: "to book — pay after quote" },
            ].map((s) => (
              <div key={s.v} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <s.icon aria-hidden className="h-4 w-4 text-sky-400" />
                <dt className="sr-only">{s.v}</dt>
                <dd className="mt-2 text-xl font-black tracking-tight">{s.k}</dd>
                <dd className="text-[11px] font-semibold text-slate-400">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- CATALOG ---- */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-700 dark:text-blue-300">
              What&apos;s broken?
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Pick a repair to get started
            </h2>
          </div>
        </div>

        {/* Category chips, from real data, with live counts. */}
        {categoryChips.length > 1 && (
          <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter services by category">
            <button
              onClick={() => setCategory("all")}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                category === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              All repairs · {services.length}
            </button>
            {categoryChips.map(([c, count]) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                  category === c
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {c} · {count}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <Reveal variant="none" className="stagger-in grid content-start gap-4 sm:grid-cols-2">
            {visible.map((s) => {
              const Icon = iconFor(s.name);
              const active = selected === s.id;
              return (
                <div
                  key={s.id}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:shadow-xl hover:shadow-blue-900/[0.08] dark:bg-slate-900 ${
                    reduced ? "" : "hover:-translate-y-0.5"
                  } ${
                    active
                      ? "border-blue-500 ring-2 ring-blue-500/30 dark:border-blue-400"
                      : "border-slate-200 hover:border-blue-200 dark:border-slate-800"
                  }`}
                >
                  {/* Photo when the service has one; icon panel when not. */}
                  {s.image ? (
                    <div className="relative h-40 overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <AutoImage
                        src={s.image}
                        alt={s.imageAlt || s.name}
                        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 350px"
                        className={`object-cover ${reduced ? "" : "transition-transform duration-[1100ms] ease-out group-hover:scale-[1.06]"}`}
                      />
                      {s.badge ? (
                        <span className="absolute left-3 top-3 rounded-full bg-slate-900/85 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                          {s.badge}
                        </span>
                      ) : null}
                      {s.category ? (
                        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-800 dark:bg-slate-900/85 dark:text-slate-100">
                          {s.category}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex h-24 items-center gap-3 bg-gradient-to-r from-slate-50 to-blue-50/50 px-4 dark:from-slate-800/60 dark:to-slate-800/30">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                        <Icon aria-hidden className="h-6 w-6 text-blue-700 dark:text-blue-300" />
                      </span>
                      {s.category ? (
                        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{s.category}</span>
                      ) : null}
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-bold leading-snug">{s.name}</p>
                    <p className="clamp-2 mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {s.description}
                    </p>
                    <div className="mt-auto flex items-end justify-between pt-3">
                      <div>
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{s.startPrice}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                          <Clock aria-hidden className="h-3 w-3" /> {s.turnaround}
                        </p>
                      </div>
                      <button
                        onClick={() => book(s.id)}
                        className={`rounded-full px-4 py-2 text-xs font-black transition ${
                          active
                            ? "bg-blue-700 text-white"
                            : "bg-slate-900 text-white hover:bg-blue-700 dark:bg-white dark:text-slate-900 dark:hover:bg-blue-400"
                        }`}
                      >
                        {active ? "Selected ✓" : s.ctaLabel || "Book"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 sm:col-span-2">
                No services listed in this category yet — pick &ldquo;All repairs&rdquo; or describe the fault in the booking form.
              </p>
            )}
          </Reveal>

          <div ref={bookRef} id="book" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
            <ServiceBooking services={services} outlets={outlets} syncServiceId={selected} />
          </div>
        </div>
      </section>

      {/* ---- FEATURED SPOTLIGHT ---- */}
      {featuredService && (
        <Reveal>
          <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
            <div className="grid overflow-hidden rounded-3xl bg-[#0b1120] text-white ring-1 ring-slate-900/10 md:grid-cols-2">
              <div className="relative min-h-[240px] md:min-h-[340px]">
                <AutoImage
                  src={featuredService.image as string}
                  alt={featuredService.imageAlt || featuredService.name}
                  sizes="(max-width: 768px) 100vw, 620px"
                  className="object-cover"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1120]/60 to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#0b1120]" />
              </div>
              <div className="relative p-6 sm:p-9">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-sky-300">Featured repair</p>
                <h2 className="font-display mt-2 text-2xl font-black tracking-tight sm:text-3xl">{featuredService.name}</h2>
                <p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-slate-300">{featuredService.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-lg font-black text-emerald-300">{featuredService.startPrice}</span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-300">
                    <Clock aria-hidden className="h-3.5 w-3.5" /> {featuredService.turnaround}
                  </span>
                </div>
                <button
                  onClick={() => book(featuredService.id)}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-sky-400"
                >
                  {featuredService.ctaLabel || "Book this repair"} <ArrowRight aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </Reveal>
      )}

      {/* ---- WHY SMS STORES ---- */}
      {whyPoints.length > 0 && (
        <Reveal>
          <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <h2 className="text-xl font-black tracking-tight sm:text-2xl">{whyTitle}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {whyPoints.slice(0, 4).map((p) => (
                <div key={p} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <BadgeCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-[13px] font-semibold leading-relaxed text-slate-700 dark:text-slate-200">{p}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}
    </>
  );
}
