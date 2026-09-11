import AppShell from "@/components/AppShell";
import BackButton from "@/components/BackButton";
import CartView from "@/components/CartView";
import type { Metadata } from "next";

// Basket and the pages after it are personal and should never be indexed,
// and the tab needs to say which page this is when several are open.
export const metadata: Metadata = {
  title: "Your Cart",
  description: "Review the items in your cart and continue to checkout.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <BackButton />
      </div>
      <CartView />
    </AppShell>
  );
}
