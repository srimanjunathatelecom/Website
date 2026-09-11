// Shared parsing helpers for the Products & Stock "Quick Add" workflow.
//
// Category detection here is the same keyword-based heuristic already
// originally shared with the retired one-shot /api/import — returns a confidence
// level instead of a silent guess, per the requirement that low-confidence
// suggestions must be shown to the admin for confirmation rather than
// applied automatically. Both routes can reuse this single function so
// the two importers make consistent category calls.

export type CategoryGuess = {
  name: string; // one of the known category names below
  confidence: "high" | "medium" | "low";
};

// Keyword sets extracted from the retired /api/import guessCategory
// logic, kept intact so behavior doesn't change for CSV import — just
// made reusable and given a confidence signal.
const SERVICE_KEYWORDS = ["COMBO", "SERVICE", "LICENCE", "LICENSE", "CERTIFICATE", "WORK", "CONNECTION", "REPAIR", "INSTALLATION"];
const PHONE_KEYWORDS = [
  "5G", "ULTRA", "TAB", "Y11", "Y21", "Y31", "Y50", "Y91", "V70", "NOVA",
  "SAMSUNG A", "VIVO Y", "OPPO A", "REALME C", "REDMI", "VIVO V", "IPHONE",
  "GALAXY", "PIXEL", "NORD", "POCO", "MOTO ", "NARZO",
];
const LAPTOP_ACC_KEYWORDS = ["MOUSE", "LAPTOP", "KEYBOARD", "PEN DRIVE", "TALLY", "MONITOR", "CPU", "RAM", "SSD", "HDD", "ADAPTER"];
const MOBILE_ACC_KEYWORDS = ["CASE", "COVER", "CHARGER", "CABLE", "EARPHONE", "EARBUD", "HEADPHONE", "TEMPERED", "SCREEN GUARD", "POWERBANK", "POWER BANK"];

/**
 * Guesses the most likely category for a product name/description and
 * reports how confident that guess is, so the caller can decide whether
 * to apply it silently (high) or ask the admin to confirm (medium/low).
 * Falls back to "Mobile Accessories" at low confidence when nothing
 * matches, same default the existing CSV importer already uses.
 */
export function guessCategoryWithConfidence(text: string): CategoryGuess {
  const upper = text.toUpperCase();

  const serviceHits = SERVICE_KEYWORDS.filter((k) => upper.includes(k)).length;
  if (serviceHits > 0) {
    return { name: "Mobile Service", confidence: serviceHits >= 2 ? "high" : "medium" };
  }

  const phoneHits = PHONE_KEYWORDS.filter((k) => upper.includes(k)).length;
  if (phoneHits > 0) {
    return { name: "Mobile Phones", confidence: phoneHits >= 2 ? "high" : "medium" };
  }

  const laptopAccHits = LAPTOP_ACC_KEYWORDS.filter((k) => upper.includes(k)).length;
  if (laptopAccHits > 0) {
    return { name: "Laptop Accessories", confidence: laptopAccHits >= 2 ? "high" : "medium" };
  }

  const mobileAccHits = MOBILE_ACC_KEYWORDS.filter((k) => upper.includes(k)).length;
  if (mobileAccHits > 0) {
    return { name: "Mobile Accessories", confidence: mobileAccHits >= 2 ? "high" : "medium" };
  }

  // Nothing matched — still return a usable default, but flagged low
  // confidence so the UI asks the admin to double check it.
  return { name: "Mobile Accessories", confidence: "low" };
}

export type ParsedLine = {
  raw: string;
  name: string;
  brand: string;
  ram: string;
  storage: string;
  color: string;
  mrp: number | null;
  mop: number | null;
  stock: number | null;
  categoryGuess: CategoryGuess;
  warnings: string[];
};

const KNOWN_BRANDS = [
  "Samsung", "Apple", "iPhone", "OnePlus", "Xiaomi", "Redmi", "Poco", "Vivo", "Oppo",
  "Realme", "Google", "Pixel", "Nothing", "Motorola", "Moto", "Nokia", "Asus", "Lenovo",
  "HP", "Dell", "Acer", "MSI", "Boat", "JBL", "Sony", "Noise", "Zebronics", "Portronics",
];

