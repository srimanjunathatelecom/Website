import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------- Store-wide settings (singleton) ----------
export const storeSettings = pgTable("store_settings", {
  id: integer("id").primaryKey().default(1),
  brandName: text("brand_name").notNull().default("SMS Stores"),
  legalName: text("legal_name").notNull().default("Smart Mobile Stores"),
  logoUrl: text("logo_url").notNull().default(""),
  tagline: text("tagline").notNull().default("Real Prices. Real Savings. Every Day."),
  taglineAlt: text("tagline_alt").notNull().default("Why Pay MRP When You Can Pay Less?"),
  gstin: text("gstin").notNull().default("29ARHPP2476R1ZR"),
  pan: text("pan").notNull().default("ARHPP2476R"),
  state: text("state").notNull().default("Karnataka"),
  stateCode: text("state_code").notNull().default("29"),
  placeOfSupply: text("place_of_supply").notNull().default("Karnataka"),
  whatsappNumber: text("whatsapp_number").notNull().default("7996663356"),
  supportEmail: text("support_email").notNull().default("smartmobilestores2022@gmail.com"),
  supportPhone: text("support_phone").notNull().default("7996663356"),
  gaId: text("ga_id"),
  promoVideoUrl: text("promo_video_url").notNull().default(""), 
  promoVideoHeading: text("promo_video_heading").notNull().default("The Future of Tech."),
  promoVideoSubtext: text("promo_video_subtext").notNull().default("Experience ultra-fast speeds and stunning displays."),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Outlets ----------
export const outlets = pgTable("outlets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  addressLine: text("address_line").notNull(),
  contact: text("contact").notNull(),
  email: text("email").notNull(),
  mapsUrl: text("maps_url").notNull().default(""),
  photo: text("photo"),
  isMain: boolean("is_main").notNull().default(false),
  hoursOpen: text("hours_open").notNull().default("10:00 AM"),
  hoursClose: text("hours_close").notNull().default("9:00 PM"),
  lat: numeric("lat", { precision: 10, scale: 6 }),
  lng: numeric("lng", { precision: 10, scale: 6 }),
});

// ---------- Banners ----------
// `slot` is the existing homepage placement key ("hero", "strip", etc.) —
// unchanged, still drives where a banner is queried from in page.tsx.
// `bannerType` is new and independent: it picks WHICH renderer a slot's
// banners use (plain image/link vs. split hero vs. product-led vs.
// category/brand vs. mixed-grid tile vs. video). Every new column is
// nullable/defaulted so existing rows (title+image+link+slot only)
// keep rendering exactly as before with zero backfill required.
export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  image: text("image"),
  link: text("link").notNull().default("/products"),
  slot: text("slot").notNull().default("hero"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),

  // Which component renders this banner. Defaults to "image" so every
  // pre-existing row behaves exactly as it does today.
  // One of: image | split | product | category | brand | grid | video
  bannerType: text("banner_type").notNull().default("image"),

  // Display size hint for grid/mixed-grid placement. Purely advisory —
  // components fall back to sensible defaults if unset.
  // One of: full | large | medium | small | square | wide | half | tall
  size: text("size").notNull().default("full"),

  ctaLabel: text("cta_label"),

  // Responsive artwork. Falls back to `image` when unset (never a broken
  // banner just because mobile art wasn't uploaded).
  mobileImage: text("mobile_image"),

  // Video banners only. `image` doubles as the poster/fallback frame.
  videoUrl: text("video_url"),

  // Content refs for DB-driven banner types. Nullable — a banner only
  // pulls live product/category/brand data when one of these is set,
  // and the renderer hides itself if the referenced row is missing or
  // inactive rather than ever fabricating info (spec section 13/19).
  productId: integer("product_id"),
  categoryId: integer("category_id"),
  brandId: integer("brand_id"),

  // Optional scheduling window. Both null = always active (subject to
  // `active` flag). Same inclusive-end-of-day semantics as the existing
  // announcement config in siteConfig.ts.
  startDate: date("start_date"),
  endDate: date("end_date"),

  // Entrance animation + (for split/product) whether it groups into a
  // horizontal split layout with the image on the left or right.
  // animation: fade | slide | scale | none
  animation: text("animation").notNull().default("fade"),
  imageSide: text("image_side").notNull().default("right"), // left | right, split/product banners only

  // ---------- Premium banner design system (additive, all optional) ----------
  // Visual treatment applied on top of bannerType. Only meaningful for
  // split/product (and, loosely, video) banners — anything else ignores
  // it and keeps its existing look. One of: premium-product | dark-tech |
  // light-retail | sale | editorial | minimal | glass | gradient.
  // Existing rows have this unset and fall back to "minimal", which
  // renders identically to the pre-upgrade split/product layout.
  style: text("style").notNull().default("minimal"),

  // Independent entrance animation for the text stack (badge/heading/
  // subtitle/price/CTA), separate from `animation` (which now drives the
  // whole-banner/carousel-slide entrance). One of: fade | fade-up |
  // slide | stagger | pop | none.
  textAnimation: text("text_animation").notNull().default("fade-up"),

  // Independent treatment for the product/image side. One of: none |
  // float | glow | tilt | scale | parallax.
  productAnimation: text("product_animation").notNull().default("none"),

  // Slide transition used only when this banner sits in an
  // auto-rotating carousel (hero slot). One of: fade | slide | scale |
  // fade-slide.
  transition: text("transition").notNull().default("fade"),

  // Short eyebrow/badge text shown above the heading, e.g. "LIMITED
  // OFFER" or "NEW ARRIVAL". Purely decorative — independent of title.
  badge: text("badge"),

  // Only meaningful for slots that carousel/auto-rotate (hero, grid).
  autoplayMs: integer("autoplay_ms"),

  // ---------- Cinematic hero (slot "hero_video") ----------
  // Where the headline/CTA stack sits over the artwork. One of:
  // left | center | right. Ignored by every other slot.
  contentPosition: text("content_position").notNull().default("left"),

  // How dark the readability scrim over the video/image is. One of:
  // soft | medium | strong.
  overlayStrength: text("overlay_strength").notNull().default("medium"),

  // Opt-in only: play the video on phones too. Off by default so a
  // heavy background video never costs a mobile visitor their data or
  // their battery — they get `mobileImage` (or `image`) instead.
  mobileVideo: boolean("mobile_video").notNull().default(false),
});

