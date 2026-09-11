/**
 * The view contracts for the visual repair flow: Brand -> Model -> Service.
 *
 * These are deliberately NOT the Drizzle row types. The UI components take
 * these and nothing else, which is what makes the flow data-driven in the way
 * that actually matters: a card renders from a plain object, so it does not
 * care whether that object came from Postgres today, an admin API tomorrow, or
 * a fixture in a test. Adding a brand, model or service is a data change and
 * never a component change.
 *
 * Every card type shares `id`, `slug`, `name` and `image` so one image/fallback
 * strategy and one keyboard/selection behaviour covers all three grids.
 */

export interface SelectableCard {
  id: number;
  slug: string;
  name: string;
  /** URL/path ref, or "" — the card renders a labelled fallback when empty. */
  image: string;
  imageAlt: string;
}

export interface RepairBrand extends SelectableCard {
  /** Tinted plate behind the logo, mirroring the storefront brand rail. */
  bgColor: string;
  modelCount: number;
}

export interface RepairModel extends SelectableCard {
  brandId: number;
  brandSlug: string;
  brandName: string;
  releaseYear: number | null;
  popular: boolean;
}

export interface RepairService extends SelectableCard {
  description: string;
  category: string;
  /** Free text, e.g. "Price on inspection" — never an invented number. */
  startPrice: string;
  turnaround: string;
  /** Drives the Popular Repaired Services carousel. */
  featured: boolean;
  badge: string;
}

/**
 * What the customer has chosen so far. Partial by definition — the flow is
 * entered at any step (a shared /repair/samsung link has a brand but no model).
 */
export interface RepairSelection {
  brand?: RepairBrand;
  model?: RepairModel;
  service?: RepairService;
}

/** A step in the flow, used by the breadcrumb and for guarding deep links. */
export type RepairStep = "brands" | "models" | "services";

/**
 * Case- and punctuation-insensitive match used by both search boxes.
 *
 * Normalising away non-alphanumerics is what makes the searches behave the way
 * customers expect: "s23 ultra", "S23Ultra" and "s23-ultra" all find
 * "Galaxy S23 Ultra", and "iphone 13" finds "iPhone 13" despite the case.
 */
export function normaliseForSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function matchesQuery(haystack: string, query: string): boolean {
  const q = normaliseForSearch(query);
  if (!q) return true;
  return normaliseForSearch(haystack).includes(q);
}

/**
 * Stand-in handset outline, used wherever a model has no image.
 *
 * Models are installed from a catalogue of names only — device renders are
 * trademarked product photography, so the owner uploads their own in Admin. A
 * card with a missing image would otherwise collapse and make its whole row
 * ragged, which is worse than a neutral silhouette. Shared between ModelCard and
 * DeviceSummary so the two cannot drift apart.
 */
export const GENERIC_DEVICE_IMAGE = "/images/models/generic-phone.svg";

/**
 * "Samsung" + "Galaxy S24" -> "Samsung Galaxy S24", but "Samsung" + "Samsung
 * Galaxy S24" -> "Samsung Galaxy S24" rather than saying Samsung twice.
 *
 * Model names get the brand baked into them all the time, especially when a
 * catalogue is imported from a supplier sheet, and every place that showed the
 * device did `${brand} ${model}` unconditionally. That produced "Samsung Samsung
 * Galaxy S24" in the page title Google shows, in the heading above the repair
 * list, and - the one that matters most - in the device recorded against the
 * booking, so it reached the counter looking like a mistake.
 */
export function deviceLabel(brandName: string, modelName: string): string {
  const brand = brandName.trim();
  const model = modelName.trim();
  if (!brand) return model;
  if (!model) return brand;
  const lowerModel = model.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  // Word boundary, so a brand called "Vi" never swallows the "Vi" in "Vivid 5".
  const prefixed =
    lowerModel === lowerBrand ||
    lowerModel.startsWith(`${lowerBrand} `) ||
    lowerModel.startsWith(`${lowerBrand}-`);
  return prefixed ? model : `${brand} ${model}`;
}
