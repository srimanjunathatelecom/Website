// Local-only bootstrap for performance and integration testing. Not referenced
// by the app.
import { randomBytes, scryptSync } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env" });
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`INSERT INTO store_settings (id, brand_name, legal_name, support_email, support_phone, whatsapp_number)
  VALUES (1,'SMS Stores','Smart Mobile Stores','care@example.com','+919000000000','919000000000')
  ON CONFLICT (id) DO NOTHING`);
await c.query(`INSERT INTO outlets (name, address_line, contact, email, is_main, hours_open, hours_close)
  SELECT 'K R Puram','Old Madras Road, Bengaluru','+919000000001','krpuram@example.com',true,'10:00 AM','9:00 PM'
  WHERE NOT EXISTS (SELECT 1 FROM outlets)`);
await c.query(`INSERT INTO outlets (name, address_line, contact, email, is_main, hours_open, hours_close)
  SELECT 'Bidarahalli','Bidarahalli, Bengaluru','+919000000002','bidarahalli@example.com',false,'10:00 AM','9:00 PM'
  WHERE (SELECT count(*) FROM outlets) < 2`);
await c.query(`INSERT INTO categories (name, slug) SELECT * FROM (VALUES
  ('Mobiles','mobiles'),('Accessories','accessories'),('Laptops','laptops'),('Audio','audio'))
  v WHERE NOT EXISTS (SELECT 1 FROM categories)`);

const brands = ["Samsung","Apple","Xiaomi","Realme","OnePlus","Vivo","Oppo","Nokia","Motorola","Google",
  "Asus","Poco","Infinix","Tecno","Honor","Huawei","LG","Sony","iQOO","Lava"];
for (const [i,b] of brands.entries()) {
  const slug = b.toLowerCase();
  await c.query(
    `INSERT INTO brands (name, slug, logo_url, active, repairable, sort_order)
     VALUES ($1,$2,$3,true,true,$4) ON CONFLICT (slug) DO UPDATE SET repairable=true, active=true`,
    [b, slug, `/images/brands/${slug}.svg`, brands.length - i]
  );
}
const { rows: brandRows } = await c.query(`SELECT id, name, slug FROM brands`);
for (const br of brandRows) {
  const n = br.name === "Samsung" ? 34 : 18;
  for (let i = 1; i <= n; i++) {
    const name = `${br.name} Model ${i} Pro Max Ultra 5G`;
    const slug = `${br.slug}-model-${i}`;
    await c.query(
      `INSERT INTO device_models (brand_id, name, slug, image, image_alt, release_year, popular, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8) ON CONFLICT DO NOTHING`,
      [br.id, name, slug, "/images/models/generic-phone.svg", name, 2020 + (i % 6), i <= 4, n - i]
    );
  }
}
// Repair services are deliberately NOT invented here.
//
// This script used to insert fourteen of its own - "Screen replacement",
// "Battery replacement" and so on - each priced at 999 + 250 x index. That did
// real damage on two fronts. The names collided with the genuine catalogue in
// src/lib/repair/catalogue.ts, so /repair/<brand>/<model> listed "Speaker
// repair" next to "Speaker Replacement" and "Screen replacement" next to
// "Display Replacement", which reads as a catalogue nobody maintains. Worse,
// the fabricated rows carried hard numbers while every real service says
// "Price on inspection", so a customer comparing two rows saw two different
// pricing promises from the same shop.
//
// The genuine catalogue is installed by installRepairCatalogue(), which runs
// from the seed endpoint and from Admin's "Install repair catalogue" button, and
// is idempotent. If this local database has no services yet, use that rather
// than inventing any here.
const [{ n: svcCount }] = (await c.query(`SELECT count(*)::int AS n FROM services`)).rows;
if (svcCount === 0) {
  console.warn(
    "! No repair services in this database.\n" +
    "  Install the real catalogue instead of fake rows:\n" +
    "    curl \"$NEXT_PUBLIC_SITE_URL/api/seed?key=$SEED_KEY\"\n" +
    "  or Admin > Services > Install repair catalogue."
  );
}

// Storefront products. These were missing, and their absence silently
// invalidated performance work: /products rendered an empty grid and the header
// search returned "no results", so both looked instantly fast while never
// exercising the code path a real visitor hits. Anything measuring interaction
// cost needs real rows with real images behind it.
const PRODUCT_PHOTOS = ["/images/banner-hero-1.jpg","/images/banner-hero-2.jpg","/images/banner-hero-3.jpg",
  "/images/cat-mobile-service.jpg","/images/store-interior.jpg"];
