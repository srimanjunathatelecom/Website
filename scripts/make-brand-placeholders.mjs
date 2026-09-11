#!/usr/bin/env node
/**
 * Generates placeholder brand wordmarks and a generic device silhouette for the
 * repair flow, into public/images/brands and public/images/models.
 *
 * Why generate instead of downloading the real logos: a brand logo is a
 * trademark, and hotlinking one from a press kit or a logo CDN puts a
 * dependency on someone else's server into the customer-facing page. These are
 * deliberately plain typographic placeholders in each brand's own colour — they
 * read as "not the final asset" at a glance, which is the honest state of them,
 * while still giving every card the right visual weight so the grid can be
 * judged against the reference design.
 *
 * The owner replaces each one from Admin (Storefront > Shop by Brand > logo).
 * Nothing in the code references these filenames except the seed installer,
 * which only fills a logo that is still empty.
 *
 * Re-runnable: overwrites its own output and touches nothing else.
 *
 *   node scripts/make-brand-placeholders.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandsDir = path.join(root, "public", "images", "brands");
const modelsDir = path.join(root, "public", "images", "models");

/** [slug, wordmark text, text colour, optional plate colour] */
const BRANDS = [
  ["apple", "Apple", "#1d1d1f", null],
  ["samsung", "SAMSUNG", "#1428a0", null],
  ["oneplus", "OnePlus", "#eb0028", null],
  ["xiaomi", "Xiaomi", "#ffffff", "#ff6900"],
  ["redmi", "Redmi", "#ffffff", "#ff6900"],
  ["realme", "realme", "#1a1a1a", "#ffe600"],
  ["vivo", "vivo", "#415fff", null],
  ["oppo", "OPPO", "#046a38", null],
  ["poco", "POCO", "#1a1a1a", "#ffe600"],
  ["google", "Google", "#4285f4", null],
  ["nothing", "NOTHING", "#ffffff", "#111111"],
  ["motorola", "motorola", "#5c92fa", null],
  ["nokia", "NOKIA", "#124191", null],
  ["iqoo", "iQOO", "#0b8de3", null],
  ["infinix", "Infinix", "#14a05a", null],
  ["tecno", "TECNO", "#ffffff", "#1a5fd0"],
  ["honor", "HONOR", "#1a1a1a", null],
  ["huawei", "HUAWEI", "#cf0a2c", null],
  ["asus", "ASUS", "#1a1a1a", null],
  ["lg", "LG", "#a50034", null],
];

const W = 240;
const H = 120;

function wordmarkSvg(text, color, plate) {
  // Rough advance width per character at this weight, used only to keep long
  // wordmarks (motorola, SAMSUNG) inside the plate. textLength would squash
  // them instead, which looks worse than simply choosing a smaller size.
  const size = Math.min(38, Math.floor((W - 48) / (text.length * 0.62)));
  const plateRect = plate
    ? `<rect x="34" y="30" width="${W - 68}" height="${H - 60}" rx="8" fill="${plate}"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${text}">
  <rect width="${W}" height="${H}" fill="none"/>
  ${plateRect}
  <text x="${W / 2}" y="${H / 2}" fill="${color}"
        font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"
        font-size="${size}" font-weight="700" letter-spacing="0.5"
        text-anchor="middle" dominant-baseline="central">${text}</text>
</svg>
`;
}

/**
 * One generic handset outline, shown for any model whose own image hasn't been
 * uploaded yet. A single shared silhouette is better than 156 empty frames: the
 * model grid keeps its shape, and an unfilled card is obviously unfilled rather
 * than looking broken.
 */
const PHONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" width="120" height="200" role="img" aria-label="Device image not yet uploaded">
  <rect x="18" y="8" width="84" height="184" rx="14" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="26" y="22" width="68" height="150" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
  <circle cx="60" cy="15.5" r="2.2" fill="#cbd5e1"/>
  <rect x="48" y="178" width="24" height="4" rx="2" fill="#cbd5e1"/>
  <g fill="#cbd5e1">
    <circle cx="60" cy="88" r="13" fill="none" stroke="#cbd5e1" stroke-width="2.5"/>
    <path d="M52 96 L58 88 L64 94 L70 86" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

await mkdir(brandsDir, { recursive: true });
await mkdir(modelsDir, { recursive: true });

for (const [slug, text, color, plate] of BRANDS) {
  await writeFile(path.join(brandsDir, `${slug}.svg`), wordmarkSvg(text, color, plate), "utf8");
}
await writeFile(path.join(modelsDir, "generic-phone.svg"), PHONE_SVG, "utf8");

console.log(`Wrote ${BRANDS.length} brand placeholders to public/images/brands`);
console.log(`Wrote generic device placeholder to public/images/models`);
