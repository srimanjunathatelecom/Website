import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import CompareClient from "@/components/CompareClient";
import type { Metadata } from "next";

// The comparison set lives in the visitor's own browser, so there is nothing
// stable here for a search engine to index.
export const metadata: Metadata = {
  title: "Compare Products",
  description: "Compare specifications, prices and features side by side.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function ComparePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <BackButton />
      </div>
      <CompareClient />
    </AppShell>
  );
}