const prods = [
  ["Galaxy S24 Ultra","Samsung",129999,119999], ["Galaxy S24 Plus","Samsung",99999,89999],
  ["Galaxy A55 5G","Samsung",39999,34999],      ["Galaxy M35 5G","Samsung",24999,19999],
  ["Galaxy Z Flip 6","Samsung",109999,99999],   ["iPhone 15 Pro Max","Apple",159900,148900],
  ["iPhone 15","Apple",79900,72900],            ["iPhone 14","Apple",69900,62900],
  ["Pixel 8 Pro","Google",106999,94999],        ["Pixel 8a","Google",52999,46999],
  ["OnePlus 12","OnePlus",64999,58999],         ["OnePlus Nord CE4","OnePlus",26999,23999],
  ["Redmi Note 13 Pro","Xiaomi",25999,21999],   ["Xiaomi 14 Civi","Xiaomi",42999,38999],
  ["Vivo V30 Pro","Vivo",46999,41999],          ["Oppo Reno 12 Pro","Oppo",44999,39999],
  ["Realme GT 6","Realme",40999,35999],         ["Motorola Edge 50 Pro","Motorola",35999,29999],
];
const { rows: catRow } = await c.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
if (catRow.length) {
  const catId = catRow[0].id;
  for (const [i, [name, brand, mrp, mop]] of prods.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { rows: ins } = await c.query(
      `INSERT INTO products (name,brand,slug,description,category_id,subcategory,mrp,mop,stock,
         low_stock_threshold,sku,barcode,hsn,seo_title,meta_description,warranty,specifications,
         image_source,featured,bestseller,new_arrival,status,created_at,highlights,sale_badge,
         protect_promise_fee,seller_name,box_contents,trending,limited_stock,hot_deal)
       SELECT $1,$2,$3,$4,$5,'Smartphones',$6,$7,$8,3,$9,$10,'8517',$11,$12,
         '1 Year Manufacturer Warranty','Display: AMOLED|RAM: 8GB|Storage: 256GB','upload',
         $13,$14,$15,'active',now(),'High refresh display|Fast charging|Long battery life',
         $16,'99','SMS Stores','Handset|Charger|Cable|SIM tool',$17,$18,$19
       WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug=$3)
       RETURNING id`,
      [name, brand, slug,
       `${name} available at SMS Stores with full warranty and same-day service support.`,
       catId, mrp, mop, 12 + (i % 9), `SKU-${String(i + 1).padStart(4, "0")}`,
       `89012345${String(i + 1).padStart(5, "0")}`, `${name} price in India`,
       `Buy ${name} at SMS Stores.`, i % 3 === 0, i % 4 === 0, i % 5 === 0,
       i % 4 === 0 ? "Hot Deal" : "", i % 3 === 1, i % 6 === 0, i % 4 === 0]
    );
    if (ins.length) {
      await c.query(
        `INSERT INTO product_images (product_id, data_url, alt, sort_order, variant_color, media_type)
         VALUES ($1,$2,$3,0,'','image')`,
        [ins[0].id, PRODUCT_PHOTOS[i % PRODUCT_PHOTOS.length], name]
      );
    }
  }
}


// One active product with colour variants. fulfilment-block checks that
// cancelling an order returns stock to the *variant* row and not just the parent
// product, and it skips that check entirely when no sellable variant exists — so
// without this the most failure-prone stock path silently goes untested.
const { rows: variantParent } = await c.query(
  `SELECT id FROM products WHERE slug = 'galaxy-s24-ultra' AND status = 'active' LIMIT 1`
);
if (variantParent.length) {
  const pid = variantParent[0].id;
  for (const [i, [color, hex, storage, mrp, mop]] of [
    ["Titanium Black", "#3b3b3f", "256GB", 129999, 119999],
    ["Titanium Grey", "#8e8e93", "512GB", 141999, 131999],
  ].entries()) {
    await c.query(
      `INSERT INTO product_variants
         (product_id, color, storage, ram, mrp, mop, stock, sku, color_hex, available, sort_order)
       SELECT $1,$2,$3,'12GB',$4,$5,25,$6,$7,true,$8
       WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = $6)`,
      [pid, color, storage, mrp, mop, `SKU-S24U-${storage}`, hex, i]
    );
  }
  // Keep the parent comfortably in stock so the variant assertions are not
  // masked by the product-level stock guard.
  await c.query(`UPDATE products SET stock = GREATEST(stock, 25) WHERE id = $1`, [pid]);
}

// Admin account for the integration suite. Eight of the fourteen suites in
// tests/ sign in as an admin before they can check anything, so without this row
// they abort on "admin login failed" and report as failures that look like
// product bugs. The email and password come from the same INITIAL_ADMIN_*
// variables the app's own /api/seed route uses, so local config stays the single
// source of truth and the tests and the app cannot drift apart.
//
// Hashing matches src/lib/auth.ts exactly (scrypt, 64 bytes, "salt:hash"). If
// that ever changes, this must change with it or local admin login breaks.
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
if (adminEmail && adminPassword) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(adminPassword, salt, 64).toString("hex")}`;
  const { rows: mainOutlet } = await c.query(
    `SELECT id FROM outlets ORDER BY is_main DESC, id LIMIT 1`
  );
  await c.query(
    `INSERT INTO admins (name, email, password_hash, role, outlet_id, created_at)
     VALUES ($1,$2,$3,'owner',$4,now())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'owner'`,
    ["Store Owner", adminEmail, passwordHash, mainOutlet[0]?.id ?? null]
  );
} else {
  console.warn(
    "skipped admin seed: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD in .env,\n" +
    "  otherwise the admin-authenticated test suites cannot sign in."
  );
}

const { rows: cnt } = await c.query(
  `SELECT (SELECT count(*) FROM brands) b, (SELECT count(*) FROM device_models) m, (SELECT count(*) FROM services) s, (SELECT count(*) FROM products) p, (SELECT count(*) FROM admins) a, (SELECT count(*) FROM product_variants) v`);
console.log("seeded:", cnt[0]);
await c.end();
