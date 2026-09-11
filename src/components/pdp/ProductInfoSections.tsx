"use client";

import { useState } from "react";
import type { SpecGroup } from "@/lib/productContent";

/**
 * Collapsible wrapper for long content blocks. Open by default on desktop-sized
 * content; the caller decides. Uses a real button + aria-expanded so it is
 * keyboard operable and announced correctly.
 */
export function Collapsible({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-slate-100 pt-6 first:border-0 first:pt-0 dark:border-slate-800">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 text-left text-[20px] font-bold tracking-tight text-slate-900 dark:text-white"
        >
          {title}
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h2>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

/**
 * Specifications table. Groups come from the admin-entered text field, so the
 * set of groups and rows is fully dynamic — nothing is hard-coded per category.
 */
export function SpecTable({ groups }: { groups: SpecGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <div key={`${g.title}-${gi}`}>
          {g.title && (
            <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {g.title}
            </h3>
          )}
          <dl className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {g.rows.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className={`flex flex-col border-b border-slate-100 last:border-0 sm:flex-row dark:border-slate-800 ${
                  i % 2 === 0 ? "bg-slate-50/50 dark:bg-slate-900/50" : ""
                }`}
              >
                <dt className="w-full shrink-0 p-3.5 text-[13px] font-semibold text-slate-500 sm:w-[35%] dark:text-slate-400">
                  {r.label}
                </dt>
                <dd className="w-full break-words border-slate-100 p-3.5 pt-0 text-[13px] font-medium text-slate-900 sm:w-[65%] sm:border-l sm:pt-3.5 dark:border-slate-800 dark:text-slate-200">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/** What's in the box — hidden entirely when the admin has not filled it in. */
export function BoxContents({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((it, i) => (
        <li
          key={`${it}-${i}`}
          className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13.5px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" />
          </svg>
          {it}
        </li>
      ))}
    </ul>
  );
}
