import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";

/**
 * Entry point to the device-first repair flow, shown on /services.
 *
 * The nav and footer links to /repair are defaults in siteConfig, which an owner
 * who has already edited their menus in Admin will never see. This is the one
 * link that does not depend on that, placed on the page a customer looking for a
 * repair already lands on.
 *
 * It is additive on purpose. The booking form below it still works, still posts
 * to the same endpoint, and is still the right answer for a device that is not
 * in the catalogue — so this offers the faster route without removing the one
 * that has been taking bookings all along.
 */
export default function RepairFlowCallout() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <Link
        href="/repair"
        className="group flex flex-col gap-3 rounded-[10px] border border-slate-200 bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-blue-300 hover:shadow-[0_6px_16px_-6px_rgba(15,23,42,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
      >
        <div className="flex items-start gap-3 sm:items-center">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Smartphone aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[15px] font-bold text-slate-900 sm:text-[16px] dark:text-white">
              Find your exact device
            </p>
            <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">
              Pick your brand and model to see the repairs and prices for it.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-blue-700 px-4 py-2 text-[13.5px] font-bold text-white transition-colors duration-150 group-hover:bg-blue-800 sm:self-auto">
          Choose your device
          <ArrowRight
            aria-hidden
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </span>
      </Link>
    </div>
  );
}