// ---------- Promotional Cards (Finance/Services Banner) ----------
export const promoCards = pgTable("promo_cards", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default(""), 
  themeColor: text("theme_color").notNull().default("blue-400"), 
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------- Brands ----------
export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  bgColor: text("bg_color").notNull().default("#f8fafc"),
  label: text("label"),
  logoUrl: text("logo_url"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // `active` controls the storefront "Shop by Brand" rail (brands we SELL);
  // `repairable` controls the /repair brand grid (brands we FIX). They are
  // independent flags because the two lists genuinely differ — we repair
  // handsets we don't stock. See migration 0018.
  repairable: boolean("repairable").notNull().default(false),
});

// ---------- Device models (repair flow: Brand -> Model -> Service) ----------
// Added in migration 0018. Before this, the booking form captured the device as
// free text, so the shop had no canonical list of what it repairs.
export const deviceModels = pgTable(
  "device_models",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    image: text("image").notNull().default(""),
    imageAlt: text("image_alt").notNull().default(""),
    releaseYear: integer("release_year"),
    /** Surfaces the model above the rest of its brand's grid. */
    popular: boolean("popular").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("device_models_brand_slug_unique_idx").on(t.brandId, t.slug)]
);

// ---------- Categories ----------
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  image: text("image"),
  description: text("description"),
});

// ---------- Products ----------
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  categoryId: integer("category_id").notNull(),
  subcategory: text("subcategory").notNull().default(""),
  mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull(),
  mop: numeric("mop", { precision: 12, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  sku: text("sku").notNull().default(""),
  // Scannable identity (EAN/UPC/serial-range). Matching key for imports,
  // after ID and SKU. Never required.
  barcode: text("barcode").notNull().default(""),
  // What the shop actually paid per unit. Optional; only shown in admin and
  // margin exports, never on the storefront.
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  // GST percent (e.g. 18.00) and HSN code for invoices/exports. Optional.
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }),
  hsn: text("hsn").notNull().default(""),
  // Optional SEO overrides; empty = derive from name/description as today.
  seoTitle: text("seo_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  // Stamped by a DB trigger whenever stock changes, regardless of code path.
  // This is what stale-spreadsheet detection compares against.
  stockUpdatedAt: timestamp("stock_updated_at"),
  warranty: text("warranty").notNull().default(""),
  specifications: text("specifications").notNull().default(""),
  imageSource: text("image_source").notNull().default("Our own photo"),
  featured: boolean("featured").notNull().default(false),
  bestseller: boolean("bestseller").notNull().default(false),
  newArrival: boolean("new_arrival").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  // ---- Flipkart-style PDP fields (all optional — page hides a block if empty) ----
  // Highlight chips shown right under the gallery, e.g. "512 GB ROM" / "A19 Chip, 6 Core...".
  // One per line, admin format: "Icon Label | Bold headline" — Icon Label picks a built-in
  // icon (ram, processor, camera, frontCamera, display, battery) via keyword match.
  highlights: text("highlights").notNull().default(""),
  // Free-text badge shown above the price, e.g. "Top Discount of the Sale". Empty = hidden.
  saleBadge: text("sale_badge").notNull().default(""),
  // Small fee line under the price, e.g. "+₹220 Protect Promise Fee". Empty = hidden.
  protectPromiseFee: text("protect_promise_fee").notNull().default(""),
  // Seller shown in the delivery block, e.g. "Vision Star".
  sellerName: text("seller_name").notNull().default(""),
  sellerRating: numeric("seller_rating", { precision: 2, scale: 1 }),
  sellerYears: integer("seller_years"),

  // "What's in the box" — one line per item, admin-editable. Empty = section hidden.
  boxContents: text("box_contents").notNull().default(""),
  // Extra merchandising badges, alongside the existing bestseller/newArrival flags.
  trending: boolean("trending").notNull().default(false),
  limitedStock: boolean("limited_stock").notNull().default(false),
  hotDeal: boolean("hot_deal").notNull().default(false),
},
  (t) => [index("products_category_id_idx").on(t.categoryId), index("products_status_idx").on(t.status)]
);

