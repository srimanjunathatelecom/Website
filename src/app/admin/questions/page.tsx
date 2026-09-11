import Link from "next/link";
import QuestionsModerator from "@/components/admin/QuestionsModerator";

import type { Metadata } from "next";

// Named so the tab is identifiable; the "· SMS Stores Admin" suffix comes
// from the title template in src/app/admin/layout.tsx.
export const metadata: Metadata = { title: "Product Q&A" };

export const dynamic = "force-dynamic";

/**
 * Product Q&A moderation console. Shopper questions arrive here first — nothing
 * appears on a product page until the store publishes it.
 */
export default function AdminQuestionsPage() {
  return (
    <div className="admin-scope flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--adm-line)] bg-[var(--adm-paper)]/85 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--adm-ink)] font-mono-adm text-xs font-bold text-[var(--adm-paper)]">
            SMS
          </div>
          <div>
            <p className="adm-eyebrow">Console / 09.7</p>
            <p className="font-display-adm truncate text-[17px] leading-tight">Product Q&amp;A</p>
          </div>
        </div>
        <Link href="/admin" className="adm-btn !py-1.5 !text-[12px]">
          Back to Dashboard
        </Link>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <p className="adm-eyebrow">09.7 / Storefront</p>
          <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">Answer Questions.</h1>
          <p className="mt-2 max-w-[62ch] text-[13px] text-[var(--adm-muted)]">
            Questions shoppers ask on a product page land here. Write the answer and publish it — only published
            questions are visible on the storefront.
          </p>
          <hr className="adm-rule mt-4" />
        </div>

        <QuestionsModerator />
      </main>
    </div>
  );
}
