"use client";

// Isolated as its own client component because the invoice page itself is
// a Server Component (it reads the order straight from the DB) — a Server
// Component can't pass an event handler like onClick to a DOM element, so
// this button, and only this button, needs to opt into client rendering.
//
// print:hidden (see globals.css @media print rules) removes this button
// from the printed output itself, so only the invoice content prints.
export default function PrintInvoiceButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Print Invoice
    </button>
  );
}