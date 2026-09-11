import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import Link from "next/link";
import { getContent } from "@/lib/queries";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// Static legal/help content, admin-edited rarely.
export const revalidate = 300;

const LINKS = [
  { slug: "terms-and-conditions", label: "Terms & Conditions" },
  { slug: "privacy-policy", label: "Privacy Policy" },
  { slug: "warranty-policy", label: "Warranty & Replacement" },
  { slug: "shipping-policy", label: "Shipping Policy" },
  { slug: "faq", label: "FAQ" },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getContent(slug);
  const known = LINKS.find((l) => l.slug === slug);
  if (!page && !known) {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }
  return {
    title: page?.title || known?.label || "Policy",
    description: page?.body ? page.body.slice(0, 155) : undefined,
    alternates: { canonical: `/policy/${slug}` },
  };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getContent(slug);

  // Any slug at all used to render the "being updated" panel with an HTTP
  // 200, so /policy/anything looked like a real page. A slug we don't
  // publish is a 404; a slug we do publish whose copy hasn't been written
  // yet keeps the friendly placeholder, because that one really is a page
  // that exists and is simply empty.
  if (!page && !LINKS.some((l) => l.slug === slug)) notFound();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-3xl font-extrabold">{page?.title || "Policy"}</h1>
        {page ? (
          <div className="mt-4 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{page.body}</div>
        ) : (
          <p className="mt-4 text-slate-500">This page is being updated. Please check back soon.</p>
        )}
        <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          {LINKS.filter((l) => l.slug !== slug).map((l) => (
            <Link key={l.slug} href={`/policy/${l.slug}`} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
