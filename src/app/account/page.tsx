import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import AccountDashboard from "@/components/AccountDashboard";
import { getCurrentCustomer } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Account",
  description: "Your orders, saved details and account settings.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <BackButton />
          <h1 className="mt-4 text-2xl font-bold">Please log in</h1>
          <p className="mt-2 text-slate-500">Log in to view your orders, bookings and wishlist.</p>
          <Link href="/login?redirect=/account" className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Login / Sign up</Link>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <BackButton />
      </div>
      <AccountDashboard user={{ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }} />
    </AppShell>
  );
}
