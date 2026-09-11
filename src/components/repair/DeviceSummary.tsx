import CardImage from "./CardImage";
import {
  GENERIC_DEVICE_IMAGE,
  type RepairBrand,
  type RepairModel,
} from "@/lib/repair/types";

/**
 * The panel above the service grid: device shot in its own bordered box, brand
 * name large, model name beneath.
 *
 * It answers "am I booking a repair for the right phone?" without the customer
 * having to read a breadcrumb, which is why it repeats information the
 * breadcrumb already carries. On a page where the next tap commits them to a
 * repair, that repetition is the point.
 */
export default function DeviceSummary({
  brand,
  model,
}: {
  brand: RepairBrand;
  model: RepairModel;
}) {
  return (
    <div className="mb-6 flex items-center gap-5 rounded-[10px] border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:gap-7 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="w-[112px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-[150px] lg:w-[180px] dark:border-slate-800">
        <CardImage
          src={model.image || GENERIC_DEVICE_IMAGE}
          alt={model.imageAlt}
          heightClass="h-[112px] sm:h-[150px] lg:h-[180px]"
          priority
          sizes="(max-width: 640px) 112px, (max-width: 1024px) 150px, 180px"
        />
      </div>
      <div className="min-w-0">
        <p className="font-display text-[24px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[30px] lg:text-[34px] dark:text-white">
          {brand.name}
        </p>
        <p className="mt-1 text-[15px] font-semibold text-slate-600 sm:text-[18px] lg:text-[20px] dark:text-slate-300">
          {model.name}
        </p>
        {model.releaseYear && (
          <p className="mt-2 text-[12px] font-medium text-slate-400">
            Released {model.releaseYear}
          </p>
        )}
      </div>
    </div>
  );
}
