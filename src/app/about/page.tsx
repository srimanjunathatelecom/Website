import { Phone } from "lucide-react";
import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import { getContent, getOutlets, getSettings } from "@/lib/queries";
import type { Metadata } from "next";

// Static content page, admin-edited rarely.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const about = await getContent("about");
  return {
    title: about?.title || "About Us",
    description: about?.body ? about.body.slice(0, 155) : "Learn more about our stores and what we offer.",
    alternates: { canonical: "/about" },
  };
}

export default async function AboutPage() {
  const [about, outlets, settings] = await Promise.all([getContent("about"), getOutlets(), getSettings()]);
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-3xl font-extrabold">{about?.title || "About Us"}</h1>
        <div className="mt-4 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{about?.body}</div>

        <div className="mt-8 grid place-items-center rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-500 p-8 text-center text-white">
          <p className="text-2xl font-extrabold sm:text-3xl">We sell at MOP, not MRP</p>
          <p className="mt-1">{settings?.tagline}</p>
        </div>

        <h2 className="mt-8 text-xl font-bold">Our Outlets</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {outlets.map((o) => (
            <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-bold">{o.name}</p>
              <p className="mt-1 text-sm text-slate-500">{o.addressLine}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm"><Phone aria-hidden className="h-3.5 w-3.5 text-slate-400" /> {o.contact}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
