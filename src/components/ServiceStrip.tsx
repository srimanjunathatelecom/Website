"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  BatteryCharging,
  CalendarCheck,
  CircuitBoard,
  Clock,
  DatabaseBackup,
  Droplets,
  HardDrive,
  Laptop,
  MapPin,
  MonitorSmartphone,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import SafeImage from "./SafeImage";
import SectionHead from "./SectionHead";
import ShelfRail, { RailButtons, type ShelfRailHandle } from "./ShelfRail";

export type StripService = {
  id?: number | string;
  name: string;
  description?: string | null;
  deviceTypes?: string | null;
  startPrice?: string | null;
  turnaround?: string | null;
};

/**
 * Icon resolution is keyword-based rather than a fixed list, because the
 * shopkeeper can add, rename or remove services from Admin > Services at
 * any time. A brand-new service the code has never seen still gets a
 * sensible icon (or the generic wrench) instead of a blank circle, so the
 * admin never has to touch code to add one.
 *
 * Order matters — the first matching entry wins, so put the more specific
 * keywords above the generic ones ("motherboard" before "board").
 */
const ICON_RULES: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ["screen", "display", "lcd", "glass", "touch"], icon: MonitorSmartphone },
  { keywords: ["battery", "charging", "charge", "power"], icon: BatteryCharging },
  { keywords: ["water", "liquid", "moisture"], icon: Droplets },
  { keywords: ["motherboard", "chip", "circuit", "ic", "component"], icon: CircuitBoard },
  { keywords: ["data recovery", "recover", "backup"], icon: DatabaseBackup },
  { keywords: ["os", "software", "windows", "reinstall", "format"], icon: HardDrive },
  { keywords: ["laptop", "notebook", "computer"], icon: Laptop },
  { keywords: ["sim", "network", "cellular", "call", "mic", "speaker"], icon: PhoneCall },
  { keywords: ["mobile", "phone", "smartphone"], icon: Smartphone },
];

// Escape anything that would otherwise be read as a regex operator, since
// these keywords are short and a future edit could easily introduce a "."
// or "+" that silently turns into a wildcard.
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function iconFor(service: StripService): LucideIcon {
  const haystack = `${service.name || ""} ${service.description || ""}`.toLowerCase();
  for (const rule of ICON_RULES) {
    if (
      rule.keywords.some((kw) =>
        // Whole-word match, NOT a plain substring test. Short keywords like
        // "os", "ic" and "sim" appear inside unrelated ordinary words —
        // "diagnosis" and "cost" both contain "os", "service" contains
        // "ic", "similar" contains "sim" — so `includes()` handed out
        // confidently wrong icons depending only on rule order.
        new RegExp(`\\b${escapeRegex(kw)}\\b`).test(haystack)
      )
    ) {
      return rule.icon;
    }
  }
  return Wrench;
}

const HIGHLIGHT_ICONS: LucideIcon[] = [Clock, ShieldCheck, Wrench, MapPin];

/* Each reassurance gets its own colour rather than four identical amber
   chips, which read as one repeated element and gave the eye no reason to
   move along the row. */
const HIGHLIGHT_TONES = [
  "bg-amber-400/15 text-amber-300 ring-amber-300/25",
  "bg-emerald-400/15 text-emerald-300 ring-emerald-300/25",
  "bg-sky-400/15 text-sky-300 ring-sky-300/25",
  "bg-violet-400/15 text-violet-300 ring-violet-300/25",
];

/* The service tiles cycle through the same four hues. The price line under
   each tile deliberately stays amber throughout: on this site amber means
   "price/offer", and colouring the figures differently per tile would
   break a rule the rest of the pages follow. */
const TILE_TONES = [
  "text-amber-300 group-hover/item:text-amber-200 group-hover/item:ring-amber-300/50",
  "text-emerald-300 group-hover/item:text-emerald-200 group-hover/item:ring-emerald-300/50",
  "text-sky-300 group-hover/item:text-sky-200 group-hover/item:ring-sky-300/50",
  "text-violet-300 group-hover/item:text-violet-200 group-hover/item:ring-violet-300/50",
];

