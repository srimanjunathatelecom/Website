import Link from "next/link";
import CatalogueHealth from "@/components/admin/CatalogueHealth";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Catalogue Health" };

export const dynamic = "force-dynamic";

/**
 * Catalogue Health console — the "the system does the work, you review the
 * exceptions" screen. Everything on it is driven by /api/catalogue/*: the
 * health score, Fix My Catalogue, the review queue, bulk image upload with
 * SKU mapping, and the automation settings. The page itself is a thin shell
 * so all state (job polling etc.) lives in the client component.
 */
export default function CataloguePage() {
  return (
    <div className="admin-scope flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--adm-line)] bg-[var(--adm-paper)]/85 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--adm-ink)] font-mono-adm text-xs font-bold text-[var(--adm-paper)]">SMS</div>
          <div>
            <p className="adm-eyebrow">Console / 09.2</p>
            <p className="font-display-adm truncate text-[17px] leading-tight">Catalogue Health</p>
          </div>
        </div>
        <Link href="/admin" className="adm-btn !py-1.5 !text-[12px]">Back to Dashboard</Link>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <p className="adm-eyebrow">09.2 / Operations</p>
          <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">Catalogue Health.</h1>
          <p className="mt-2 max-w-[62ch] text-[13px] text-[var(--adm-muted)]">
            The system checks every product for missing images, placeholder images, broken links and missing
            information — then fixes what is safe to fix and asks you only about the rest.
          </p>
          <hr className="adm-rule mt-4" />
        </div>

        <CatalogueHealth />
      </main>
    </div>
  );
}
