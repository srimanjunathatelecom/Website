import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Breadcrumbs from "@/components/repair/Breadcrumbs";
import ModelGrid from "@/components/repair/ModelGrid";
import { getModelsForBrand, getRepairBrandBySlug } from "@/lib/repair/queries";

/**
 * Step 2 of the repair flow: Select Model, for one brand.
 *
 * The models are read here, on the server, and handed to the grid as props.
 * That ordering is deliberate and the codebase has already learned it once —
 * lib/queries.ts carries a note about the storefront brand rail, which used to
 * fetch after mount and showed every visitor a placeholder flash before the
 * logos appeared. A customer arriving on a shared /repair/samsung link gets
 * server-rendered models in the first paint, and search runs client-side over
 * data that is already there.
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string }>;
}): Promise<Metadata> {
  const { brand: slug } = await params;
  const brand = await getRepairBrandBySlug(slug);
  if (!brand) return { title: "Brand not found" };

  return {
    title: `${brand.name} Mobile Repair — Select Your Model`,
    description: `Choose your ${brand.name} model to see the repairs we offer — screen, battery, charging port, camera and more. Book without paying upfront.`,
    alternates: { canonical: `/repair/${brand.slug}` },
  };
}

export default async function RepairModelsPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: slug } = await params;
  const brand = await getRepairBrandBySlug(slug);

  // A brand the owner un-flagged or deactivated should 404, not render an empty
  // page — otherwise old links quietly become dead ends that still return 200
  // and get indexed as thin pages.
  if (!brand) notFound();

  const models = await getModelsForBrand(brand.id);

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            // The brand crumb points back to the brand grid, which is where
            // "change my mind about the brand" actually goes.
            { label: brand.name, href: "/repair" },
            { label: "Models" },
          ]}
        />
        <ModelGrid brand={brand} models={models} />
    </div>
  );
}