/**
 * The repair/servicing strip — the first section on the homepage, placed
 * deliberately above "Shop by category".
 *
 * Why it leads the page: servicing is the part of this business that
 * competing storefronts do not have, and it is the reason a customer with
 * a broken phone visits at all. Putting it first, on a dark band, makes it
 * the one section that cannot be scrolled past, while the product
 * categories immediately below still catch shoppers who came to buy.
 *
 * Every service tile is generated from the live `services` table, so the
 * strip stays in sync with Admin > Services with no code change: rename a
 * service, change its price or turnaround, add a seventh one, or set it
 * inactive, and this strip follows. All surrounding copy comes from
 * Admin > Storefront > Homepage CMS.
 */
export default function ServiceStrip({
  services,
  eyebrow,
  title,
  subtitle,
  buttonLabel,
  highlights = [],
}: {
  services?: StripService[];
  eyebrow: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  highlights?: string[];
}) {
  const railRef = useRef<ShelfRailHandle>(null);
  const [edge, setEdge] = useState({ atStart: true, atEnd: true });

  const list = (services || []).filter((s) => s && s.name);

  // With no services configured at all there is nothing honest to show,
  // and an empty dark band at the very top of the page would look broken.
  // Render nothing rather than invent placeholder repairs.
  if (list.length === 0) return null;

  return (
    <section className="relative overflow-hidden border-b border-slate-800/70 bg-[#0b1120]">
      {/* A real photograph of the workbench, held right back at low opacity
          and masked out toward the left. It gives the band texture and
          says "workshop" before a word is read, without competing with the
          copy: the frame was composed with its empty half on the right,
          which is where the service tiles sit, so nothing lands on top of
          the busy tools. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] opacity-[0.22] md:block">
        <SafeImage
          src="/images/svc-bench-wide.jpg"
          alt=""
          className="h-full w-full object-cover"
          sizes="62vw"
        />
        <span className="absolute inset-0 bg-gradient-to-r from-[#0b1120] via-[#0b1120]/55 to-transparent" />
      </span>

      {/* Fine hatch over the top — a technical, drafting-paper texture,
          which reads differently from the dotted grid used by the mid-page
          ink blocks so the two dark bands are not the same surface twice. */}
      <span aria-hidden className="hatch pointer-events-none absolute inset-0 opacity-70" />

      {/* Drifting warm/cool blooms. Amber ties the band to the colour the
          rest of the site reserves for offers and service pricing; the
          cool blue keeps it from going sepia. */}
      {/* Kept at low alpha and pushed above/outside the content box on
          purpose. At a higher opacity the amber blob sat directly behind
          the first service tile and read as a solid orange disc rather than
          as ambient light behind the band. */}
      <span aria-hidden className="aurora opacity-60">
        <span className="-left-40 -top-40 h-80 w-80 bg-amber-500/[0.12]" />
        <span className="left-[42%] -top-32 h-72 w-72 bg-blue-500/[0.10]" />
        <span className="-right-24 top-[55%] h-64 w-64 bg-indigo-500/[0.10]" />
      </span>

      <div className="relative shell band">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          href="/services"
          hrefLabel="All services"
          accent="amber"
          tone="ink"
          className="mb-5 sm:mb-6"
          actions={
            <RailButtons
              onPrev={() => railRef.current?.scrollByPage(-1)}
              onNext={() => railRef.current?.scrollByPage(1)}
              atStart={edge.atStart}
              atEnd={edge.atEnd}
              tone="ink"
              label="services"
            />
          }
        />

        <ShelfRail ref={railRef} onEdgeChange={setEdge} gapClass="gap-4 sm:gap-6" padClass="pb-1 pt-1">
          {/* Booking tile first. It mirrors the geometry of a service tile
              exactly — same circle, same three text rows — so the row reads
              as one set instead of a button bolted onto a list. */}
          <Link
            href="/services"
            className="category-rise group/item flex w-[104px] shrink-0 flex-col items-center gap-2.5 text-center sm:w-[116px]"
            style={{ ["--i" as string]: 0 }}
          >
            <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-[#0b1120] shadow-lg shadow-amber-500/25 ring-1 ring-amber-300/40 transition-all duration-200 group-hover/item:-translate-y-1 group-hover/item:shadow-xl group-hover/item:shadow-amber-500/40 sm:h-[96px] sm:w-[96px]">
              <CalendarCheck className="h-8 w-8" strokeWidth={2} />
            </div>
            {/* min-h matches the service tiles' two reserved title lines so
                the amber line below sits on the same baseline as their
                price row, instead of floating half a line higher. */}
            <span className="clamp-2 min-h-[36px] text-[12.5px] font-bold leading-[18px] tracking-tight text-white sm:text-[13px]">
              {buttonLabel}
            </span>
            <span className="text-[11.5px] font-extrabold leading-tight text-amber-300">
              No advance payment
            </span>
          </Link>

          {list.map((s, i) => {
            const Icon = iconFor(s);
            return (
              <Link
                key={s.id ?? `${s.name}-${i}`}
                href="/services"
                title={s.description || s.name}
                className="category-rise group/item flex w-[104px] shrink-0 flex-col items-center gap-2.5 text-center sm:w-[116px]"
                style={{ ["--i" as string]: i + 1 }}
              >
                <div
                  className={`grad-ring grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full bg-white/[0.07] ring-1 ring-white/15 transition-all duration-200 group-hover/item:-translate-y-1 group-hover/item:bg-white/[0.12] sm:h-[96px] sm:w-[96px] ${
                    TILE_TONES[i % TILE_TONES.length]
                  }`}
                >
                  <Icon className="h-8 w-8" strokeWidth={1.7} />
                </div>

                {/* Two lines reserved, clamped to two, so a long
                    admin-entered name like "Laptop OS Reinstall &
                    Optimisation" cannot push the price row out of
                    alignment with its neighbours. */}
                <span className="clamp-2 min-h-[36px] text-[12.5px] font-bold leading-[18px] tracking-tight text-white transition-colors group-hover/item:text-amber-200 sm:text-[13px]">
                  {s.name}
                </span>

                {/* startPrice is free text in the database ("From ₹1,200",
                    "Price on inspection"), so it is printed as-is rather
                    than parsed — the shopkeeper stays in control of the
                    wording. */}
                <span className="clamp-1 text-[11.5px] font-extrabold leading-tight text-amber-300">
                  {s.startPrice || ""}
                </span>

                {s.turnaround ? (
                  <span className="clamp-1 rounded-full bg-white/[0.07] px-2 py-[3px] text-[10.5px] font-semibold leading-tight text-slate-300 ring-1 ring-white/10">
                    {s.turnaround}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </ShelfRail>

        {/* Reassurance row. These are claims the shop actually makes
            elsewhere on the site (turnaround from the services table, the
            30-day service warranty from the warranty policy page,
            component-level repair from the service descriptions, and the
            two real outlets), surfaced here so a visitor with a broken
            device does not have to go looking for them. Fully editable
            from the Homepage CMS. */}
        {highlights.length > 0 ? (
          <ul className="mt-6 grid gap-2.5 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.slice(0, 4).map((text, i) => {
              const Icon = HIGHLIGHT_ICONS[i] || ShieldCheck;
              return (
                <li key={`${text}-${i}`} className="flex items-center gap-2.5">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ${
                      HIGHLIGHT_TONES[i % HIGHLIGHT_TONES.length]
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <span className="text-[12.5px] font-semibold leading-snug text-slate-200 sm:text-[13px]">
                    {text}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
