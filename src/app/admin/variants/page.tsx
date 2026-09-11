import { db } from "@/db";
import { products, productVariants } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import VariantManager from "@/components/admin/VariantManager";

import type { Metadata } from "next";

// Named so the tab is identifiable; the "· SMS Stores Admin" suffix comes
// from the title template in src/app/admin/layout.tsx.
export const metadata: Metadata = { title: "Product Variants" };

export const dynamic = "force-dynamic";

/**
 * Variant console. Previously this page could only add and delete rows through
 * inline server actions, which meant a price or colour typo had to be fixed by
 * deleting the variant and re-creating it. It now picks a product and hands off
 * to the same VariantManager the product editor uses, so both screens write
 * through one API and the product page always reflects what's stored.
 */
export default async function VariantsManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const sp = await searchParams;
  const selectedProductId = sp.productId ? parseInt(sp.productId, 10) : null;

  const allProducts = await db
    .select({ id: products.id, name: products.name, brand: products.brand })
    .from(products)
    .orderBy(desc(products.id));

  const counts = await db
    .select({ productId: productVariants.productId, id: productVariants.id })
    .from(productVariants)
    .orderBy(asc(productVariants.productId));

  const countByProduct = counts.reduce<Record<number, number>>((acc, row) => {
    acc[row.productId] = (acc[row.productId] || 0) + 1;
    return acc;
  }, {});

  const selected = selectedProductId
    ? (await db.select({ id: products.id, name: products.name, brand: products.brand }).from(products).where(eq(products.id, selectedProductId)))[0]
    : undefined;

  return (
    <div className="admin-scope flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--adm-line)] bg-[var(--adm-paper)]/85 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--adm-ink)] font-mono-adm text-xs font-bold text-[var(--adm-paper)]">SMS</div>
          <div>
            <p className="adm-eyebrow">Console / 09.6</p>
            <p className="font-display-adm truncate text-[17px] leading-tight">Product Variants</p>
          </div>
        </div>
        <Link href="/admin" className="adm-btn !py-1.5 !text-[12px]">Back to Dashboard</Link>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <p className="adm-eyebrow">09.6 / Storefront</p>
          <h1 className="mt-2 font-display-adm text-[28px] leading-tight sm:text-[36px]">Manage Variants.</h1>
          <p className="mt-2 max-w-[62ch] text-[13px] text-[var(--adm-muted)]">
            Colour, RAM and storage options, each with its own price, stock, SKU, photo and swatch. The product page
            only lets customers select combinations that exist here.
          </p>
          <hr className="adm-rule mt-4" />
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="adm-card h-fit p-4">
            <h2 className="mb-3 font-display-adm text-lg">Products</h2>
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {allProducts.length === 0 && (
                <li className="font-mono-adm text-[11px] text-[var(--adm-muted)]">No products yet.</li>
              )}
              {allProducts.map((p) => {
                const active = p.id === selectedProductId;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/admin/variants?productId=${p.id}`}
                      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12.5px] ${
                        active
                          ? "bg-[var(--adm-ink)] text-[var(--adm-paper)]"
                          : "hover:bg-[var(--adm-paper-2)]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{p.name}</span>
                        <span className={`block font-mono-adm text-[10px] ${active ? "opacity-70" : "text-[var(--adm-muted)]"}`}>
                          {p.brand || "—"} · #{p.id}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono-adm text-[10px]">{countByProduct[p.id] || 0}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="md:col-span-2">
            {selected ? (
              <VariantManager productId={selected.id} productName={selected.name} />
            ) : (
              <div className="rounded-[14px] border border-dashed border-[var(--adm-line-strong)] bg-[#fffdf7] p-10 text-center">
                <p className="font-mono-adm text-[12px] text-[var(--adm-muted)]">
                  Pick a product on the left to manage its variants.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