export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  dataUrl: text("data_url").notNull(),
  alt: text("alt").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  // Optional colour association. When set (case-insensitive match against
  // product_variants.color), the gallery filters to these images once the
  // shopper picks that colour. Empty = shown for every colour.
  variantColor: text("variant_color").notNull().default(""),
  // "image" | "video" — videos render in the gallery with a play affordance.
  mediaType: text("media_type").notNull().default("image"),
},
  (t) => [index("product_images_product_id_idx").on(t.productId)]
);

// ---------- Stock change audit trail ----------
// One row per stock adjustment (single edit, +/- button, or bulk action).
// productName/sku are denormalized snapshots — same pattern as order_items
// — so history stays readable even if a product is later renamed or
// deleted, and reading history never needs a join back to products.
export const stockHistory = pgTable("stock_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull().default(""),
  sku: text("sku").notNull().default(""),
  oldStock: integer("old_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  change: integer("change").notNull(),
  adminId: integer("admin_id"),
  adminName: text("admin_name").notNull().default(""),
  reason: text("reason").notNull().default(""),
  // Which variant this movement belongs to (null = the product row itself).
  // variantLabel is a denormalized snapshot, same pattern as productName.
  variantId: integer("variant_id"),
  variantLabel: text("variant_label").notNull().default(""),
  // Why stock moved: manual | import | import_rollback | sale |
  // cancel_restore | payment_release | bulk | correction. "manual" is the
  // default so every pre-existing insert keeps its old meaning.
  movementType: text("movement_type").notNull().default("manual"),
  // Traceability back to the batch/order that caused the movement.
  importId: integer("import_id"),
  orderId: integer("order_id"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [
    index("stock_history_product_id_idx").on(t.productId),
    index("stock_history_import_id_idx").on(t.importId),
    index("stock_history_order_id_idx").on(t.orderId),
    index("stock_history_created_at_idx").on(t.createdAt),
    index("stock_history_variant_id_idx").on(t.variantId),
  ]
);

// ---------- Product Variants (Colors & Storage) ----------
export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  color: text("color").notNull().default(""),
  storage: text("storage").notNull().default(""), 
  ram: text("ram").notNull().default(""), 
  mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull(),
  mop: numeric("mop", { precision: 12, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  sku: text("sku").notNull().default(""),
  image: text("image"),
  // Admin-controlled swatch appearance. colorHex drives the circular colour
  // swatch (falls back to a name lookup when blank); swatchImage overrides it
  // with a picture swatch (finish/pattern colours).
  colorHex: text("color_hex").notNull().default(""),
  swatchImage: text("swatch_image").notNull().default(""),
  // available=false hides/disables the combination even if stock > 0
  // (e.g. discontinued or not yet launched).
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // Scannable identity; import matching key after variant SKU.
  barcode: text("barcode").notNull().default(""),
  // Trigger-maintained, same as products.stockUpdatedAt.
  stockUpdatedAt: timestamp("stock_updated_at"),
},
  (t) => [index("product_variants_product_id_idx").on(t.productId)]
);

// ---------- Services ----------
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  deviceTypes: text("device_types").notNull().default(""),
  startPrice: text("start_price").notNull().default("Price on inspection"),
  turnaround: text("turnaround").notNull().default("Same day"),
  outletIds: text("outlet_ids").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("active"),
  // Presentation & merchandising (migration 0016). Image is a URL/path ref
  // (R2 URL, /images/... static path or data URL) — same convention as
  // products. imageSource records provenance ({"name","url","license"} JSON)
  // so "is this image ours to use?" is always answerable from Admin.
  image: text("image").notNull().default(""),
  imageAlt: text("image_alt").notNull().default(""),
  imageSource: text("image_source").notNull().default(""),
  category: text("category").notNull().default(""),
  featured: boolean("featured").notNull().default(false),
  badge: text("badge").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  bookingUrl: text("booking_url").notNull().default(""),
  seoTitle: text("seo_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
});

// ---------- Customers ----------
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  label: text("label").notNull().default("Home"),
  line: text("line").notNull().default(""),
  city: text("city").notNull().default("Bengaluru"),
  pincode: text("pincode").notNull().default(""),
  lat: numeric("lat", { precision: 10, scale: 6 }),
  lng: numeric("lng", { precision: 10, scale: 6 }),
  isDefault: boolean("is_default").notNull().default(false),
},
  (t) => [index("addresses_customer_id_idx").on(t.customerId)]
);

