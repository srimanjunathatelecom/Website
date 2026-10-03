// Script to replace all products with Vivo mobile list
import { randomBytes, scryptSync } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env" });
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log("Deleting existing products and related data...");

// Delete in correct order due to foreign key constraints
await c.query("DELETE FROM stock_history WHERE 1=1");
await c.query("DELETE FROM product_images WHERE 1=1");
await c.query("DELETE FROM product_variants WHERE 1=1");
await c.query("DELETE FROM products WHERE 1=1");

console.log("Existing products deleted. Inserting new Vivo products...");

const vivoProducts = [
  // Y05 4G
  { name: "Y05 4G", ram: "4GB", storage: "64GB", mrp: 34999, mop: 15999 },
  { name: "Y11", ram: "4GB", storage: "64GB", mrp: 39999, mop: 18999 },
  { name: "Y11", ram: "4GB", storage: "128GB", mrp: 44999, mop: 22499 },
  { name: "Y19s", ram: "4GB", storage: "64GB", mrp: 39999, mop: 18499 },
  { name: "Y19s", ram: "4GB", storage: "128GB", mrp: 44999, mop: 22499 },
  { name: "Y21", ram: "4GB", storage: "64GB", mrp: 44999, mop: 20999 },
  { name: "Y21", ram: "4GB", storage: "128GB", mrp: 49999, mop: 23999 },
  { name: "Y21", ram: "6GB", storage: "128GB", mrp: 54999, mop: 27999 },
  { name: "Y21", ram: "8GB", storage: "128GB", mrp: 38999, mop: 22999 },
  { name: "Y31", ram: "4GB", storage: "128GB", mrp: 24999, mop: 19999 },
  { name: "Y31", ram: "6GB", storage: "128GB", mrp: 44999, mop: 27999 },
  { name: "Y31", ram: "6GB", storage: "256GB", mrp: 49999, mop: 31999 },
  { name: "Y31T", ram: "4GB", storage: "128GB", mrp: 39999, mop: 26999 },
  { name: "Y31T", ram: "6GB", storage: "128GB", mrp: 44999, mop: 31499 },
  { name: "Y31T", ram: "6GB", storage: "256GB", mrp: 49999, mop: 34999 },
  { name: "Y51 Pro", ram: "8GB", storage: "128GB", mrp: 54999, mop: 34999 },
  { name: "Y51 Pro", ram: "8GB", storage: "256GB", mrp: 59999, mop: 37999 },
  { name: "V70 FE", ram: "8GB", storage: "128GB", mrp: 53999, mop: 44999 },
  { name: "V70 FE", ram: "8GB", storage: "256GB", mrp: 56999, mop: 49999 },
  { name: "V70 FE", ram: "12GB", storage: "256GB", mrp: 64999, mop: 51999 },
  { name: "X Fold5", ram: "16GB", storage: "512GB", mrp: 154999, mop: 149999 },
  { name: "X300", ram: "12GB", storage: "256GB", mrp: 80999, mop: 75999 },
  { name: "X300", ram: "12GB", storage: "512GB", mrp: 86999, mop: 81999 },
  { name: "X300", ram: "16GB", storage: "512GB", mrp: 90999, mop: 85999 },
  { name: "X300 Pro", ram: "16GB", storage: "512GB", mrp: 119999, mop: 119999 },
  { name: "X300 FE", ram: "8GB", storage: "256GB", mrp: 109999, mop: 89999 },
  { name: "X300 FE", ram: "12GB", storage: "256GB", mrp: 119999, mop: 94999 },
  { name: "X300 FE", ram: "12GB", storage: "512GB", mrp: 129999, mop: 99999 },
  { name: "X300 Ultra", ram: "16GB", storage: "512GB", mrp: 199999, mop: 159999 },
  { name: "T5x", ram: "6GB", storage: "128GB", mrp: 45999, mop: 27999 },
  { name: "T5x", ram: "8GB", storage: "128GB", mrp: 50999, mop: 30999 },
  { name: "T5x", ram: "8GB", storage: "256GB", mrp: 56999, mop: 34999 },
  { name: "T5", ram: "6GB", storage: "128GB", mrp: 49999, mop: 34999 },
  { name: "T5", ram: "8GB", storage: "128GB", mrp: 59999, mop: 39999 },
  { name: "T5", ram: "8GB", storage: "256GB", mrp: 61999, mop: 44999 },
  { name: "T5", ram: "12GB", storage: "256GB", mrp: 69999, mop: 49999 },
  { name: "T5 Lite 5G", ram: "4GB", storage: "64GB", mrp: 30999, mop: 17999 },
  { name: "T5 Lite 5G", ram: "4GB", storage: "128GB", mrp: 33999, mop: 20499 },
  { name: "T5 Lite 5G", ram: "6GB", storage: "128GB", mrp: 38499, mop: 22999 },
  { name: "T5 Lite 5G", ram: "6GB", storage: "256GB", mrp: 42499, mop: 26999 },
  { name: "T5e", ram: "4GB", storage: "64GB", mrp: 23999, mop: 13999 },
  { name: "S2", ram: "8GB", storage: "128GB", mrp: 66999, mop: 42999 },
  { name: "S2", ram: "8GB", storage: "256GB", mrp: 70999, mop: 48999 },
  { name: "V70", ram: "8GB", storage: "256GB", mrp: 65999, mop: 59999 },
  { name: "V70", ram: "12GB", storage: "256GB", mrp: 75999, mop: 64999 },
  { name: "V70 Elite", ram: "8GB", storage: "256GB", mrp: 79999, mop: 66999 },
  { name: "V70 Elite", ram: "12GB", storage: "256GB", mrp: 89999, mop: 71999 },
  { name: "V70 Elite", ram: "12GB", storage: "512GB", mrp: 66999, mop: 61999 },
  { name: "T5 Pro 5G", ram: "8GB", storage: "128GB", mrp: 55999, mop: 41999 },
  { name: "T5 Pro 5G", ram: "8GB", storage: "256GB", mrp: 61999, mop: 46999 },
  { name: "T5 Pro 5G", ram: "12GB", storage: "256GB", mrp: 69999, mop: 39999 },
];

