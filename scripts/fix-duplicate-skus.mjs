#!/usr/bin/env node
/**
 * Find — and optionally repair — duplicate SKUs left behind by the old seed
 * bug where 'mobiles' and 'mobile-accessories' shared the MOB prefix.
 *
 * The seed logic was fixed in 18c51c7, but a database seeded before that fix
 * still carries the collisions. They matter at import time: the importer
 * matches rows by SKU, refuses ambiguous matches (correctly), and those
 * products then silently never receive stock updates from a sheet.
 *
 * Usage:
 *   node scripts/fix-duplicate-skus.mjs            report duplicates, change nothing
 *   node scripts/fix-duplicate-skus.mjs --fix      re-suffix the newer duplicates
 *
 * Repair strategy (deliberately boring): the oldest row keeps its SKU —
 * printed labels and past import sheets most likely refer to it — and each
 * newer duplicate gets a `-D2`, `-D3`… suffix, reported loudly so the owner
 * can relabel or correct them properly in Admin → Products.
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const FIX = process.argv.includes("--fix");

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

async function findDupes(table) {
  // product_variants has no name column — label rows by their option combo.
  const label =
    table === "products"
      ? "name"
      : "concat_ws(' / ', nullif(color, ''), nullif(storage, ''), nullif(ram, ''))";
  const { rows } = await client.query(
    `SELECT sku, array_agg(id ORDER BY id) AS ids, array_agg(${label} ORDER BY id) AS names
       FROM ${table}
      WHERE sku IS NOT NULL AND btrim(sku) <> ''
      GROUP BY sku
     HAVING count(*) > 1
      ORDER BY sku`
  );
  return rows;
}

let totalDupes = 0;
let totalFixed = 0;

for (const table of ["products", "product_variants"]) {
  const dupes = await findDupes(table);
  console.log(`\n${table}: ${dupes.length} duplicated SKU value(s)`);
  for (const d of dupes) {
    totalDupes += 1;
    console.log(`  ${d.sku}`);
    d.ids.forEach((id, i) => console.log(`    id ${id} — ${d.names[i]}${i === 0 ? "  (keeps the SKU)" : ""}`));

    if (FIX) {
      // Oldest row keeps the SKU; newer rows get -D2, -D3, …
      for (let i = 1; i < d.ids.length; i++) {
        let candidate = `${d.sku}-D${i + 1}`;
        // Never create a fresh collision while fixing an old one.
        for (let bump = i + 1; ; bump++) {
          candidate = `${d.sku}-D${bump}`;
          const { rowCount } = await client.query(`SELECT 1 FROM ${table} WHERE sku = $1`, [candidate]);
          if (rowCount === 0) break;
        }
        await client.query(`UPDATE ${table} SET sku = $1 WHERE id = $2`, [candidate, d.ids[i]]);
        totalFixed += 1;
        console.log(`    id ${d.ids[i]} → ${candidate}`);
      }
    }
  }
}

console.log(
  totalDupes === 0
    ? "\nNo duplicate SKUs — nothing to do.\n"
    : FIX
      ? `\n${totalFixed} row(s) re-suffixed. Relabel or correct them in Admin → Products.\n`
      : `\n${totalDupes} duplicated value(s) found. Re-run with --fix to repair, or correct them in Admin → Products.\n`
);

await client.end();
process.exit(0);
