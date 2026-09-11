import Link from "next/link";
import { ChevronDown, Phone, MapPin, CheckCircle2, HelpCircle } from "lucide-react";
import SafeImage from "./SafeImage";
import SectionHead from "./SectionHead";
import type { ServiceFaqConfig } from "@/lib/homepageConfig";

type FaqOutlet = {
  id: number;
  name: string;
  contact: string | null;
  isMain?: boolean | null;
};

type FaqService = {
  id: number;
  name: string;
  deviceTypes: string | null;
};

/**
 * Repair FAQ plus a "talk to a technician" card.
 *
 * Built on native <details>/<summary> rather than React state on purpose:
 * the answers are static text, so this stays a server component with zero
 * client JS, opens correctly before hydration, is keyboard-operable and
 * screen-reader-announced for free, and — importantly for a page that
 * wants to rank — the answer text is in the HTML whether or not it is
 * expanded.
 *
 * The right-hand card is generated from live data, not written copy: the
 * device coverage line is derived from the deviceTypes column of the
 * services table, and the phone numbers come from the outlets table. So
 * when the shopkeeper adds a laptop-only service or changes an outlet
 * number in the admin panel, this card follows without anyone editing
 * copy that would otherwise quietly go stale.
 */
export default function ServiceFaq({
  eyebrow,
  title,
  items,
  helpTitle,
  helpBody,
  outlets,
  services,
  bookHref = "/services",
}: {
  eyebrow: string;
  title: string;
  items: ServiceFaqConfig[];
  helpTitle: string;
  helpBody: string;
  outlets: FaqOutlet[];
  services: FaqService[];
  /** On /services itself this points at the booking form anchor instead. */
  bookHref?: string;
}) {
  if (!items.length) return null;

  // deviceTypes is a free-text column the shopkeeper types into ("Mobile,
  // Laptop"), so split on commas, trim, and de-duplicate case-insensitively
  // while keeping the first spelling actually entered — that way "mobile"
  // and "Mobile" collapse into one chip instead of appearing twice.
  const deviceTypes: string[] = [];
  const seenDevice = new Set<string>();
  for (const s of services) {
    for (const part of (s.deviceTypes || "").split(",")) {
      const label = part.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seenDevice.has(key)) continue;
      seenDevice.add(key);
      deviceTypes.push(label);
    }
  }

  const phoneOutlets = outlets.filter((o) => (o.contact || "").trim());

  return (
    <section className="shell band-tight">
      <SectionHead eyebrow={eyebrow} title={title} accent="brand" href="/faq" hrefLabel="Full FAQ" />

      {/* items-start matters here: by default the two grid columns stretch
          to equal height, and because the help card is taller than six
          collapsed questions, the accordion container grew a block of
          empty white space below the last question that looked like a
          rendering fault. Both columns now take their natural height. */}
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_340px] lg:gap-6">
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {items.map((item, i) => (
            <details key={i} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3.5 px-5 py-4 transition-colors hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                {/* A small numbered chip per question. It gives the stack a
                    left-hand rhythm and a spot of colour, and turns solid
                    blue while the answer is open so the expanded row is
                    obvious at a glance in a list of six. */}
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-[11.5px] font-black text-blue-700 ring-1 ring-blue-100 transition-colors group-open:bg-blue-700 group-open:text-white group-open:ring-blue-700 dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-700"
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-[14px] font-bold leading-snug text-slate-900 transition-colors group-open:text-blue-800 dark:text-white dark:group-open:text-blue-300">
                  {item.question}
                </span>
                <ChevronDown
                  className="h-[18px] w-[18px] shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180 group-open:text-blue-700 dark:group-open:text-blue-400"
                  aria-hidden="true"
                />
              </summary>
              {/* The left rule ties the answer visually to its numbered
                  chip above, so a long answer does not float free of the
                  question it belongs to. */}
              <div className="ml-[46px] mr-5 mb-4 border-l-2 border-blue-100 pl-3.5 dark:border-slate-700">
                <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{item.answer}</p>
              </div>
            </details>
          ))}
        </div>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
          {/* The photograph is the point of this card: "call and ask" is a
              much easier thing to do when there is a visible person on the
              other end of it. The gradient at the base of the frame lets
              the heading below sit against the image without a hard seam. */}
          <div className="relative h-32 overflow-hidden">
            <SafeImage
              src="/images/svc-callback.jpg"
              alt="An SMS Stores technician taking a customer call at the service counter"
              className="h-full w-full object-cover object-[center_28%]"
              sizes="(max-width: 1024px) 100vw, 340px"
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-slate-50 via-slate-50/10 to-transparent dark:from-slate-900 dark:via-slate-900/10"
            />
            <span
              aria-hidden
              className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-xl bg-blue-700/90 text-white shadow-lg shadow-blue-900/30"
            >
              <HelpCircle className="h-[18px] w-[18px]" strokeWidth={2.1} />
            </span>
          </div>

          <div className="px-5 pb-5">
          <p className="font-display text-[15.5px] font-extrabold leading-tight tracking-[-0.01em] text-slate-900 dark:text-white">
            {helpTitle}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{helpBody}</p>

          {deviceTypes.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-500">
                We service
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {deviceTypes.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-bold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                  >
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {phoneOutlets.length > 0 && (
            <div className="mt-4 space-y-2">
              {phoneOutlets.map((o) => (
                <a
                  key={o.id}
                  href={`tel:${o.contact}`}
                  className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200 transition hover:ring-blue-400 dark:bg-slate-800 dark:ring-slate-700 dark:hover:ring-blue-500/50"
                >
                  <Phone className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block clamp-2 text-[12.5px] font-bold leading-[15px] text-slate-900 dark:text-white">
                      {o.name}
                    </span>
                    <span className="block text-[12px] font-semibold text-slate-500">{o.contact}</span>
                  </span>
                </a>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={bookHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-blue-800"
            >
              Book a repair <span className="nudge-x">→</span>
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-300 px-5 py-2.5 text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Outlet details
            </Link>
          </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
