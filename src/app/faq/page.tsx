import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import { getContent } from "@/lib/queries";
import type { Metadata } from "next";

// Static content page, admin-edited rarely.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const faq = await getContent("faq");
  return {
    title: faq?.title || "FAQ & Help",
    description: "Frequently asked questions and help topics — orders, delivery, returns and more.",
    alternates: { canonical: "/faq" },
  };
}

export default async function FaqPage() {
  const [faq, help] = await Promise.all([getContent("faq"), getContent("help")]);
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-3xl font-extrabold">{faq?.title || "FAQ & Help"}</h1>
        {faq?.body && <div className="mt-4 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{faq.body}</div>}

        {help?.body && (
          <>
            <h2 className="mt-8 text-xl font-bold">{help.title}</h2>
            <div className="mt-3 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{help.body}</div>
          </>
        )}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="font-semibold">Still need help?</p>
          <p className="mt-1 text-slate-500">Reach either outlet by phone, email or WhatsApp (see the Contact page). Our team is happy to assist.</p>
        </div>
      </div>
    </AppShell>
  );
}
