import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import WishlistView from "@/components/WishlistView";
import { getCurrentCustomer } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Wishlist",
  description: "The products you have saved for later.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <BackButton />
          <h1 className="mt-4 text-2xl font-bold">Please log in</h1>
          <Link href="/login?redirect=/wishlist" className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Login</Link>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6"><BackButton /></div>
      <WishlistView />
    </AppShell>
  );
}