// ---------- Delivery Pincodes ----------
export const deliveryPincodes = pgTable("delivery_pincodes", {
  id: serial("id").primaryKey(),
  pincode: text("pincode").notNull().unique(),
  city: text("city").notNull().default("Bengaluru"),
  state: text("state").notNull().default("Karnataka"),
  estimatedDays: integer("estimated_days").notNull().default(1),
  isDeliverable: boolean("is_deliverable").notNull().default(true),
  codAvailable: boolean("cod_available").notNull().default(true),
  // Delivery pricing, per pincode. deliveryCharge 0 = free everywhere;
  // freeDeliveryAbove > 0 waives the charge above that order value.
  deliveryCharge: numeric("delivery_charge", { precision: 10, scale: 2 }).notNull().default("0"),
  freeDeliveryAbove: numeric("free_delivery_above", { precision: 12, scale: 2 }).notNull().default("0"),
});

export const wishlist = pgTable("wishlist", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  productId: integer("product_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [index("wishlist_customer_id_idx").on(t.customerId)]
);

// ---------- Back-in-stock alerts ----------
// One row per (product, optional variant, email) waiting for a restock.
// notified_at doubles as the consumed flag: NULL = pending, set = done.
// Uniqueness is enforced by a partial index in migration 0017 (pending rows
// only), which drizzle's schema DSL cannot express — so no .unique() here.
export const stockAlerts = pgTable("stock_alerts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  notifiedAt: timestamp("notified_at"),
},
  (t) => [index("stock_alerts_product_id_idx").on(t.productId)]
);

// ---------- Orders ----------
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNo: text("order_no").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  customerEmail: text("customer_email").notNull().default(""),
  addressLine: text("address_line").notNull().default(""),
  city: text("city").notNull().default(""),
  pincode: text("pincode").notNull().default(""),
  outletId: integer("outlet_id"),
  totalMrp: numeric("total_mrp", { precision: 12, scale: 2 }).notNull(),
  totalMop: numeric("total_mop", { precision: 12, scale: 2 }).notNull(),
  savings: numeric("savings", { precision: 12, scale: 2 }).notNull(),
  couponCode: text("coupon_code"),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method").notNull().default("Cash on Delivery"),
  // Fulfilment state (Placed / Packed / Shipped / Delivered / Cancelled) and
  // money state are deliberately separate columns. Conflating them was the
  // old behaviour and it cannot express the states an online gateway
  // actually produces: an order can be "Placed" but unpaid (customer
  // abandoned the gateway), or "Delivered" and refunded. Keeping them apart
  // means fulfilment staff and reconciliation never fight over one field.
  paymentStatus: text("payment_status").notNull().default("pending"),
  // Set once, when money is actually confirmed captured by the gateway (or
  // when COD cash is marked collected). Null means nothing has been banked.
  paidAt: timestamp("paid_at"),
  status: text("status").notNull().default("Placed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [
    index("orders_customer_id_idx").on(t.customerId),
    index("orders_created_at_idx").on(t.createdAt),
    index("orders_status_created_at_idx").on(t.status, t.createdAt),
    index("orders_coupon_code_idx").on(t.couponCode),
  ]
);

