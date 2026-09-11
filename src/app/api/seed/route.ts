import { db } from "@/db";
import {
  storeSettings,
  outlets,
  categories,
  products,
  productImages,
  services,
  contentPages,
  coupons,
  admins,
  notificationSettings,
  banners,
  productVariants,
  customers,
  reviews,
  productQuestions,
} from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { installRepairCatalogue } from "@/lib/repair/catalogue";
import { imageForProductName, renderProduct, renderProductDark, renderStorefront } from "@/lib/productRender";

export const dynamic = "force-dynamic";

function svg(title: string, sub: string, bg: [string, string]) {
  const t = String(title).slice(0, 22).replace(/&/g, "and");
  const s = String(sub).slice(0, 28);
  const data = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='450'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${bg[0]}'/><stop offset='1' stop-color='${bg[1]}'/></linearGradient></defs><rect width='600' height='450' fill='url(#g)'/><circle cx='300' cy='180' r='46' fill='rgba(255,255,255,.18)'/><text x='50%' y='46%' font-family='Segoe UI,Arial' font-size='32' font-weight='700' fill='white' text-anchor='middle'>${t}</text><text x='50%' y='56%' font-family='Segoe UI,Arial' font-size='17' fill='rgba(255,255,255,.85)' text-anchor='middle'>${s}</text><text x='50%' y='92%' font-family='Segoe UI,Arial' font-size='14' fill='rgba(255,255,255,.7)' text-anchor='middle'>SMS Stores</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(data);
}

function photoSvg(title: string) {
  // Designed storefront illustration (facade, awning, lit display shelves)
  // instead of a flat gradient; replaced whenever the admin uploads a photo.
  return renderStorefront(title.toUpperCase());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requiredKey = process.env.SEED_KEY;
  if (!requiredKey) {
    // No fallback secret. Without SEED_KEY set, this endpoint refuses to
    // run at all rather than accepting a guessable default — a hardcoded
    // fallback here would let anyone bootstrap/reset the store.
    return Response.json(
      { error: "SEED_KEY environment variable is not set. Set it before using this endpoint." },
      { status: 503 }
    );
  }
  const providedKey = url.searchParams.get("key");
  if (providedKey !== requiredKey) {
  

  return Response.json({ error: "Invalid seed key." }, { status: 403 });
  }

  const log: string[] = [];
  const reset = url.searchParams.get("reset") === "1";

  // Demo catalogue content — sample products, variant matrices, demo
  // reviewers/reviews and product Q&A — exists so development and staging
  // have something to render and test against. A real production store must
  // never be bootstrapped with fake products or fake reviews, so in
  // production this content is opt-in only (&demo=1). Structural bootstrap
  // (settings, outlets, categories, services, content pages, banners, the
  // first admin) still runs everywhere.
  const demo = url.searchParams.get("demo") === "1" || process.env.NODE_ENV !== "production";

  // The destructive path (?reset=1 — deletes existing products/banners
  // and re-inserts demo data) is only ever appropriate during local
  // development or a deliberate one-off content refresh. In production
  // it stays permanently reachable behind SEED_KEY, which is too much
  // standing risk for something this destructive: a leaked or brute-
  // forced key would let anyone wipe live catalogue data. The safe,
  // idempotent bootstrap path below (insert-if-empty, including the
  // one-time admin account) is unaffected and still runs normally in
  // production — that's the legitimate first-deploy use case.
  if (reset && process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "Destructive reset is disabled in production. Run this against a non-production environment instead." },
      { status: 403 }
    );
  }

  const [{ c: settingsCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(storeSettings);
  if (settingsCount === 0) {
    await db.insert(storeSettings).values({ id: 1 });
    log.push("store settings");
  }

  const [{ c: nsCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(notificationSettings);
  if (nsCount === 0) {
    await db.insert(notificationSettings).values({ id: 1 });
    log.push("notification settings");
  }

  const [{ c: outletCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(outlets);
  if (outletCount === 0) {
    await db.insert(outlets).values([
      {
        name: "Smart Mobile Stores — K R Puram (Main)",
        addressLine:
          "37/A, A, Seegehalli Main Road, Virgonagar Post, K R Puram Hobli, Maria Villa, Bengaluru, Karnataka, 560049",
        contact: "7996663356",
        email: "smartmobilestores2022@gmail.com",
        mapsUrl: "https://maps.app.goo.gl/CPKRdQf7pxMqVLaN7",
        photo: photoSvg("Main Outlet — K R Puram"),
        isMain: true,
        hoursOpen: "10:00 AM",
        hoursClose: "9:00 PM",
      },
      {
        name: "SMS Stores — Bidarahalli",
        addressLine:
          "Building No. 3, SY No. 75/1, Punyabhoomi Layout, Bidarahalli, Bengaluru, Karnataka, 560049",
        contact: "8892536695",
        email: "appusathi1996@gmail.com",
        mapsUrl: "https://maps.app.goo.gl/XZDncP624tC1wFW98",
        photo: photoSvg("Bidarahalli Outlet"),
        isMain: false,
        hoursOpen: "10:00 AM",
        hoursClose: "9:00 PM",
      },
    ]);
    log.push("outlets");
  }

  const [{ c: catCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(categories);
  let catIds: Record<string, number> = {};
  if (catCount === 0) {
    const cats = [
      { name: "Mobile Phones", slug: "mobiles", image: renderProduct("phone", "ink"), description: "Genuine smartphones with honest MOP pricing." },
      { name: "Mobile Service", slug: "mobile-service", image: renderProduct("phone-alt", "sky"), description: "Careful diagnosis and dependable phone repairs." },
      { name: "Mobile Accessories", slug: "mobile-accessories", image: renderProduct("earbuds", "violet"), description: "Everyday essentials selected for quality and value." },
      { name: "Laptop Service", slug: "laptop-service", image: renderProduct("laptop", "graphite"), description: "Expert laptop diagnostics and repair by our team." },
      { name: "Laptop Accessories", slug: "laptop-accessories", image: renderProduct("backpack", "coral"), description: "Upgrades and gear to get more from your laptop." },
    ];
    for (const c of cats) {
      const [row] = await db.insert(categories).values(c).returning();
      catIds[c.slug] = row.id;
    }
    log.push("categories");
  } else {
    const all = await db.select().from(categories);
    for (const c of all) catIds[c.slug] = c.id;
  }

  const [{ c: prodCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(products);
  if (reset) {
    const all = await db.select({ id: products.id }).from(products);
    if (all.length) await db.delete(productImages).where(sql`${productImages.productId} IN (${sql.join(all.map((p) => sql`${p.id}`), sql`, `)})`);
    await db.delete(products);
    log.push("products reset");
  }
  if (demo && (reset || prodCount === 0)) {
    const defs: {
      name: string; brand: string; cat: string; mrp: number; mop: number; stock: number;
      bestseller?: boolean; featured?: boolean; newArrival?: boolean; src: string;
      spec: string; war: string; tag?: string;
    }[] = [
      // ---- Mobile Phones ----
      { name: "Google Pixel 10a 5G (8GB/256GB)", brand: "Google", cat: "mobiles", mrp: 59999, mop: 45881, stock: 14, bestseller: true, featured: true, src: "Manufacturer-authorized", spec: "Display | 6.3\" pOLED 120Hz\nChipset | Tensor G4\nBattery | 5,100 mAh\nCamera | 48MP + 13MP\nOS | Android 15, 7 yrs updates", war: "1 year Google India warranty", tag: "AI Camera Flagship" },
      { name: "Vivo Y11 5G (4GB/64GB) Sunrise", brand: "Vivo", cat: "mobiles", mrp: 16999, mop: 15724, stock: 22, src: "Manufacturer-authorized", spec: "Display | 6.68\" HD+ 120Hz\nChipset | Dimensity 6300\nBattery | 6,000 mAh\nCamera | 50MP AI dual\nCharging | 44W FlashCharge", war: "1 year Vivo warranty" },
      { name: "OnePlus Nord CE6 5G (8GB/256GB)", brand: "OnePlus", cat: "mobiles", mrp: 43999, mop: 35999, stock: 9, bestseller: true, featured: true, src: "Manufacturer-authorized", spec: "Display | 6.77\" 1.5K 120Hz AMOLED\nChipset | Snapdragon 7s Gen 3\nBattery | 7,100 mAh\nCharging | 80W SUPERVOOC\nCamera | 50MP OIS", war: "1 year OnePlus warranty", tag: "Editor's Pick" },
      { name: "POCO C85x 5G (4GB/64GB) Emerald", brand: "POCO", cat: "mobiles", mrp: 20999, mop: 12024, stock: 30, newArrival: true, src: "Manufacturer-authorized", spec: "Display | 6.9\" HD+ 120Hz\nChipset | Dimensity 6300\nBattery | 6,000 mAh\nCamera | 50MP\nAudio | 3.5mm jack + FM", war: "1 year POCO warranty" },
      { name: "Google Pixel 10 (12GB/256GB)", brand: "Google", cat: "mobiles", mrp: 79999, mop: 64999, stock: 6, featured: true, src: "Manufacturer-authorized", spec: "Display | 6.3\" Super Actua 120Hz\nChipset | Tensor G5\nBattery | 4,970 mAh\nCamera | 48MP + 13MP + 10.8MP tele\nAI | Gemini built-in", war: "1 year Google India warranty", tag: "Gemini Inside" },
      { name: "Nothing Phone (3a) Lite 5G (8GB/128GB)", brand: "Nothing", cat: "mobiles", mrp: 29999, mop: 26999, stock: 18, newArrival: true, src: "Manufacturer-authorized", spec: "Display | 6.77\" AMOLED 120Hz\nChipset | Dimensity 7300 Pro\nBattery | 5,000 mAh\nCamera | 50MP triple\nDesign | Glyph Interface", war: "1 year Nothing warranty" },
      { name: "Apple iPhone 15 (128GB)", brand: "Apple", cat: "mobiles", mrp: 79900, mop: 66900, stock: 5, bestseller: true, featured: true, src: "Manufacturer-authorized", spec: "Display | 6.1\" Super Retina XDR\nChip | A16 Bionic\nCamera | 48MP + 12MP\nPort | USB-C\nBuild | Aluminium + Ceramic Shield", war: "1 year Apple India warranty", tag: "Bestseller" },
      { name: "Samsung Galaxy M14 5G (4GB/64GB)", brand: "Samsung", cat: "mobiles", mrp: 15999, mop: 10999, stock: 3, src: "Manufacturer-authorized", spec: "Display | 6.6\" FHD+ 90Hz\nChipset | Exynos 1330\nBattery | 6,000 mAh\nCamera | 50MP triple\n5G | 13 bands", war: "1 year Samsung warranty" },
      { name: "Realme Narzo 70 Pro 5G (8GB/128GB)", brand: "Realme", cat: "mobiles", mrp: 21999, mop: 16999, stock: 26, src: "Manufacturer-authorized", spec: "Display | 6.67\" AMOLED 120Hz\nChipset | Dimensity 7050\nBattery | 5,000 mAh\nCharging | 67W SUPERVOOC\nCamera | 50MP Sony IMX890 OIS", war: "1 year Realme warranty" },
      { name: "Oppo Find X9 Ultra 5G (16GB/512GB)", brand: "Oppo", cat: "mobiles", mrp: 129999, mop: 109999, stock: 2, featured: true, src: "Manufacturer-authorized", spec: "Display | 6.82\" 2K LTPO 120Hz\nChipset | Snapdragon 8 Elite\nCamera | Hasselblad quad 50MP\nBattery | 5,700 mAh\nCharging | 100W + 50W wireless", war: "1 year Oppo warranty", tag: "Hasselblad Pro" },

      // ---- Mobile Accessories ----
      { name: "boAt Airdopes 141 True Wireless Earbuds", brand: "boAt", cat: "mobile-accessories", mrp: 2999, mop: 1299, stock: 60, bestseller: true, src: "Our own photo", spec: "Playback | 42 hours total\nDrivers | 8mm\nMics | ENx dual\nRating | IPX4\nLatency | 60ms gaming mode", war: "1 year boAt warranty" },
      { name: "JBL Go 3 Portable Bluetooth Speaker", brand: "JBL", cat: "mobile-accessories", mrp: 3499, mop: 2299, stock: 24, featured: true, src: "Our own photo", spec: "Output | 4.2W\nRating | IP67 dust & water\nPlayback | 5 hours\nBluetooth | 5.1\nDesign | Integrated loop", war: "1 year JBL warranty" },
      { name: "Samsung 25W Type-C Super Fast Charger", brand: "Samsung", cat: "mobile-accessories", mrp: 1799, mop: 999, stock: 45, src: "Our own photo", spec: "Output | 25W PD 3.0\nPort | USB-C\nCable | Included 1m\nSafety | 8-layer protection\nCompat | Galaxy / Pixel / iPhone 15+", war: "6 months Samsung warranty" },
      { name: "Spigen Ultra Hybrid Clear Case", brand: "Spigen", cat: "mobile-accessories", mrp: 1299, mop: 699, stock: 80, src: "Our own photo", spec: "Material | PC back + TPU bumper\nDrop | Military-grade MIL-STD 810G\nFinish | Anti-yellowing clear\nButtons | Tactile covers\nWireless | Qi compatible", war: "1 year Spigen warranty" },
      { name: "Syska 1m Braided USB-C Fast Charge Cable", brand: "Syska", cat: "mobile-accessories", mrp: 499, mop: 199, stock: 120, src: "Our own photo", spec: "Current | 3A\nLength | 1 metre\nJacket | Nylon braided\nConnector | Aluminium shell\nBends | 10,000+ rated", war: "6 months Syska warranty" },
      { name: "boAt Rockerz 450 On-Ear Headphones", brand: "boAt", cat: "mobile-accessories", mrp: 2499, mop: 1499, stock: 28, src: "Our own photo", spec: "Drivers | 40mm\nPlayback | 15 hours\nControls | On-ear buttons\nMic | Built-in\nFit | Padded adjustable", war: "1 year boAt warranty" },

      // ---- Laptop Accessories ----
      { name: "100W Universal Laptop Adapter (USB-C PD)", brand: "SMS Power", cat: "laptop-accessories", mrp: 4499, mop: 2799, stock: 26, src: "Our own photo", spec: "Output | 100W GaN PD\nPorts | 2× USB-C + 1× USB-A\nInput | 100-240V\nCable | 1.5m detachable\nCompat | MacBook, Dell, HP, Lenovo", war: "1 year SMS warranty", tag: "WFH Essential" },
      { name: "90W Universal Type-C Laptop Charger", brand: "SMS Power", cat: "laptop-accessories", mrp: 3999, mop: 2499, stock: 32, src: "Our own photo", spec: "Output | 90W PD 3.0\nForm | Compact brick\nProtection | OVP / OCP / OTP\nCable | 1.2m Type-C\nWarranty | 12 months", war: "1 year SMS warranty" },
      { name: "AeroBook Pro Sleeve 14\" (Padded)", brand: "AeroBook", cat: "laptop-accessories", mrp: 2499, mop: 1499, stock: 30, src: "Our own photo", spec: "Fits | Up to 14\" laptops\nPadding | 8mm shock foam\nPocket | Front zip accessory\nLining | Soft micro-fleece\nClosure | YKK zipper", war: "1 year AeroBook warranty" },
      { name: "AeroBook Pro Sleeve 15\" (Padded)", brand: "AeroBook", cat: "laptop-accessories", mrp: 2799, mop: 1699, stock: 24, src: "Our own photo", spec: "Fits | Up to 15.6\" laptops\nPadding | 8mm shock foam\nPocket | Dual front zip\nLining | Soft micro-fleece\nClosure | YKK zipper", war: "1 year AeroBook warranty" },
      { name: "Commuter Laptop Backpack (15.6\")", brand: "AeroBook", cat: "laptop-accessories", mrp: 3499, mop: 2199, stock: 18, featured: true, src: "Our own photo", spec: "Capacity | 22L\nLaptop | Padded 15.6\" sleeve\nMaterial | Water-resistant 600D\nCompartments | 3 + organiser\nExtras | USB pass-through, trolley strap", war: "1 year AeroBook warranty", tag: "Commuter Favourite" },
      { name: "ErgoFlex Aluminium Laptop Stand", brand: "ErgoFlex", cat: "laptop-accessories", mrp: 1999, mop: 1099, stock: 28, src: "Our own photo", spec: "Material | Anodised aluminium\nAdjust | 6 height levels\nFits | 10\"-17\" laptops\nLoad | Up to 10kg\nVentilation | Open-air design", war: "1 year ErgoFlex warranty", tag: "WFH Essential" },
      { name: "Logitech M190 Wireless Mouse", brand: "Logitech", cat: "laptop-accessories", mrp: 1499, mop: 799, stock: 40, bestseller: true, src: "Our own photo", spec: "Sensor | 1000 DPI optical\nBattery | 18 months (AA)\nRange | 10m Unifying\nButtons | 3 + scroll wheel\nGrip | Full-size contoured", war: "1 year Logitech warranty" },
      { name: "Western Digital 1TB NVMe SSD (SN580)", brand: "Western Digital", cat: "laptop-accessories", mrp: 7999, mop: 5999, stock: 16, newArrival: true, src: "Our own photo", spec: "Form | M.2 2280 PCIe Gen4\nRead | Up to 4,150 MB/s\nWrite | Up to 4,150 MB/s\nEndurance | 600 TBW\nWarranty | 5 years limited", war: "5 year WD warranty" },
    ];

    let idxByCat: Record<string, number> = {};
    for (const d of defs) {
      const i = idxByCat[d.cat] || 0;
      idxByCat[d.cat] = i + 1;
      const image = imageForProductName(d.cat, d.name, i);
      const [p] = await db
        .insert(products)
        .values({
          name: d.name,
          brand: d.brand,
          slug: d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) + "-" + Math.random().toString(36).slice(2, 6),
          description: `${d.name}. ${d.tag ? d.tag + ". " : ""}Genuine product, honest MOP pricing, backed by ${d.war}. Key highlights — ${d.spec.replace(/\n/g, " · ")}.`,
          categoryId: catIds[d.cat],
          mrp: String(d.mrp),
          mop: String(d.mop),
          stock: d.stock,
          lowStockThreshold: 5,
          // Prefix from every word of the category slug ("mobile-accessories" →
          // MOBACC) — slicing only the first three letters made "mobiles" and
          // "mobile-accessories" share the MOB prefix, and with the per-category
          // counter both restarting at 1000 the seed produced duplicate SKUs.
          sku: "SMS-" + d.cat.split("-").map((w) => w.slice(0, 3).toUpperCase()).join("") + String(1000 + i),
          warranty: d.war,
          specifications: d.spec,
          imageSource: d.src,
          bestseller: !!d.bestseller,
          newArrival: !!d.newArrival,
          featured: !!d.featured,
          status: "active",
        })
        .returning();
      await db.insert(productImages).values({ productId: p.id, dataUrl: image, alt: d.name, sortOrder: 0 });
    }
    log.push("products");
  }

  const [{ c: svcCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(services);
  if (svcCount === 0) {
    const svcs = [
      { name: "Screen Replacement", description: "Original-quality display replacement for phones & laptops.", deviceTypes: "Mobile, Laptop", startPrice: "From ₹1,200", turnaround: "Same day", sortOrder: 1 },
      { name: "Battery Replacement", description: "Genuine battery replacement to restore full-day backup.", deviceTypes: "Mobile, Laptop", startPrice: "From ₹800", turnaround: "Same day", sortOrder: 2 },
      { name: "Water Damage Repair", description: "Ultrasonic cleaning & component-level repair after liquid damage.", deviceTypes: "Mobile, Laptop", startPrice: "Price on inspection", turnaround: "1-2 days", sortOrder: 3 },
      { name: "Laptop OS Reinstall", description: "Windows/Linux reinstall, driver setup and optimisation.", deviceTypes: "Laptop", startPrice: "From ₹499", turnaround: "Same day", sortOrder: 4 },
      { name: "Motherboard Repair", description: "Component-level motherboard diagnosis and repair.", deviceTypes: "Mobile, Laptop", startPrice: "Price on inspection", turnaround: "2-4 days", sortOrder: 5 },
      { name: "Data Recovery", description: "Recover photos, contacts and files from damaged devices.", deviceTypes: "Mobile, Laptop", startPrice: "From ₹999", turnaround: "1-3 days", sortOrder: 6 },
    ];
    await db.insert(services).values(svcs);
    log.push("services");
  }

  // Repair catalogue (idempotent — fills the full mobile-repair service list
  // with real, licence-verified images; never duplicates or overwrites).
  const repairResult = await installRepairCatalogue();
  if (repairResult.created.length > 0 || repairResult.updated.length > 0) {
    log.push(`repair-catalogue (+${repairResult.created.length} new, ${repairResult.updated.length} updated)`);
  }

  const [{ c: contentCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(contentPages);
  if (contentCount === 0) {
    const pages = [
      { slug: "about", title: "About Us", body: "SMS Stores (legal name: Smart Mobile Stores) is a trusted mobile & laptop shop in Bengaluru.\n\nWe sell genuine products at MOP — not MRP — so customers always save. Our expert technicians handle repairs for all major brands across our two outlets.\n\nVisit us at K R Puram (Main) or Bidarahalli. Real prices. Real savings. Every day." },
      { slug: "terms-and-conditions", title: "Terms & Conditions", body: "1. By using this website you agree to these terms.\n\n2. Prices shown are MOP (Maximum Retail Price minus our margin) and may change without notice.\n\n3. Products are subject to availability. Images are for illustration.\n\n4. All sales are governed by the laws of India and Karnataka jurisdiction.\n\n5. We are an authorised dealer for the brands we represent; other products use our own photography." },
      { slug: "privacy-policy", title: "Privacy Policy", body: "We collect only the information needed to fulfil your orders and service requests (name, contact, address, device details).\n\nWe do not sell your data. Location is used only to suggest the nearest outlet and pre-fill delivery address, and only with your permission.\n\nYou may request deletion of your account data by emailing our support." },
      { slug: "warranty-policy", title: "Warranty & Replacement Policy", body: "Most products include the manufacturer's standard warranty (see product page).\n\nRepairs carry a 30-day service warranty. Defective units within the warranty window can be claimed from your order history.\n\nPhysical damage and water damage are not covered unless separately insured. We do not offer old-phone exchange." },
      { slug: "shipping-policy", title: "Shipping Policy", body: "Orders are processed within 24 hours and delivered across Bengaluru, typically in 1-3 business days.\n\nCash on Delivery, UPI, cards and net-banking are accepted. Tracking is available from your account." },
      { slug: "faq", title: "FAQ", body: "Q: How do I get the MOP price?\nA: Just order online or visit our store — the listed price IS the MOP.\n\nQ: Do you repair all brands?\nA: Yes, our technicians handle all major mobile and laptop brands.\n\nQ: Can I pay on delivery?\nA: Yes, Cash on Delivery is available.\n\nQ: How do I raise a warranty claim?\nA: Go to your order history and use the 'Raise claim' button." },
      { slug: "help", title: "Help Centre", body: "Creating an account: tap Account and sign up with email & password.\n\nSearching: use the top search bar with auto-suggestions.\n\nBooking a repair: open Book a Repair, pick a service, describe the issue, choose an outlet.\n\nTracking: open Track Order and enter your order or booking number.\n\nCOD: select Cash on Delivery at checkout.\n\nWarranty claim: from your order, click Raise claim.\n\nContact: both outlets' phone/email/WhatsApp are on the Contact page." },
    ];
    await db.insert(contentPages).values(pages);
    log.push("content pages");
  }

  const [{ c: couponCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(coupons);
  if (demo && couponCount === 0) {
    await db.insert(coupons).values([
      { code: "WELCOME10", type: "percent", value: "10", minOrder: "1000", active: true },
      { code: "SMS500", type: "fixed", value: "500", minOrder: "15000", active: true },
    ]);
    log.push("coupons");
  }

  const [{ c: bannerCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(banners);
  if (reset) { await db.delete(banners); }
  if (reset || bannerCount === 0) {
    await db.insert(banners).values([
      // Hero banners use real photographic artwork from /public/images
      // rather than photoSvg(). photoSvg paints its label into the image,
      // and the carousel also renders banner.title as an overlay headline,
      // so a hero seeded with photoSvg showed the same words twice, the
      // baked-in copy colliding with the live text. These three files are
      // deliberately composed with an empty left two-thirds so the overlay
      // has somewhere to sit. The shopkeeper replaces them from
      // Admin → Banners; nothing here is load-bearing.
      { title: "Mega Mobile Sale — Up to 40% off MRP", subtitle: "We sell at MOP, not MRP. Latest phones, honest pricing.", image: "/images/banner-hero-1.jpg", link: "/products?category=mobiles", slot: "hero", active: true, sortOrder: 1 },
      { title: "Expert Repairs, Trusted by Bengaluru", subtitle: "Screen, battery, water damage — same-day service at both outlets.", image: "/images/banner-hero-2.jpg", link: "/services", slot: "hero", active: true, sortOrder: 2 },
      { title: "Visit Our Stores — K R Puram & Bidarahalli", subtitle: "Real prices. Real savings. Every single day.", image: "/images/banner-hero-3.jpg", link: "/contact", slot: "hero", active: true, sortOrder: 3 },
      // "strip" banners get image: null deliberately. photoSvg paints the
      // title into the artwork at a fixed size, which the strip then crops, and
      // supplying any image made the renderer take its image-only path and drop
      // the title/subtitle/CTA entirely. Null reaches the designed typographic
      // tile instead, and leaves the admin's image field genuinely empty so it
      // reads as "not set yet" rather than "already has artwork".
      // "strip" banners: the plain 3-across row shown after Best Sellers and
      // after Featured on the homepage (PromoBannerStrip). Real demo content
      // matching the store's actual offers, not placeholder text — 3 rows so
      // the strip renders 3 distinct tiles instead of relying on fallback
      // padding or (pre-fix) accidentally repeating one image.
      { title: "New Arrivals", subtitle: "Latest phone launches, in stock now", image: null, link: "/products?sort=newest", slot: "strip", active: true, sortOrder: 4 },
      { title: "EMI Available", subtitle: "No-cost card EMIs on select phones", image: null, link: "/contact", slot: "strip", active: true, sortOrder: 5 },
      { title: "Same-Day Repairs", subtitle: "Screen, battery and board-level fixes at both outlets", image: null, link: "/services", slot: "strip", active: true, sortOrder: 6 },
    ]);
    log.push("banners");
  }

  const [{ c: adminCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(admins);
  let bootstrapAdmin: { email: string; usedGeneratedPassword: boolean; generatedPassword?: string } | null = null;
  if (adminCount === 0) {
    const { desc } = await import("drizzle-orm");
    const outletRows = await db.select().from(outlets).orderBy(desc(outlets.isMain), outlets.id);

    // Never fall back to a fixed literal password (e.g. "owner1234") for
    // the very first admin account — a hardcoded default is a public
    // credential the moment this code is public, and this is exactly
    // the account a real shopkeeper's store depends on. If the operator
    // hasn't set INITIAL_ADMIN_PASSWORD, generate a strong random one
    // and return it once in this response so it can be copied and
    // immediately rotated — it is never logged or stored in plaintext.
    const crypto = await import("crypto");
    const generatedPassword = crypto.randomBytes(9).toString("base64url");
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || generatedPassword;
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@smsstores.com";

    await db.insert(admins).values([
      { name: "Store Owner", email: adminEmail, passwordHash: hashPassword(initialPassword), role: "owner", outletId: outletRows[0]?.id ?? null }
    ]);
    log.push("admins");
    bootstrapAdmin = {
      email: adminEmail,
      usedGeneratedPassword: !process.env.INITIAL_ADMIN_PASSWORD,
      // Only surfaced this one time, only when we generated it ourselves —
      // an operator-supplied password is never echoed back.
      generatedPassword: process.env.INITIAL_ADMIN_PASSWORD ? undefined : generatedPassword,
    };
  }


  // ---------------------------------------------------------------------
  // Catalogue enrichment (idempotent: only runs while product_variants is
  // empty). Gives every phone a colour/config variant matrix, a multi-image
  // gallery, and adds clearly-generic demo reviews & answered questions so
  // the PDP, variant picker, ratings and Q&A can be exercised end-to-end.
  // Demo customers use @smsstores.test addresses; review copy is generic
  // shopping-experience text, never invented product claims.
  // ---------------------------------------------------------------------
  const [{ c: variantCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(productVariants);
  if (demo && variantCount === 0 && catIds["mobiles"]) {
    const phones = await db.select().from(products).where(eq(products.categoryId, catIds["mobiles"]));

    const COLOURS: [string, string, string][] = [
      ["Obsidian Black", "ink", "#0f172a"],
      ["Glacier Blue", "sky", "#38bdf8"],
      ["Mint Green", "mint", "#34d399"],
      ["Violet Haze", "violet", "#8b5cf6"],
      ["Sunset Coral", "coral", "#fb7185"],
      ["Pearl White", "pearl", "#e2e8f0"],
      ["Graphite Grey", "graphite", "#4b5563"],
      ["Amber Gold", "amber", "#f59e0b"],
    ];

    for (const p of phones) {
      // Configuration parsed from the product's own name — never invented.
      const both = p.name.match(/\((\d+)GB\/(\d+)GB\)/);
      const solo = p.name.match(/\((\d+)GB\)/);
      const ram = both ? `${both[1]}GB` : "";
      const baseStorage = both ? `${both[2]}GB` : solo ? `${solo[1]}GB` : "";
      const baseGb = parseInt(baseStorage) || 0;
      const upStorage = baseGb >= 512 ? "" : baseGb ? (baseGb * 2 >= 1024 ? "1TB" : `${baseGb * 2}GB`) : "";

      const kind = p.name.toLowerCase().includes("iphone") || Number(p.mop) > 40000 ? "phone" : "phone-alt";
      const start = p.id % COLOURS.length;
      const picks = [COLOURS[start], COLOURS[(start + 2) % COLOURS.length], COLOURS[(start + 5) % COLOURS.length]];
      const configs: { ram: string; storage: string; bump: number }[] = [{ ram, storage: baseStorage, bump: 0 }];
      if (upStorage) configs.push({ ram, storage: upStorage, bump: 4000 });

      const totalCombos = picks.length * configs.length;
      const per = Math.max(2, Math.floor(Number(p.stock) / totalCombos));
      let sort = 0;
      const rows = [];
      for (const cfg of configs) {
        for (let ci = 0; ci < picks.length; ci++) {
          const [cName, cPalette, cHex] = picks[ci];
          rows.push({
            productId: p.id,
            color: cName,
            storage: cfg.storage,
            ram: cfg.ram,
            mrp: String(Number(p.mrp) + cfg.bump),
            mop: String(Number(p.mop) + cfg.bump),
            // One deliberate out-of-stock combo per phone so the disabled
            // state in the variant picker is exercised by real data.
            stock: sort === totalCombos - 1 ? 0 : per,
            sku: `SMS-P${p.id}-${cName.split(" ")[0].toUpperCase()}-${cfg.storage || "STD"}`,
            image: renderProduct(kind, cPalette),
            colorHex: cHex,
            sortOrder: sort++,
          });
        }
      }
      await db.insert(productVariants).values(rows);

      // Gallery: front render per lead colour + a dark studio shot.
      await db.insert(productImages).values([
        { productId: p.id, dataUrl: renderProduct(kind === "phone" ? "phone-alt" : "phone", picks[0][1]), alt: `${p.name} — rear view`, sortOrder: 1 },
        { productId: p.id, dataUrl: renderProductDark(kind, picks[1][1]), alt: `${p.name} — studio shot`, sortOrder: 2 },
      ]);
    }

    // Demo reviewers (test-domain emails, shared throwaway password).
    const demoPeople = [
      { name: "Aarav K.", email: "aarav.demo@smsstores.test" },
      { name: "Priya S.", email: "priya.demo@smsstores.test" },
      { name: "Rahul M.", email: "rahul.demo@smsstores.test" },
    ];
    const demoHash = await hashPassword("Demo#Local2026");
    const demoIds: number[] = [];
    for (const d of demoPeople) {
      const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, d.email));
      if (existing.length) demoIds.push(existing[0].id);
      else {
        const [row] = await db.insert(customers).values({ name: d.name, email: d.email, passwordHash: demoHash }).returning();
        demoIds.push(row.id);
      }
    }

    // Generic experience reviews — no product-spec claims.
    const reviewCopy: [number, string, string][] = [
      [5, "Smooth buying experience", "Checked the phone at the counter before paying. Billing was quick and the price matched what the site showed."],
      [4, "Good price, quick delivery", "Ordered in the morning and picked it up the same day. Saved a fair bit versus the sticker price elsewhere."],
      [5, "Genuine unit, proper bill", "Sealed box with a GST bill from the store. Activation and data transfer were done for me in-store."],
      [3, "Phone is fine, wait was long", "No complaints about the device itself, but the store was busy and billing took a while on a weekend."],
    ];
    const reviewTargets = phones.filter((p) => p.bestseller || p.featured).slice(0, 8);
    for (let i = 0; i < reviewTargets.length; i++) {
      const p = reviewTargets[i];
      const take = reviewCopy.slice(0, 2 + (i % 2));
      await db.insert(reviews).values(
        take.map(([rating, title, body], j) => ({
          productId: p.id,
          customerId: demoIds[(i + j) % demoIds.length],
          customerName: demoPeople[(i + j) % demoPeople.length].name,
          rating,
          title,
          body,
          verifiedPurchase: j < 2,
          helpfulCount: (i + j * 3) % 7,
        }))
      );
    }

    // Store-policy Q&A (answers describe store services, not device specs).
    const qa: [string, string][] = [
      ["Is cash on delivery available for this phone?", "Yes — COD is available across our Bengaluru delivery area, and you can also pay by card or UPI at the store."],
      ["Do I get a proper bill and warranty?", "Yes. Every phone ships sealed with a GST invoice from our authorised store, and the standard brand warranty applies."],
      ["Can I pay with a card or EMI at the store?", "Yes — cards, UPI and EMI on select bank cards are all accepted at both outlets as well as online."],
      ["Is no-cost EMI available?", "No-cost EMI is available on select bank cards. Check the EMI panel above or ask at the counter for current plans."],
    ];
    for (let i = 0; i < Math.min(4, phones.length); i++) {
      await db.insert(productQuestions).values({
        productId: phones[i].id,
        customerId: demoIds[i % demoIds.length],
        customerName: demoPeople[i % demoPeople.length].name,
        body: qa[i][0],
        answer: qa[i][1],
        answeredBy: "SMS Stores",
        answeredAt: new Date(),
        status: "published",
      });
    }
    log.push("catalogue enriched: variants, galleries, demo reviews, Q&A");
  }

  return Response.json({
    ok: true,
    seeded: log,
    ...(bootstrapAdmin
      ? {
          admin: bootstrapAdmin,
          warning: bootstrapAdmin.usedGeneratedPassword
            ? "Admin account created with a randomly GENERATED password because INITIAL_ADMIN_PASSWORD was not set. Copy it from this response now — it will not be shown again — log in immediately and change it via the admin dashboard."
            : "Admin account created using INITIAL_ADMIN_PASSWORD. Log in and rotate it if this deployment is ever exposed publicly.",
        }
      : {}),
  });
}