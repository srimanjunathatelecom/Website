/**
 * File parsing for stock/product imports: CSV and Excel (.xlsx) in, a plain
 * grid of trimmed strings out.
 *
 * Why a hand-written CSV parser: the previous import split each line on
 * commas. Our own stock export quotes any value containing a comma
 * ("Samsung Galaxy S24, 256GB"), so a file exported from this very site
 * could not be re-imported without corrupting columns. This parser handles
 * RFC-4180 quoting: quoted fields, embedded commas, embedded newlines and
 * doubled quotes.
 */

export type Grid = string[][];

export function parseCsv(text: string): Grid {
  // Strip a UTF-8 BOM — Excel adds one when saving "CSV UTF-8", and a BOM
  // glued to the first header ("\ufeffID") would silently break mapping.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'; // doubled quote = literal quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  // Final cell/row (file may not end with a newline).
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  // Drop rows that are entirely empty — Excel loves trailing blank lines.
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Excel cell values arrive typed; normalise everything to trimmed strings. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    // exceljs rich values: hyperlinks, formulae, rich text.
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("").trim();
    if (o.result !== undefined) return cellToString(o.result);
    if (o.text !== undefined) return cellToString(o.text);
    return "";
  }
  return String(v).trim();
}

export async function parseXlsx(buffer: Buffer): Promise<Grid> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Grid = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // row.values is 1-based with index 0 unused.
    const values = row.values as unknown[];
    for (let c = 1; c < values.length; c++) cells.push(cellToString(values[c]));
    if (cells.some((c) => c !== "")) rows.push(cells);
  });
  return rows;
}

export async function parseUpload(fileName: string, buffer: Buffer): Promise<Grid> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return parseXlsx(buffer);
  if (lower.endsWith(".xls")) {
    throw new Error(
      "Old Excel .xls files are not supported. In Excel, use File → Save As → 'Excel Workbook (.xlsx)' or 'CSV UTF-8' and upload that."
    );
  }
  return parseCsv(buffer.toString("utf8"));
}

/**
 * Find the header row. Real-world sheets often start with a title line or a
 * blank-ish banner before the actual "ID, SKU, Name…" row. We look at the
 * first few rows and pick the first one where at least two cells look like
 * known column names.
 */
export function detectHeaderRow(grid: Grid, looksLikeHeader: (cell: string) => boolean): number {
  const limit = Math.min(grid.length, 10);
  for (let i = 0; i < limit; i++) {
    const hits = grid[i].filter((c) => c !== "" && looksLikeHeader(c)).length;
    if (hits >= 2) return i;
  }
  return 0;
}