// ---------- Payments ----------
// One row per payment attempt against an order — not one per order. A
// customer who fails on a card, retries on UPI and succeeds produces three
// rows, and that history is exactly what's needed when they later dispute a
// charge or support has to explain a bank hold. The orders table keeps only
// the summary (paymentStatus/paidAt); the audit trail lives here.
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull(),
    // Which gateway handled this attempt, so a future switch (or running two
    // in parallel during a migration) doesn't need a schema change.
    gateway: text("gateway").notNull().default("razorpay"),
    // The gateway's own order handle (Razorpay `order_id`, e.g. order_XXXX).
    // Unique so a retry can find and reuse an existing unpaid gateway order
    // instead of creating a second one for the same cart.
    gatewayOrderId: text("gateway_order_id"),
    // The gateway's payment handle (Razorpay `payment_id`, e.g. pay_XXXX).
    gatewayPaymentId: text("gateway_payment_id"),
    // Amount in the smallest currency unit (paise), which is what every
    // Indian gateway speaks. Storing paise as an integer avoids the
    // floating-point rounding that makes reconciliation reports disagree
    // with the bank statement by a rupee.
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    // created | authorized | captured | failed | refunded | cancelled
    status: text("status").notNull().default("created"),
    // Instrument actually used, as reported by the gateway (upi/card/netbanking).
    method: text("method").notNull().default(""),
    errorCode: text("error_code").notNull().default(""),
    errorDescription: text("error_description").notNull().default(""),
    // Amount refunded so far, in paise. Supports partial refunds.
    refundedPaise: integer("refunded_paise").notNull().default(0),
    // Set when this attempt's stock reservation has been handed back, so a
    // webhook and a reconciliation run can't both release the same stock.
    stockReleasedAt: timestamp("stock_released_at"),
    // Last webhook/verify event applied, used to ignore out-of-order and
    // duplicate deliveries — gateways retry webhooks aggressively and will
    // happily deliver `payment.failed` after `payment.captured`.
    lastEventId: text("last_event_id").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_gateway_order_id_key").on(t.gatewayOrderId)]
);

// ---------- Processed gateway webhook events ----------
// Insert-only ledger of webhook event IDs already handled. Razorpay
// guarantees at-least-once delivery, so the same `payment.captured` can
// arrive three times; without this, a refund handler could run twice and
// a captured handler could send three confirmation emails. A unique index
// on eventId turns "have I seen this?" into an atomic insert that either
// succeeds (first delivery) or conflicts (a duplicate, safe to drop).
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: serial("id").primaryKey(),
    gateway: text("gateway").notNull().default("razorpay"),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull().default(""),
    paymentId: integer("payment_id"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_event_id_key").on(t.gateway, t.eventId)]
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  image: text("image"),
  qty: integer("qty").notNull(),
  mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull(),
  mop: numeric("mop", { precision: 12, scale: 2 }).notNull(),
  // Which variant was actually bought. variantLabel is a denormalized
  // snapshot ("8 GB / 256 GB · Titanium Blue") so old orders stay readable
  // even if the variant row is later edited or deleted.
  variantId: integer("variant_id"),
  variantLabel: text("variant_label").notNull().default(""),
  sku: text("sku").notNull().default(""),
},
  (t) => [index("order_items_order_id_idx").on(t.orderId)]
);