// Get or create Vivo brand
const { rows: brandRows } = await c.query("SELECT id FROM brands WHERE slug = 'vivo'");
let brandId;
if (brandRows.length === 0) {
  const { rows: newBrand } = await c.query(
    "INSERT INTO brands (name, slug, logo_url, active, repairable, sort_order) VALUES ($1, $2, $3, true, true, 1) RETURNING id",
    ["Vivo", "vivo", "/images/brands/vivo.svg"]
  );
  brandId = newBrand[0].id;
} else {
  brandId = brandRows[0].id;
}

// Get or create Mobiles category
const { rows: catRows } = await c.query("SELECT id FROM categories WHERE slug = 'mobiles'");
let catId;
if (catRows.length === 0) {
  const { rows: newCat } = await c.query(
    "INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id",
    ["Mobiles", "mobiles"]
  );
  catId = newCat[0].id;
} else {
  catId = catRows[0].id;
}

let productCount = 0;
let variantCount = 0;

// Group products by base name (e.g., Y11 4+64 and Y11 4+128 should be one product with variants)
const productGroups = {};
vivoProducts.forEach((p, idx) => {
  const baseName = p.name;
  if (!productGroups[baseName]) {
    productGroups[baseName] = [];
  }
  productGroups[baseName].push({ ...p, originalIndex: idx });
});

console.log(`Found ${Object.keys(productGroups).length} unique product models`);

for (const [baseName, variants] of Object.entries(productGroups)) {
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const displayName = `Vivo ${baseName}`;
  
  // Calculate average price for parent product
  const avgMrp = variants.reduce((sum, v) => sum + v.mrp, 0) / variants.length;
  const avgMop = variants.reduce((sum, v) => sum + v.mop, 0) / variants.length;
  
  // Insert parent product
  const { rows: productRows } = await c.query(
    `INSERT INTO products (name, brand, slug, description, category_id, subcategory, mrp, mop, stock,
       low_stock_threshold, sku, barcode, hsn, seo_title, meta_description, warranty, specifications,
       image_source, featured, bestseller, new_arrival, status, created_at, highlights, sale_badge,
       protect_promise_fee, seller_name, box_contents, trending, limited_stock, hot_deal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
     RETURNING id`,
    [
      displayName,
      "Vivo",
      slug,
      `${displayName} available at SMS Stores with full warranty and same-day service support.`,
      catId,
      "Smartphones",
      avgMrp,
      avgMop,
      10,
      3,
      `SKU-VIVO-${String(productCount + 1).padStart(4, "0")}`,
      `89012345${String(productCount + 1).padStart(5, "0")}`,
      "8517",
      `${displayName} price in India`,
      `Buy ${displayName} at SMS Stores.`,
      "1 Year Manufacturer Warranty",
      "Display: AMOLED|RAM: Variable|Storage: Variable",
      "upload",
      false,
      false,
      false,
      "active",
      new Date(),
      "Vivo smartphone|Best price|Warranty",
      "",
      "99",
      "SMS Stores",
      "Handset|Charger|Cable|SIM tool",
      false,
      false,
      false,
    ]
  );
  
  const productId = productRows[0].id;
  productCount++;
  
  // Add default image
  await c.query(
    `INSERT INTO product_images (product_id, data_url, alt, sort_order, variant_color, media_type)
     VALUES ($1, $2, $3, 0, '', 'image')`,
    [productId, "/images/banner-hero-1.jpg", displayName]
  );
  
  // Insert variants
  for (const variant of variants) {
    const variantSlug = `${slug}-${variant.ram.toLowerCase().replace(/\s+/g, "")}-${variant.storage.toLowerCase().replace(/\s+/g, "")}`;
    const sku = `SKU-VIVO-${variant.name.replace(/\s+/g, "").toUpperCase()}-${variant.ram.replace(/\s+/g, "")}-${variant.storage.replace(/\s+/g, "")}`;
    
    await c.query(
      `INSERT INTO product_variants (product_id, color, storage, ram, mrp, mop, stock, sku, color_hex, available, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)`,
      [productId, "Default", variant.storage, variant.ram, variant.mrp, variant.mop, 10, sku, "#000000", variantCount]
    );
    variantCount++;
  }
}

console.log(`Inserted ${productCount} products with ${variantCount} variants`);
console.log("Product update complete!");

await c.end();
