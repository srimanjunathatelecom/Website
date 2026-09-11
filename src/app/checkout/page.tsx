import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import CheckoutClient from "@/components/CheckoutClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm your delivery address and place your order.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <BackButton />
      </div>
      <CheckoutClient />
    </AppShell>
  );
}
