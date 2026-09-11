import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Breadcrumbs from "@/components/repair/Breadcrumbs";
import DeviceSummary from "@/components/repair/DeviceSummary";
import ServiceGrid from "@/components/repair/ServiceGrid";
import { getOutlets } from "@/lib/queries";
import { deviceLabel } from "@/lib/repair/types";
import {
  getModelBySlug,
  getRepairBrandBySlug,
  getRepairServices,
  pickPopularServices,
} from "@/lib/repair/queries";

/**
 * Step 3 of the repair flow: Select Service, for one brand and model.
 *
 * This is the end of the visual funnel, and the point where it hands back to
 * machinery that already existed. The repairs come from the same `services`
 * table the storefront and Admin have always used — this page adds no parallel
 * catalogue — and choosing one posts to the existing POST /api/bookings. No
 * route, query, table or booking rule was changed to make this work.
 */
export const revalidate = 300;

type Params = Promise<{ brand: string; model: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { brand: brandSlug, model: modelSlug } = await params;
  const brand = await getRepairBrandBySlug(brandSlug);
  if (!brand) return { title: "Model not found" };
  const model = await getModelBySlug(brand.id, modelSlug);
  if (!model) return { title: "Model not found" };

  const device = deviceLabel(brand.name, model.name);
  return {
    title: `${device} Repair in Bengaluru — Screen, Battery & More`,
    description: `Book a ${device} repair — screen replacement, battery, charging port, camera and more. Same-day service at our Bengaluru outlets, no payment upfront.`,
    alternates: { canonical: `/repair/${brand.slug}/${model.slug}` },
  };
}

export default async function RepairServicesPage({
  params,
}: {
  params: Params;
}) {
  const { brand: brandSlug, model: modelSlug } = await params;
  const brand = await getRepairBrandBySlug(brandSlug);
  if (!brand) notFound();

  // Looked up within the brand rather than globally: model slugs only have to be
  // unique per brand, so "galaxy-s23" is meaningless without knowing whose it is.
  const model = await getModelBySlug(brand.id, modelSlug);
  if (!model) notFound();

  const [services, outlets] = await Promise.all([
    getRepairServices(model),
    getOutlets(),
  ]);

  // A model with no repairs configured is a data problem, not a page worth
  // rendering — a customer three taps in should not land on an empty grid.
  if (services.length === 0) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: brand.name, href: "/repair" },
            // The model crumb goes back to this brand's model grid, which is the
            // "wrong model, right brand" case — much the commoner correction.
            { label: model.name, href: `/repair/${brand.slug}` },
            { label: "Services" },
          ]}
        />
        <DeviceSummary brand={brand} model={model} />
        <ServiceGrid
          brand={brand}
          model={model}
          services={services}
          // Derived from the same list, so the rail can never advertise a repair
          // the owner has disabled.
          popular={pickPopularServices(services)}
          outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        />
    </div>
  );
}
