/**
 * The Admin sidebar order, and the single source of each section's number.
 *
 * Section numbers are NOT written down - they are counted off the order below,
 * so the menu always reads 01, 02, 03 with no gaps.
 *
 * They used to be hand-typed strings in two separate places: once in the
 * sidebar and again in every section's own heading. So every section added
 * after the first build got squeezed between two existing numbers instead of
 * renumbering the rest, and the two copies were free to disagree. What a shop
 * owner actually saw in the menu was 07, 07.5, 07.6, 07.7, 08, 08.5, 08.6,
 * 08.7, 08.75, 08.8, 08.9, 09, 09.5, 09.6, 09.7, 10 - and Homepage CMS was
 * listed as 08.8 in the sidebar while its own page called itself 07.8.
 *
 * A number like 08.75 is a version, not a step in a list, and it invites the
 * reader to wonder what they are missing between 08.7 and 08.8. Counting here,
 * in one place, means adding a section is a one-line change and the heading can
 * never drift from the menu again.
 */

export type AdminNavItem = { key: string; label: string; href?: string };
export type AdminNavGroup = { group: string; items: AdminNavItem[] };

const NAV_ORDER: AdminNavGroup[] = [
  { group: "Operations", items: [
    { key: "overview",  label: "Overview" },
    { key: "products",  label: "Products & Stock" },
    { key: "catalogue", label: "Catalogue Health", href: "/admin/catalogue" },
    { key: "orders",    label: "Orders" },
    { key: "bookings",  label: "Repair Bookings" },
    { key: "claims",    label: "Warranty Claims" },
  ]},
  { group: "Relationships", items: [
    { key: "customers", label: "Customers" },
    { key: "services",  label: "Service Catalogue" },
  ]},
  { group: "Storefront", items: [
    { key: "categories",  label: "Categories" },
    { key: "brands",      label: "Shop by Brand" },
    { key: "promo",       label: "Services Banner" },
    { key: "banners",     label: "Promo Banners" },
    { key: "video_banner",label: "Video Banner" },
    { key: "logo",        label: "Brand Logo" },
    { key: "coupons",     label: "Coupons" },
    { key: "offers",      label: "PDP Offers" },
    { key: "homepage",    label: "Homepage CMS" },
    { key: "navfooterseo",label: "Nav, Footer, SEO & Alerts" },
    { key: "outlets",     label: "Outlets" },
    { key: "pincodes",    label: "Delivery Zones",   href: "/admin/pincodes" },
    { key: "variants",    label: "Product Variants", href: "/admin/variants" },
    { key: "questions",   label: "Product Q&A",      href: "/admin/questions" },
    { key: "content",     label: "Policies & Copy" },
  ]},
  { group: "System", items: [
    { key: "exports",   label: "Excel Exports" },
    { key: "settings",  label: "Settings" },
    { key: "help",      label: "Help & Manual" },
  ]},
];

export type NumberedNavItem = AdminNavItem & { index: string };
export type NumberedNavGroup = { group: string; items: NumberedNavItem[] };

export const ADMIN_NAV: NumberedNavGroup[] = (() => {
  let n = 0;
  return NAV_ORDER.map((g) => ({
    group: g.group,
    items: g.items.map((item) => ({ ...item, index: String(++n).padStart(2, "0") })),
  }));
})();

const INDEX_BY_KEY: Record<string, string> = Object.fromEntries(
  ADMIN_NAV.flatMap((g) => g.items).map((it) => [it.key, it.index])
);

/**
 * The number shown beside a section heading. Falls back to an empty string
 * rather than throwing: a heading with no number is a cosmetic loss, and it is
 * not worth taking the whole console down over.
 */
export function sectionIndex(key: string): string {
  return INDEX_BY_KEY[key] ?? "";
}