const STORAGE_RE = /\b(\d{2,4})\s?GB\b/i;
const RAM_RE = /\b(\d{1,2})\s?GB\s?RAM\b/i;
const COLOR_WORDS = [
  "Black", "White", "Blue", "Red", "Green", "Gold", "Silver", "Grey", "Gray",
  "Purple", "Pink", "Yellow", "Titanium", "Graphite", "Midnight", "Starlight",
  "Sunrise", "Emerald", "Lavender", "Bronze", "Rose",
];

/**
 * Parses a single free-text product line for the Quick Add flow, e.g.:
 *   "Samsung Galaxy S24 Ultra 256GB Black 79999 94999 10"
 * Extracts only what it can identify with reasonable confidence — never
 * fabricates a brand, price, or spec that isn't present in the text.
 * Trailing numbers are interpreted as MOP, MRP, stock (in that order,
 * matching the format shown in the Quick Add helper text) when 2–3
 * numbers are found at the end of the line; a single trailing number is
 * treated as stock only if a price already appears earlier via other
 * cues, otherwise it's left for the admin to assign.
 */
export function parseQuickAddLine(raw: string): ParsedLine {
  const line = raw.trim();
  const warnings: string[] = [];

  // Pull trailing numeric tokens (price/stock) off the end first, so
  // the remaining text is pure name/spec words.
  const tokens = line.split(/\s+/);
  const trailingNumbers: number[] = [];
  let cut = tokens.length;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].replace(/,/g, "");
    if (/^\d+(\.\d+)?$/.test(t)) {
      trailingNumbers.unshift(Number(t));
      cut = i;
    } else {
      break;
    }
  }
  const namePart = tokens.slice(0, cut).join(" ");

  let mop: number | null = null;
  let mrp: number | null = null;
  let stock: number | null = null;
  if (trailingNumbers.length === 3) {
    [mop, mrp, stock] = trailingNumbers;
  } else if (trailingNumbers.length === 2) {
    [mop, mrp] = trailingNumbers;
    warnings.push("No stock quantity found — defaulting to 0, please confirm.");
  } else if (trailingNumbers.length === 1) {
    // Ambiguous: could be just a stock count with no price. Treat as
    // stock only, and flag pricing as missing rather than guessing.
    stock = trailingNumbers[0];
    warnings.push("No price detected — MRP/MOP left blank, please fill in.");
  } else {
    warnings.push("No price or stock detected in this line — fill them in manually.");
  }

  if (mrp != null && mop != null && mop > mrp) {
    warnings.push("Detected selling price is higher than MRP — please check the numbers.");
  }

  // Brand: match against known list (case-insensitive), else first word.
  let brand = "";
  for (const b of KNOWN_BRANDS) {
    if (new RegExp(`\\b${b}\\b`, "i").test(namePart)) {
      brand = b === "iPhone" ? "Apple" : b === "Pixel" ? "Google" : b === "Moto" ? "Motorola" : b;
      break;
    }
  }
  if (!brand) {
    brand = namePart.split(" ")[0] || "";
    if (brand) warnings.push(`Brand not recognized — using "${brand}" as a guess, please confirm.`);
  }

  const storageMatch = namePart.match(STORAGE_RE);
  const ramMatch = namePart.match(RAM_RE);
  const storage = storageMatch && !ramMatch ? `${storageMatch[1]}GB` : storageMatch ? `${storageMatch[1]}GB` : "";
  const ram = ramMatch ? `${ramMatch[1]}GB` : "";

  let color = "";
  for (const c of COLOR_WORDS) {
    if (new RegExp(`\\b${c}\\b`, "i").test(namePart)) {
      color = c;
      break;
    }
  }

  if (!namePart.trim()) {
    warnings.push("Could not identify a product name on this line.");
  }

  const categoryGuess = guessCategoryWithConfidence(namePart || line);

  return {
    raw: line,
    name: namePart.trim(),
    brand,
    ram,
    storage,
    color,
    mrp,
    mop,
    stock,
    categoryGuess,
    warnings,
  };
}

export function parseQuickAddText(text: string): ParsedLine[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200) // sane upper bound per paste
    .map(parseQuickAddLine);
}