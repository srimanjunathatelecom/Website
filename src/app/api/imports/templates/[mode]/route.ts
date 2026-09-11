/**
 * Downloadable Excel templates, one per import mode. Each has:
 *  - Sheet 1 "Data": the exact headers the importer expects, with two example
 *    rows the admin overwrites;
 *  - Sheet 2 "How to fill this": one line per column — what it means, what's
 *    required, what happens when it's left blank — plus the live category
 *    list, in plain shopkeeper language.
 */

import { db } from "@/db";
import { categories } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { reportError } from "@/lib/observability";
import { MODE_INFO, type ImportMode } from "@/lib/importing/engine";

export const dynamic = "force-dynamic";

type Col = { header: string; doc: string; example1: string; example2: string };

const IDENTITY_COLS: Col[] = [
  { header: "SKU", doc: "The product's code. Required unless you fill Product ID or Barcode. Get it from Export → Stock.", example1: "SGS25-BLU-256", example2: "BOAT141" },
  { header: "Name", doc: "Only used to double-check the row — matching is by SKU/ID/Barcode, never by name alone.", example1: "Samsung Galaxy S25 (Blue, 256GB)", example2: "boAt Airdopes 141" },
];

const TEMPLATES: Record<ImportMode, Col[]> = {
  snapshot: [
    ...IDENTITY_COLS,
    { header: "Stock", doc: "The FULL current count. 15 means: set stock to exactly 15.", example1: "15", example2: "40" },
  ],
  receipt: [
    ...IDENTITY_COLS,
    { header: "Stock", doc: "How many NEW units arrived. 10 means: add 10 on top of current stock. Cannot be negative.", example1: "10", example2: "24" },
  ],
  adjust: [
    ...IDENTITY_COLS,
    { header: "Stock", doc: "The correction. -2 means reduce by 2 (damage/theft/count error), 3 means add 3.", example1: "-2", example2: "3" },
  ],
  reconcile: [
    ...IDENTITY_COLS,
    { header: "Stock", doc: "The counted stock for EVERY item you still carry. Items missing from this sheet are listed for review — nothing is deleted automatically.", example1: "15", example2: "0" },
  ],
  price: [
    ...IDENTITY_COLS,
    { header: "MRP", doc: "Maximum retail price. Leave blank to keep the current MRP.", example1: "89999", example2: "" },
    { header: "Selling Price", doc: "Your price. Must not be above MRP. Leave blank to keep current.", example1: "74999", example2: "1199" },
    { header: "Cost Price", doc: "What you paid per unit (only you see this). Leave blank to keep current.", example1: "68000", example2: "" },
  ],
  product: [
    { header: "SKU", doc: "Code for the product. For EXISTING products this is how the row finds them.", example1: "SGS25-BLU-256", example2: "NEW-SKU-001" },
    { header: "Name", doc: "Required for NEW products.", example1: "Samsung Galaxy S25 (Blue, 256GB)", example2: "USB-C Cable 1m" },
    { header: "Brand", doc: "Optional. Blank = unchanged.", example1: "Samsung", example2: "Generic" },
    { header: "Category", doc: "Must match one of your categories exactly — see the list on the next sheet. Blank = unchanged.", example1: "Smartphones", example2: "Mobile Accessories" },
    { header: "Colour", doc: "For variant products (phones). Together with RAM/Storage it says WHICH variant this row is.", example1: "Blue", example2: "" },
    { header: "RAM", doc: "Variant RAM, e.g. 8GB.", example1: "8GB", example2: "" },
    { header: "Storage", doc: "Variant storage, e.g. 256GB.", example1: "256GB", example2: "" },
    { header: "MRP", doc: "Required for new products. Blank = unchanged for existing.", example1: "89999", example2: "299" },
    { header: "Selling Price", doc: "Required for new products. Must not exceed MRP.", example1: "74999", example2: "199" },
    { header: "Cost Price", doc: "Optional, private.", example1: "68000", example2: "120" },
    { header: "GST %", doc: "Optional, 0–100.", example1: "18", example2: "18" },
    { header: "HSN Code", doc: "Optional.", example1: "8517", example2: "8544" },
    { header: "Stock", doc: "Optional. Sets the stock count for this item.", example1: "15", example2: "50" },
    { header: "Status", doc: "active = visible in the shop, hidden = not shown. NEW products stay hidden unless you write active.", example1: "active", example2: "hidden" },
    { header: "Warranty", doc: "Optional text. Write CLEAR to empty a field on purpose; blank always means 'leave as is'.", example1: "1 year", example2: "" },
    { header: "Description", doc: "Optional. Blank = unchanged. CLEAR = empty it.", example1: "", example2: "" },
  ],
};

export async function GET(_req: Request, { params }: { params: Promise<{ mode: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { mode } = await params;
  const cols = TEMPLATES[mode as ImportMode];
  if (!cols) return Response.json({ error: "Unknown template." }, { status: 404 });

  try {
    const cats = await db.select({ name: categories.name }).from(categories);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    const data = wb.addWorksheet("Data");
    data.addRow(cols.map((c) => c.header));
    data.getRow(1).font = { bold: true };
    data.addRow(cols.map((c) => c.example1));
    data.addRow(cols.map((c) => c.example2));
    data.columns.forEach((col, i) => { col.width = Math.max(14, cols[i].header.length + 4); });

    const help = wb.addWorksheet("How to fill this");
    help.addRow([`${MODE_INFO[mode as ImportMode].label} — ${MODE_INFO[mode as ImportMode].explain}`]);
    help.getRow(1).font = { bold: true };
    help.addRow([]);
    help.addRow(["Column", "What it means"]);
    help.getRow(3).font = { bold: true };
    for (const c of cols) help.addRow([c.header, c.doc]);
    help.addRow([]);
    help.addRow(["General rules"]);
    help.addRow(["• A BLANK cell always means 'leave it as it is' — it never erases anything."]);
    help.addRow(["• Write CLEAR in a text cell to empty that field on purpose."]);
    help.addRow(["• The example rows are just examples — delete them and put your real items."]);
    help.addRow(["• Images are never touched by imports — manage photos on the product page."]);
    help.addRow([]);
    help.addRow(["Your categories (copy exactly):"]);
    for (const c of cats) help.addRow([c.name]);
    help.getColumn(1).width = 30;
    help.getColumn(2).width = 100;

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="template-${mode}.xlsx"`,
      },
    });
  } catch (err) {
    reportError(err, "api/imports/templates");
    return Response.json({ error: "Could not build the template." }, { status: 500 });
  }
}
