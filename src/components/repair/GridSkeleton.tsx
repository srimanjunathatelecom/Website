/**
 * The placeholder the repair grids show while the server is still assembling the
 * real one.
 *
 * This is a server component with no JavaScript of its own, which matters: it
 * has to be able to paint in the same frame the click happens in, and anything
 * that needs to hydrate first cannot.
 *
 * The shapes are deliberately the *same* shapes, at the same column counts and
 * the same heights, as the grid that replaces them. A skeleton whose cards are a
 * different size than the real cards does more harm than no skeleton at all —
 * the content lands and everything jumps, which reads as a second, worse pause.
 * The column classes below are copied from BrandGrid, ModelGrid and ServiceGrid
 * rather than approximated, and the heights match CardImage's frames.
 *
 * The shimmer is a single background-position animation on a gradient. It runs
 * on the compositor, it is one animated property, and it stops existing the
 * moment the real content arrives.
 */

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-[10px] ${className}`} aria-hidden />;
}

function HeadingBlock({ withSearch = true }: { withSearch?: boolean }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <Shimmer className="h-8 w-[190px] sm:h-9 sm:w-[230px]" />
      {withSearch && <Shimmer className="h-11 w-full sm:max-w-[420px]" />}
    </div>
  );
}

/** Matches BrandGrid: 2 / 3 / 5 / 6 / 9 columns, 64–74px logo plate. */
export function BrandGridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <section aria-busy="true" aria-label="Loading brands">
      <HeadingBlock />
      <ul className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 md:grid-cols-5 md:gap-3.5 lg:grid-cols-6 xl:grid-cols-9">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <Shimmer className="h-[80px] w-full sm:h-[90px]" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Matches ModelGrid: 2 / 3 / 4 / 5 / 7 columns, 92–104px render plus a name row. */
export function ModelGridSkeleton({ count = 14 }: { count?: number }) {
  return (
    <section aria-busy="true" aria-label="Loading models">
      <HeadingBlock />
      <ul className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 md:grid-cols-4 md:gap-3.5 lg:grid-cols-5 xl:grid-cols-7">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <Shimmer className="h-[139px] w-full sm:h-[151px]" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Matches ServiceGrid: the popular rail, then 1 / 2 / 3 columns of wide cards. */
export function ServiceGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <section aria-busy="true" aria-label="Loading repairs">
      <HeadingBlock />
      <div className="mb-7">
        <Shimmer className="mb-3 h-5 w-[210px]" />
        <ul className="flex gap-3 overflow-hidden pb-1">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="w-[136px] shrink-0 sm:w-[150px] lg:w-[160px]">
              <Shimmer className="h-[172px] w-full" />
            </li>
          ))}
        </ul>
      </div>
      <ul className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 xl:grid-cols-3 xl:gap-3.5">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <Shimmer className="h-[104px] w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The crumb row, so the skeleton starts at the same vertical offset as the page. */
export function BreadcrumbsSkeleton() {
  return <Shimmer className="mb-4 h-4 w-[220px] sm:mb-5" />;
}
