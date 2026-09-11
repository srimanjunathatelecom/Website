import type { ReactNode } from "react";

/**
 * "Select Brand" / "Select Model" / "Select Service", with the step's search
 * field sitting on the same baseline to its right.
 *
 * One component instead of three copies of the same flex row, because the two
 * halves have to stay aligned across all three steps and that alignment is the
 * most visible thing about the reference layout.
 *
 * It stacks below `sm`: a 420px search field and a 32px heading cannot share a
 * 375px row without one of them being uselessly narrow.
 */
export default function StepHeading({
  title,
  children,
}: {
  title: string;
  /** The step's search field, if it has one. */
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-slate-900 sm:text-[30px] lg:text-[32px] dark:text-white">
        {title}
      </h1>
      {children}
    </div>
  );
}