// ---------- Bookings (repair/service) ----------
export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  bookingNo: text("booking_no").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  customerEmail: text("customer_email").notNull().default(""),
  serviceId: integer("service_id").notNull(),
  serviceName: text("service_name").notNull().default(""),
  device: text("device").notNull().default(""),
  issue: text("issue").notNull().default(""),
  outletId: integer("outlet_id"),
  status: text("status").notNull().default("Booked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Reviews ----------
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull().default(""),
  rating: integer("rating").notNull().default(5),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  images: text("images").notNull().default(""),
  // Set server-side at submit time by checking the customer's delivered/placed
  // orders for this product — never accepted from the client.
  verifiedPurchase: boolean("verified_purchase").notNull().default(false),
  helpfulCount: integer("helpful_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [index("reviews_product_id_idx").on(t.productId)]
);

// One row per signed-in customer who marked a review helpful. The composite
// unique index is what actually prevents a person inflating a review's count
// by clicking repeatedly; reviews.helpfulCount is the cached total.
export const reviewVotes = pgTable(
  "review_votes",
  {
    id: serial("id").primaryKey(),
    reviewId: integer("review_id").notNull(),
    customerId: integer("customer_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("review_votes_review_customer_idx").on(t.reviewId, t.customerId)]
);

// ---------- Product questions & answers ----------
// Shopper questions shown on the product page, answered by the store. Nothing
// reaches the storefront until an admin publishes it, so the PDP never shows
// unmoderated text; "pending" is the state every new question starts in.
// The answer lives on the same row because a question has exactly one
// store answer — a separate answers table would only add a join.
export const productQuestions = pgTable("product_questions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  // The signed-in customer who asked. Asking requires an account, which is
  // what keeps the section free of anonymous spam.
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull().default(""),
  body: text("body").notNull().default(""),
  // Store's reply. Empty until answered; a published question with no answer
  // is shown honestly as awaiting a reply rather than with invented text.
  answer: text("answer").notNull().default(""),
  answeredBy: text("answered_by").notNull().default(""),
  answeredAt: timestamp("answered_at"),
  // pending | published | rejected
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [index("product_questions_product_id_idx").on(t.productId)]
);

// ---------- Warranty / defect claims ----------
export const claims = pgTable("claims", {
  id: serial("id").primaryKey(),
  claimNo: text("claim_no").notNull().unique(),
  orderId: integer("order_id").notNull(),
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull().default(""),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("Pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Admins ----------
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("manager"),
  outletId: integer("outlet_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminOtps = pgTable("admin_otps", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  customerId: integer("customer_id"),
  adminId: integer("admin_id"),
  role: text("role").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [index("sessions_expires_at_idx").on(t.expiresAt)]
);

// ---------- Password resets ----------
// Single-use, short-lived tokens for the customer "forgot password" flow.
// Only the SHA-256 hash of the token is stored — the raw token exists solely
// inside the email link, so reading this table never yields a usable reset
// URL. See /api/auth/forgot and /api/auth/reset.
export const passwordResets = pgTable("password_resets", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
  (t) => [
    uniqueIndex("password_resets_token_hash_idx").on(t.tokenHash),
    index("password_resets_customer_id_idx").on(t.customerId),
  ]
);

// ---------- Notifications ----------
// The unread badge query is served by a partial index, `notifications_unread_idx`,
// created in migration_add_indexes.sql rather than declared here: read rows are
// the overwhelming majority over time and there is no reason to index rows the
// query never looks at. Keep it in mind before running a schema diff — a plain
// diff won't know about it.
/**
 * Rate-limit counters, shared across every running instance.
 *
 * Not application data: rows are transient accounting for src/lib/rateLimit.ts
 * and are pruned once expired. It lives in the database rather than in process
 * memory so that limits survive a restart and are not multiplied by the number
 * of instances behind a load balancer.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    // Supports the periodic sweep of expired rows; without it that sweep is a
    // full scan of a table touched by every login.
    index("rate_limits_reset_at_idx").on(t.resetAt),
  ]
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link").notNull().default(""),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationSettings = pgTable("notification_settings", {
  id: integer("id").primaryKey().default(1),
  email: text("email").notNull().default("smartmobilestores2022@gmail.com"),
  phone: text("phone").notNull().default("7996663356"),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(true),
  newOrder: boolean("new_order").notNull().default(true),
  newBooking: boolean("new_booking").notNull().default(true),
  newClaim: boolean("new_claim").notNull().default(true),
  lowStock: boolean("low_stock").notNull().default(true),
});

// ---------- Editable content pages ----------
export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Coupons ----------
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("percent"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull().default("0"),
  minOrder: numeric("min_order", { precision: 12, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  // A code with no expiry and no cap is a permanent, unlimited discount the
  // moment it leaks anywhere public. All three limits are nullable and null
  // means "no limit", so existing coupons keep behaving exactly as before.
  expiresAt: timestamp("expires_at"),
  // Total redemptions allowed across all customers.
  maxRedemptions: integer("max_redemptions"),
  // Redemptions allowed per signed-in customer. Guest checkouts can't be
  // attributed to an account, so this only binds logged-in orders.
  perCustomerLimit: integer("per_customer_limit"),
});

// ---------- Promo Offers (PDP "bank offers" / instant discount tiles) ----------
// Admin-managed offer tiles shown on the product detail page — the real
// replacement for what used to be hardcoded HDFC/Axis/SBI/UPI tiles.
// A NULL categoryId/productId means "applies store-wide". A set productId
// scopes the offer to one product; a set categoryId scopes it to every
// product in that category. Both may be set narrower together.
export const promoOffers = pgTable("promo_offers", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("bank"), // bank | upi | instant | exchange | emi
  title: text("title").notNull(), // e.g. "HDFC Bank Credit Card"
  description: text("description").notNull().default(""), // e.g. "Credit Card · Includes cashback"
  discountType: text("discount_type").notNull().default("percent"), // percent | fixed
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  maxDiscount: numeric("max_discount", { precision: 10, scale: 2 }), // cap for percent-type offers, null = uncapped
  minOrder: numeric("min_order", { precision: 12, scale: 2 }).notNull().default("0"),
  categoryId: integer("category_id"), // null = all categories
  productId: integer("product_id"), // null = all products (within category scope, if any)
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  sortOrder: integer("sort_order").notNull().default(0),

  // ---- Type-specific fields (additive, all optional) ----
  // bank / upi: which provider this offer is tied to, e.g. "HDFC Bank",
  // "Google Pay". Shown with a provider-appropriate icon on the PDP.
  provider: text("provider").notNull().default(""),
  // bank only: card type this offer needs, e.g. "Credit Card", "Debit Card",
  // "Credit Card, Debit Card". Free text — rendered as a chip on the PDP.
  cardType: text("card_type").notNull().default(""),

  // emi only: comma-separated tenure options in months, e.g. "3,6,9,12,18,24".
  // Parsed into chips in both the admin form and the PDP EMI modal.
  emiTenures: text("emi_tenures").notNull().default(""),
  // emi only: annual interest rate as a percent, e.g. "14" = 14% p.a.
  // Ignored (treated as 0%) when noCostEmi is true.
  emiInterestRate: numeric("emi_interest_rate", { precision: 5, scale: 2 }),
  // emi only: whether this is a No Cost EMI plan (interest discounted to 0
  // by the seller/brand rather than charged to the customer).
  noCostEmi: boolean("no_cost_emi").notNull().default(false),
  // emi only: flat processing fee in ₹, shown in the EMI modal. Null = not
  // disclosed / none.
  processingFee: numeric("processing_fee", { precision: 10, scale: 2 }),
  // emi only: minimum purchase amount required to be EMI-eligible. Distinct
  // from minOrder (which drives generic discount eligibility) so EMI offers
  // can state their own eligibility floor.
  minPurchaseAmount: numeric("min_purchase_amount", { precision: 12, scale: 2 }),

  // exchange only: maximum exchange value the store will credit for an
  // old device under this offer, e.g. "Up to ₹18,000".
  maxExchangeValue: numeric("max_exchange_value", { precision: 12, scale: 2 }),
  // exchange only: free-text eligibility note, e.g. "Working display,
  // device powers on, no major physical damage".
  exchangeEligibility: text("exchange_eligibility").notNull().default(""),
});

// ---------- Stock/product import batches ----------
// One row per uploaded file, whatever happens to it. The sha-256 fileHash is
// how "you already imported this exact file" is detected; summary/options
// record what the admin was shown and what they confirmed, so the history
// list can answer "who imported what, when, and what did it change".
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull().default(""),
  fileHash: text("file_hash").notNull().default(""),
  fileSize: integer("file_size").notNull().default(0),
  // snapshot | receipt | adjust | reconcile | product | price
  mode: text("mode").notNull().default("snapshot"),
  // previewed | committed | cancelled | rolled_back | failed
  status: text("status").notNull().default("previewed"),
  adminId: integer("admin_id"),
  adminName: text("admin_name").notNull().default(""),
  mapping: jsonb("mapping").notNull().default({}),
  summary: jsonb("summary").notNull().default({}),
  options: jsonb("options").notNull().default({}),
  error: text("error").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  committedAt: timestamp("committed_at"),
  rolledBackAt: timestamp("rolled_back_at"),
},
  (t) => [
    index("import_batches_file_hash_idx").on(t.fileHash),
    index("import_batches_created_at_idx").on(t.createdAt),
  ]
);

// One row per data row in an uploaded file. payload holds only the columns
// the file actually contained (partial-update safety); before/after hold the
// database values changed at commit time, which is exactly what rollback
// restores — nothing more.
export const importRows = pgTable("import_rows", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").notNull(),
  rowNum: integer("row_num").notNull().default(0),
  // create | update | new_variant | update_variant | conflict | error | skip
  action: text("action").notNull().default("skip"),
  productId: integer("product_id"),
  variantId: integer("variant_id"),
  sku: text("sku").notNull().default(""),
  name: text("name").notNull().default(""),
  payload: jsonb("payload").notNull().default({}),
  before: jsonb("before"),
  after: jsonb("after"),
  warnings: jsonb("warnings").notNull().default([]),
  error: text("error").notNull().default(""),
  applied: boolean("applied").notNull().default(false),
},
  (t) => [index("import_rows_import_id_idx").on(t.importId)]
);

// Remembered header→field mappings, keyed by a signature of the file's
// header row. Correct a mapping once, and the next upload of the same sheet
// layout maps itself.
export const importMappings = pgTable("import_mappings", {
  signature: text("signature").primaryKey(),
  mapping: jsonb("mapping").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Catalogue Health (automated audit / auto-fix / review) ----------
// One row per background catalogue run. The browser only ever polls this row,
// so the owner can close the tab mid-run and the job carries on; progress and
// results are always re-readable. See src/lib/catalogue/jobs.ts.
export const catalogueJobs = pgTable("catalogue_jobs", {
  id: serial("id").primaryKey(),
  // scan | fix | enrich | daily_check | image_map
  type: text("type").notNull().default("scan"),
  // What the run covers: {kind: "all"|"incomplete"|"category"|"brand"|"products", ids?: number[]}
  scope: jsonb("scope").notNull().default({}),
  // queued | running | completed | failed | cancelled
  status: text("status").notNull().default("queued"),
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  // {autoFixed, needsReview, complete, imagesImported, seoFilled, altFilled, errors, ...}
  counters: jsonb("counters").notNull().default({}),
  summary: jsonb("summary").notNull().default({}),
  error: text("error").notNull().default(""),
  adminId: integer("admin_id"),
  adminName: text("admin_name").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // Stamped every batch so a crashed run is detectable (stale heartbeat)
  // and can be resumed instead of sitting at "running" forever.
  heartbeatAt: timestamp("heartbeat_at"),
},
  (t) => [index("catalogue_jobs_status_idx").on(t.status), index("catalogue_jobs_created_at_idx").on(t.createdAt)]
);

// One row per detected catalogue problem. `proposal` carries the suggested
// fix (for images: url/source/confidence/alt; for data: field values), and
// before/after record what an applied fix actually changed. The partial
// unique index on fingerprint (see migration 0015) means a re-scan updates
// the same open row rather than duplicating it.
export const catalogueIssues = pgTable("catalogue_issues", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  imageId: integer("image_id"),
  // missing_image | placeholder_image | broken_image | wrong_image |
  // missing_data | missing_seo | missing_alt | duplicate | invalid_variant |
  // pricing | not_publishable
  type: text("type").notNull(),
  severity: text("severity").notNull().default("warning"), // info | warning | critical
  // open | needs_review | auto_fixed | approved | rejected | resolved | dismissed
  status: text("status").notNull().default("open"),
  confidence: integer("confidence").notNull().default(0),
  summary: text("summary").notNull().default(""),
  // Denormalized snapshot so the review queue never needs a join to render.
  productName: text("product_name").notNull().default(""),
  proposal: jsonb("proposal").notNull().default({}),
  before: jsonb("before"),
  after: jsonb("after"),
  jobId: integer("job_id"),
  fingerprint: text("fingerprint").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by").notNull().default(""),
},
  (t) => [
    index("catalogue_issues_product_id_idx").on(t.productId),
    index("catalogue_issues_status_idx").on(t.status),
    index("catalogue_issues_type_idx").on(t.type),
  ]
);

// Owner automation preferences — singleton (id = 1), same pattern as
// store_settings. Thresholds are percentages (0–100).
export const catalogueSettings = pgTable("catalogue_settings", {
  id: integer("id").primaryKey().default(1),
  dailyCheckEnabled: boolean("daily_check_enabled").notNull().default(false),
  autoFixEnabled: boolean("auto_fix_enabled").notNull().default(true),
  // >= this: an image match may be applied automatically.
  autoApproveThreshold: integer("auto_approve_threshold").notNull().default(90),
  // >= this (but below auto): goes to Needs Review. Below this: discarded.
  reviewThreshold: integer("review_threshold").notNull().default(60),
  // Minimum fields before automation will publish a product to the storefront.
  requiredPublishFields: jsonb("required_publish_fields").notNull().default(["name", "categoryId", "mop", "image"]),
  // Extra owner-approved image domains per brand: {"samsung": ["images.samsung.com"], ...}
  officialDomains: jsonb("official_domains").notNull().default({}),
  lastDailyRunAt: timestamp("last_daily_run_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- Newsletter signups ----------
export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  channel: text("channel").notNull().default("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Outlet = typeof outlets.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ContentPage = typeof contentPages.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type PromoCard = typeof promoCards.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type DeliveryPincode = typeof deliveryPincodes.$inferSelect;
export type StockHistory = typeof stockHistory.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type PromoOffer = typeof promoOffers.$inferSelect;
export type ProductQuestion = typeof productQuestions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportRow = typeof importRows.$inferSelect;
export type CatalogueJob = typeof catalogueJobs.$inferSelect;
export type CatalogueIssue = typeof catalogueIssues.$inferSelect;
export type CatalogueSettings = typeof catalogueSettings.$inferSelect;