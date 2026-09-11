import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import TrackClient from "@/components/TrackClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Your Order",
  description: "Enter your order number to see its current status.",
  alternates: { canonical: "/track" },
  // The form itself is harmless, but its results are somebody's order status;
  // there is nothing here worth ranking for and a crawler following order
  // numbers is not a thing to invite.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function TrackPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <TrackClient />
    </AppShell>
  );
}
