import {
  BreadcrumbsSkeleton,
  BrandGridSkeleton,
} from "@/components/repair/GridSkeleton";

/**
 * Shown the instant a visitor lands on or navigates to /repair, for as long as
 * the brand query takes.
 *
 * Before this existed, a <Link> into the funnel could not commit any UI until
 * the server had produced the whole RSC payload: the old page stayed fully
 * painted, the URL did not change, and nothing acknowledged the click. That is
 * the "did my tap register?" pause, and it was not a rendering cost — it was the
 * absence of a Suspense boundary to render *into*.
 */
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
      <BrandGridSkeleton />
    </div>
  );
}
