import {
  BreadcrumbsSkeleton,
  ServiceGridSkeleton,
} from "@/components/repair/GridSkeleton";

/** Step 3's loading state: shown the moment a model card is clicked. */
export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-14 pt-6 sm:px-6 sm:pt-8">
    {/* min-h-screen so the footer stays below the fold while this is on
        screen. Without it the placeholder was shorter than the real grid, the
        footer painted in the middle of the viewport and then jumped down when
        the content arrived: a measured 0.13 CLS on a 34-model brand, which is
        exactly the visual jank the skeleton is supposed to prevent. A shift
        that happens entirely below the fold costs nothing and is not seen. */}
      <BreadcrumbsSkeleton />
      {/* The device summary strip, so the header does not shift when it lands. */}
      <div className="skeleton-shimmer mb-6 h-[92px] w-full rounded-[10px]" aria-hidden />
      <ServiceGridSkeleton />
    </div>
  );
}
