import { ExternalLink, Mail, Phone } from "lucide-react";
import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import ContactForm from "@/components/ContactForm";
import { getOutlets, getSettings } from "@/lib/queries";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch — outlet addresses, phone numbers and a contact form for questions or support.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const [outlets, settings] = await Promise.all([getOutlets(), getSettings()]);
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-extrabold">Contact Us</h1>
        <p className="mt-1 text-slate-500">Both outlets are open {outlets[0]?.hoursOpen}–{outlets[0]?.hoursClose}, all 7 days.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {outlets.map((o) => (
              <div key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <iframe
                  title={o.name}
                  loading="lazy"
                  className="h-48 w-full"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(o.addressLine)}&output=embed`}
                />
                <div className="p-4">
                  <p className="font-bold">{o.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{o.addressLine}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm"><Phone aria-hidden className="h-3.5 w-3.5 text-slate-400" /> <a href={`tel:${o.contact}`} className="font-medium text-blue-600">{o.contact}</a></p>
                  <p className="flex items-center gap-1.5 text-sm"><Mail aria-hidden className="h-3.5 w-3.5 text-slate-400" /> {o.email}</p>
                  {o.mapsUrl && (
                    <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[24px] items-center text-sm font-semibold text-blue-600 hover:underline">Open in Maps <ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>
                  )}
                </div>
              </div>
            ))}
            {settings?.whatsappNumber && (
              <a href={`https://wa.me/91${settings.whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Hi SMS Stores")}`} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-emerald-500 py-3 text-center font-semibold text-white hover:bg-emerald-600">
                Chat on WhatsApp
              </a>
            )}
          </div>
          <ContactForm />
        </div>
      </div>
    </AppShell>
  );
}
