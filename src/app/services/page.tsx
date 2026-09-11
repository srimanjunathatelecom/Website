import AppShell from "@/components/AppShell";
import ServicesShowcase from "@/components/ServicesShowcase";
import ServiceProcess from "@/components/ServiceProcess";
import ServiceFaq from "@/components/ServiceFaq";
import Reveal from "@/components/Reveal";
import { getServices, getOutlets } from "@/lib/queries";
import { db } from "@/db";
import { contentPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HOME_CONFIG_SLUG, parseHomePageConfig } from "@/lib/homepageConfig";
import RepairFlowCallout from "@/components/repair/RepairFlowCallout";
import type { Metadata } from "next";

// Content-page-style, admin-edited rarely — a longer revalidate window
// than PDP is appropriate since nothing here is purchase-time-critical
// stock/price data.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Repair & Service Booking",
  description: "Book a mobile repair or service — screen, battery, water damage and more, same-day at our outlets.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const [services, outlets, homePageContent] = await Promise.all([
    getServices(),
    getOutlets(),
    db.select().from(contentPages).where(eq(contentPages.slug, HOME_CONFIG_SLUG)).then((rows) => rows[0] || null).catch(() => null),
  ]);
  // The process steps and FAQ copy are the same admin-editable content the
  // homepage uses (Admin > Homepage CMS), so the two pages never tell a
  // customer two different stories about how a repair works.
  const homeConfig = parseHomePageConfig(homePageContent?.body);

  return (
    <AppShell>
      <ServicesShowcase
        services={services as any}
        outlets={outlets as any}
        whyTitle="Why fix it at SMS Stores?"
        whyPoints={homeConfig.serviceStripHighlights}
      />
      <div className="mt-8">
        <RepairFlowCallout />
      </div>
      <Reveal>
        <ServiceProcess
          eyebrow={homeConfig.processEyebrow}
          title={homeConfig.processTitle}
          subtitle={homeConfig.processSubtitle}
          steps={homeConfig.processSteps}
          footnote={homeConfig.processFootnote}
          buttonLabel={homeConfig.serviceStripButtonLabel}
          bookHref="#book"
        />
      </Reveal>
      <Reveal>
        <ServiceFaq
          eyebrow={homeConfig.serviceFaqEyebrow}
          title={homeConfig.serviceFaqTitle}
          items={homeConfig.serviceFaqItems}
          helpTitle={homeConfig.serviceFaqHelpTitle}
          helpBody={homeConfig.serviceFaqHelpBody}
          outlets={outlets as any}
          services={services as any}
          bookHref="#book"
        />
      </Reveal>
      {/* Closing CTA — same truthful claims as the booking flow itself. */}
      <Reveal>
        <section className="mx-auto max-w-7xl px-4 pb-12 pt-2 sm:px-6">
          <div className="relative grid place-items-center overflow-hidden rounded-3xl bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-700 p-9 text-center text-white shadow-2xl shadow-indigo-900/20 sm:p-12">
            <span aria-hidden className="aurora opacity-60">
              <span className="-left-16 -top-16 h-72 w-72 bg-sky-400/30" />
              <span className="right-[-4%] bottom-[-30%] h-64 w-64 bg-indigo-400/30" />
            </span>
            <div className="relative">
              <h2 className="font-display text-2xl font-black tracking-tight sm:text-3xl">Broken today? Booked in a minute.</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-blue-100">
                No payment to book — we call you, confirm the price, and only then start the repair.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a href="#book" className="rounded-full bg-white px-7 py-3 text-sm font-black text-slate-900 transition hover:-translate-y-0.5 hover:bg-sky-300">
                  Book a repair
                </a>
                <a href="/track" className="rounded-full border border-white/50 px-7 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-white hover:bg-white/10">
                  Track an existing repair
                </a>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    </AppShell>
  );
}
