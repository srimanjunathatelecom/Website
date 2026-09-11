"use client";

import Link from "next/link";
import { useEffect } from "react";

// Next.js route-level error boundary — catches any error thrown while
// rendering a page or its server component tree (including data-fetch
// failures) and shows a branded recovery screen instead of the default
// framework error page. Must be a client component with this exact
// (error, reset) prop shape.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to the server console (and, in production, whatever log
    // aggregator captures stdout) so failures are visible without
    // exposing internals to the visitor.
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-sm font-black uppercase tracking-[0.25em] text-rose-600">Something went wrong</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
        This page hit a snag
      </h1>
      <p className="mt-3 max-w-md text-sm text-slate-500 sm:text-base">
        Please try again. If this keeps happening, contact our support team and we&apos;ll help right away.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-700"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
