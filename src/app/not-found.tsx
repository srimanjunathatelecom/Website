import Link from "next/link";

// Static, no data fetching — this must render even if the database or
// any other backend dependency is unavailable, since it's the page
// shown for any unmatched route (including a broken/typo'd deep link).
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-20 text-center">
      <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-700">404</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-sm text-slate-500 sm:text-base">
        The page you&apos;re looking for may have moved or no longer exists. Let&apos;s get you back on track.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-700"
        >
          Back to home
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-700"
        >
          Browse products
        </Link>
      </div>
    </main>
  );
}
