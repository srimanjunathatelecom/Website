import Link from "next/link";
import { CalendarCheck, PhoneCall, Wrench, PackageCheck, ShieldCheck } from "lucide-react";
import SectionHead from "./SectionHead";
import type { ProcessStepConfig } from "@/lib/homepageConfig";

/**
 * "How a repair works" — the four steps a booking actually passes through.
 *
 * This is deliberately not a generic marketing "our process" block. The
 * four stages map one-to-one onto the four booking statuses the shop
 * already uses in Admin > Bookings (Booked, In Progress, Ready,
 * Delivered), which are the same statuses a customer later sees on the
 * Track page. So the promise made here is the promise the system can
 * actually keep — if the shopkeeper marks a job "Ready", the customer has
 * already been told what that word means.
 *
 * The single biggest reason a repair booking gets abandoned is not price,
 * it is not knowing what happens after you hit submit: whether you owe
 * money now, whether someone will call, whether the device disappears for
 * a week. Each step answers one of those.
 */

// Fixed icons rather than admin-chosen ones: the steps are a fixed
// four-stage lifecycle, not a list that grows, so an icon picker in the
// admin panel would be a setting the shopkeeper can only get wrong.
const STEP_ICONS = [CalendarCheck, PhoneCall, Wrench, PackageCheck];

/**
 * A colour per step, warming from blue through to green.
 *
 * This is not decoration for its own sake: the progression gives the row a
 * direction, so it reads as a journey that ends somewhere good rather than
 * four identical blue boxes. Green on the last step is the same colour the
 * site already uses for "done" and for prices, which is exactly what
 * "ready to collect" means.
 */
const STEP_TONES = [
  {
    circle: "from-blue-600 to-indigo-600 shadow-blue-600/30",
    label: "text-blue-700 dark:text-blue-400",
    border: "hover:border-blue-300 dark:hover:border-blue-500/40",
    tint: "bg-blue-500/[0.07]",
  },
  {
    circle: "from-indigo-600 to-violet-600 shadow-violet-600/30",
    label: "text-violet-700 dark:text-violet-400",
    border: "hover:border-violet-300 dark:hover:border-violet-500/40",
    tint: "bg-violet-500/[0.07]",
  },
  {
    circle: "from-cyan-600 to-teal-600 shadow-teal-600/30",
    label: "text-teal-700 dark:text-teal-400",
    border: "hover:border-teal-300 dark:hover:border-teal-500/40",
    tint: "bg-teal-500/[0.07]",
  },
  {
    circle: "from-emerald-600 to-green-600 shadow-emerald-600/30",
    label: "text-emerald-700 dark:text-emerald-400",
    border: "hover:border-emerald-300 dark:hover:border-emerald-500/40",
    tint: "bg-emerald-500/[0.07]",
  },
];

export default function ServiceProcess({
  eyebrow,
  title,
  subtitle,
  steps,
  footnote,
  buttonLabel,
  bookHref = "/services",
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: ProcessStepConfig[];
  footnote: string;
  buttonLabel: string;
  /** On /services itself this points at the booking form anchor instead. */
  bookHref?: string;
}) {
  if (!steps.length) return null;

  return (
    <section className="relative overflow-hidden">
      {/* Section-wide decoration, behind everything: squared paper plus two
         slow blooms that pick up the first and last step colours, so the
         band has some depth instead of sitting on flat page grey. */}
      <span aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-60 dark:hidden" />
      <span aria-hidden className="aurora opacity-60 dark:opacity-40">
        <span className="left-[2%] top-[10%] h-72 w-72 bg-blue-300/30" />
        <span className="right-[4%] bottom-[4%] h-72 w-72 bg-emerald-300/25" />
      </span>

      <div className="relative shell band-tight">
      <SectionHead eyebrow={eyebrow} title={title} subtitle={subtitle} accent="brand" />

      <div className="relative mt-7">
        {/* The connecting line is decorative and sits behind the cards, so
            only the segments crossing the gaps between them are visible.
            top-[44px] is not arbitrary: the cards use p-5 (20px) and the
            icon circle is h-12 (48px), so 20 + 24 puts the line exactly
            through the centre of every icon and the visible stubs read as
            connectors between the four circles. At an unaligned height
            they just look like stray marks. Hidden below lg, where the
            steps stack vertically and a horizontal rule means nothing. */}
        {/* draw-x traces the line from left to right when the section
            scrolls into view, so the four steps read as a sequence being
            followed rather than four boxes that happen to be adjacent. It
            is a decorative aria-hidden layer and is disabled outright under
            prefers-reduced-motion. The gradient now runs blue → green to
            match the step colours it connects. */}
        <div
          aria-hidden="true"
          className="draw-x absolute left-[7%] right-[7%] top-[44px] hidden h-[2px] rounded-full bg-gradient-to-r from-blue-300 via-violet-300 to-emerald-300 lg:block dark:from-blue-500/50 dark:via-violet-500/50 dark:to-emerald-500/50"
        />

        <ol className="stagger-in relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i] || Wrench;
            const tone = STEP_TONES[i % STEP_TONES.length];
            return (
              <li
                key={i}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 ${tone.border}`}
              >
                {/* Faint corner wash in the step's own colour, so the card
                    is tinted rather than plain white but the body text
                    keeps its full contrast. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl ${tone.tint}`}
                />
                <div className="relative flex items-center gap-3">
                  {/* Number and icon together: the number carries the
                      sequence, the icon makes the step scannable without
                      reading. The halo behind the circle pulses gently so
                      the row has a little life at rest, not only on hover. */}
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center">
                    <span
                      aria-hidden
                      className={`halo absolute inset-0 rounded-full bg-gradient-to-br ${tone.circle} blur-md`}
                    />
                    <span
                      className={`relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-105 ${tone.circle}`}
                    >
                      <Icon className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
                    </span>
                  </span>
                  <span className={`font-display text-[11px] font-black uppercase tracking-[0.14em] ${tone.label}`}>
                    Step {i + 1}
                  </span>
                </div>
                <p className="font-display relative mt-3.5 text-[15.5px] font-extrabold leading-tight tracking-[-0.01em] text-slate-900 dark:text-white">
                  {step.title}
                </p>
                <p className="relative mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {step.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href={bookHref}
          className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-6 py-3 text-[13px] font-bold text-white shadow-lg shadow-blue-700/25 transition hover:-translate-y-0.5 hover:bg-blue-800"
        >
          {buttonLabel} <span className="nudge-x">→</span>
        </Link>
        {footnote && (
          <p className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-600 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            {footnote}
          </p>
        )}
      </div>
      </div>
    </section>
  );
}
