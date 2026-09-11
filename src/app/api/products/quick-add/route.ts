import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { parseQuickAddText } from "@/lib/quickAdd";

// Same normalisation the import matcher uses: case, punctuation and
// double-space differences must not hide a duplicate ("Vivo Y-11" vs
// "vivo y11").
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const dynamic = "force-dynamic";

// PREVIEW ONLY — this route never writes to the database. It parses the
// pasted text and returns a structured suggestion per line, each matched
// against a real existing category with a confidence level, for the
// admin to review/edit/confirm before anything is published. Actual
// creation happens via POST /api/products/quick-add/publish once the
// admin has confirmed (or edited) each row.
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await req.json();
    const text = String(b.text || "");
    if (!text.trim()) return Response.json({ error: "Paste at least one product line." }, { status: 400 });

    const parsed = parseQuickAddText(text);
    if (parsed.length === 0) return Response.json({ error: "No product lines found." }, { status: 400 });

    const allCats = await db.select().from(categories);

    // Duplicate detection: warn (never block) when a pasted line matches an
    // existing product by name, or repeats within the same paste. Warning
    // instead of blocking because "Samsung 25W Charger" may legitimately be
    // added twice as different listings — the admin decides with the facts.
    const existing = await db
      .select({ id: products.id, name: products.name, sku: products.sku, stock: products.stock, status: products.status })
      .from(products);
    const existingByName = new Map<string, (typeof existing)[number]>();
    for (const e of existing) {
      const key = normName(e.name);
      if (key && !existingByName.has(key)) existingByName.set(key, e);
    }
    const seenInBatch = new Map<string, number>();

    const rows = parsed.map((p, index) => {
      const matched = allCats.find((c) => c.name.toLowerCase() === p.categoryGuess.name.toLowerCase());
      const key = normName(p.name || "");
      const dup = key ? existingByName.get(key) : undefined;
      const firstSeenAt = key ? seenInBatch.get(key) : undefined;
      if (key && firstSeenAt === undefined) seenInBatch.set(key, index + 1);
      const warnings = [...p.warnings];
      if (dup) {
        warnings.push(
          `Possible duplicate: "${dup.name}" already exists (SKU ${dup.sku || "none"}, stock ${dup.stock}${dup.status === "hidden" ? ", hidden" : ""}). If you meant to add stock to it, use a stock import or edit the product instead of creating a second listing.`
        );
      }
      if (firstSeenAt !== undefined) {
        warnings.push(`This looks like the same product as line ${firstSeenAt} of this paste — publishing both would create two listings.`);
      }
      return {
        index,
        raw: p.raw,
        name: p.name,
        brand: p.brand,
        ram: p.ram,
        storage: p.storage,
        color: p.color,
        mrp: p.mrp,
        mop: p.mop,
        stock: p.stock,
        suggestedCategoryId: matched?.id ?? allCats[0]?.id ?? null,
        suggestedCategoryName: matched?.name ?? p.categoryGuess.name,
        categoryConfidence: p.categoryGuess.confidence,
        warnings,
        duplicateOf: dup ? { id: dup.id, name: dup.name, sku: dup.sku } : null,
        duplicateOfLine: firstSeenAt ?? null,
        hasBlockingIssue: !p.name,
      };
    });

    return Response.json({ items: rows, categories: allCats.map((c) => ({ id: c.id, name: c.name })) });
  } catch (e: any) {
    console.error("Quick-add parse failed:", e);
    return Response.json({ error: "Could not parse the pasted text. Check the format and try again." }, { status: 500 });
  }
}