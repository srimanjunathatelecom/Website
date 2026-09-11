import BrandGrid from "@/components/repair/BrandGrid";
import Breadcrumbs from "@/components/repair/Breadcrumbs";
import { getRepairBrands } from "@/lib/repair/queries";
import type { Metadata } from "next";

// Step 1 of the repair flow. The brand list changes only when the owner edits it
// in Admin, and it carries no per-visitor or purchase-critical data (no stock,
// no price), so it can be cached far longer than a PDP. Five minutes keeps an
// Admin change visible quickly without a DB read per visitor.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Mobile Repair — Select Your Brand",
  description:
    "Choose your phone brand to see the repairs we offer for your model — screen, battery, charging port, camera and more. No payment to book.",
  alternates: { canonical: "/repair" },
};

export default async function RepairBrandsPage() {
  const brands = await getRepairBrands();

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Repair" }]} />
        <BrandGrid brands={brands} />
    </div>
  );
}
