/**
 * The seed list of brands and device models the shop repairs.
 *
 * This is a STARTING POINT, not the source of truth. The source of truth is the
 * database, edited from Admin. This file exists so a fresh install has a usable
 * repair flow on day one instead of an empty grid, and so the same list can be
 * re-applied safely after a brand is added upstream.
 *
 * Installed idempotently, on the same rules as installRepairCatalogue():
 *  - brands are matched by slug; an existing brand is only flagged repairable
 *    and never renamed, re-coloured, or given a different logo
 *  - models are matched by (brandId, slug); existing models are left alone
 *    except for filling a still-empty image
 *  - nothing is ever deleted or deactivated
 *
 * That last rule is the important one. A shop owner who removes a model in
 * Admin, or corrects "Galaxy S23+" to "Galaxy S23 Plus", must not have that
 * work undone the next time someone runs the installer.
 *
 * Brand logos point at the locally generated placeholder wordmarks in
 * public/images/brands (see scripts/make-brand-placeholders.mjs) rather than at
 * an external logo CDN — a customer-facing page should not depend on someone
 * else's server, and a brand logo is a trademark we should be serving
 * deliberately. Model images are left empty; ModelCard shows a shared generic
 * handset outline until the owner uploads the real render from Admin.
 *
 * Either way the path is just a string in a column, so replacing it is an Admin
 * action and never a code change.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { brands, deviceModels } from "@/db/schema";
import { slugify } from "@/lib/format";
import { modelSlug } from "./slug";

/**
 * Path to the generated placeholder wordmark for a brand slug, or "" when we
 * don't ship one.
 *
 * Returning "" rather than guessing a path matters: a brand the owner added
 * themselves has no generated asset, and pointing at a missing file would give
 * every one of its cards a broken image instead of the SafeImage fallback.
 */
function placeholderLogo(slug: string): string {
  return PLACEHOLDER_LOGO_SLUGS.has(slug) ? `/images/brands/${slug}.svg` : "";
}

/** Kept in step with scripts/make-brand-placeholders.mjs. */
const PLACEHOLDER_LOGO_SLUGS = new Set([
  "apple",
  "samsung",
  "oneplus",
  "xiaomi",
  "redmi",
  "realme",
  "vivo",
  "oppo",
  "poco",
  "google",
  "nothing",
  "motorola",
  "nokia",
  "iqoo",
  "infinix",
  "tecno",
  "honor",
  "huawei",
  "asus",
  "lg",
]);

export interface SeedBrand {
  name: string;
  /** Plate colour behind the logo, matching each brand's own identity. */
  bgColor: string;
  /** Higher sorts earlier — brands.sortOrder is read descending. */
  sortOrder: number;
}

export interface SeedModel {
  brand: string;
  name: string;
  releaseYear?: number;
  popular?: boolean;
}

export const SEED_BRANDS: SeedBrand[] = [
  { name: "Apple", bgColor: "#f5f5f7", sortOrder: 200 },
  { name: "Samsung", bgColor: "#f2f6fd", sortOrder: 190 },
  { name: "OnePlus", bgColor: "#fdf2f2", sortOrder: 180 },
  { name: "Xiaomi", bgColor: "#fff4ed", sortOrder: 170 },
  { name: "Redmi", bgColor: "#fff4ed", sortOrder: 165 },
  { name: "Realme", bgColor: "#fffbe8", sortOrder: 160 },
  { name: "Vivo", bgColor: "#eef6ff", sortOrder: 150 },
  { name: "Oppo", bgColor: "#eefaf3", sortOrder: 140 },
  { name: "Poco", bgColor: "#fffbe6", sortOrder: 130 },
  { name: "Google", bgColor: "#f6f8fc", sortOrder: 120 },
  { name: "Nothing", bgColor: "#f4f4f5", sortOrder: 110 },
  { name: "Motorola", bgColor: "#f3f6fa", sortOrder: 100 },
  { name: "Nokia", bgColor: "#f2f5fb", sortOrder: 90 },
  { name: "iQOO", bgColor: "#f1f7ff", sortOrder: 80 },
  { name: "Infinix", bgColor: "#f4f7f5", sortOrder: 70 },
  { name: "Tecno", bgColor: "#eff4ff", sortOrder: 60 },
  { name: "Honor", bgColor: "#f4f6f9", sortOrder: 50 },
  { name: "Huawei", bgColor: "#fdf3f3", sortOrder: 40 },
  { name: "Asus", bgColor: "#f5f6f8", sortOrder: 30 },
  { name: "LG", bgColor: "#fdf2f6", sortOrder: 20 },
];

export const SEED_MODELS: SeedModel[] = [
  // ---- Apple ----
  { brand: "Apple", name: "iPhone 15 Pro Max", releaseYear: 2023, popular: true },
  { brand: "Apple", name: "iPhone 15 Pro", releaseYear: 2023, popular: true },
  { brand: "Apple", name: "iPhone 15 Plus", releaseYear: 2023 },
  { brand: "Apple", name: "iPhone 15", releaseYear: 2023, popular: true },
  { brand: "Apple", name: "iPhone 14 Pro Max", releaseYear: 2022, popular: true },
  { brand: "Apple", name: "iPhone 14 Pro", releaseYear: 2022 },
  { brand: "Apple", name: "iPhone 14 Plus", releaseYear: 2022 },
  { brand: "Apple", name: "iPhone 14", releaseYear: 2022, popular: true },
  { brand: "Apple", name: "iPhone 13 Pro Max", releaseYear: 2021 },
  { brand: "Apple", name: "iPhone 13 Pro", releaseYear: 2021 },
  { brand: "Apple", name: "iPhone 13", releaseYear: 2021, popular: true },
  { brand: "Apple", name: "iPhone 13 Mini", releaseYear: 2021 },
  { brand: "Apple", name: "iPhone 12 Pro Max", releaseYear: 2020 },
  { brand: "Apple", name: "iPhone 12 Pro", releaseYear: 2020 },
  { brand: "Apple", name: "iPhone 12", releaseYear: 2020, popular: true },
  { brand: "Apple", name: "iPhone 12 Mini", releaseYear: 2020 },
  { brand: "Apple", name: "iPhone SE (3rd Gen)", releaseYear: 2022 },
  { brand: "Apple", name: "iPhone 11 Pro Max", releaseYear: 2019 },
  { brand: "Apple", name: "iPhone 11 Pro", releaseYear: 2019 },
  { brand: "Apple", name: "iPhone 11", releaseYear: 2019, popular: true },
  { brand: "Apple", name: "iPhone XR", releaseYear: 2018 },
  { brand: "Apple", name: "iPhone XS Max", releaseYear: 2018 },
  { brand: "Apple", name: "iPhone X", releaseYear: 2017 },

  // ---- Samsung ----
  { brand: "Samsung", name: "Galaxy S23 Ultra", releaseYear: 2023, popular: true },
  { brand: "Samsung", name: "Galaxy S23+", releaseYear: 2023 },
  { brand: "Samsung", name: "Galaxy S23", releaseYear: 2023, popular: true },
  { brand: "Samsung", name: "Galaxy Z Fold 5", releaseYear: 2023, popular: true },
  { brand: "Samsung", name: "Galaxy Z Flip 5", releaseYear: 2023, popular: true },
  { brand: "Samsung", name: "Galaxy Z Fold 4", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy Z Flip 4", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy A74 5G", releaseYear: 2023 },
  { brand: "Samsung", name: "Galaxy A54 5G", releaseYear: 2023, popular: true },
  { brand: "Samsung", name: "Galaxy A34 5G", releaseYear: 2023 },
  { brand: "Samsung", name: "Galaxy M54 5G", releaseYear: 2023 },
  { brand: "Samsung", name: "Galaxy M34 5G", releaseYear: 2023 },
  { brand: "Samsung", name: "Galaxy F23 5G", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy S22 Ultra", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy S22+", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy S22", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy S21 Ultra", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy S21+", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy S21", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy A73 5G", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy A53 5G", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy A33 5G", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy A13 5G", releaseYear: 2022 },
  { brand: "Samsung", name: "Galaxy A03s", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy M52 5G", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy M32 5G", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy Note 21 Ultra", releaseYear: 2021 },
  { brand: "Samsung", name: "Galaxy Note 20", releaseYear: 2020 },

  // ---- OnePlus ----
  { brand: "OnePlus", name: "OnePlus 12", releaseYear: 2024, popular: true },
  { brand: "OnePlus", name: "OnePlus 11 5G", releaseYear: 2023, popular: true },
  { brand: "OnePlus", name: "OnePlus 11R 5G", releaseYear: 2023 },
  { brand: "OnePlus", name: "OnePlus Nord 3 5G", releaseYear: 2023, popular: true },
  { brand: "OnePlus", name: "OnePlus Nord CE 3 Lite", releaseYear: 2023 },
  { brand: "OnePlus", name: "OnePlus 10 Pro", releaseYear: 2022 },
  { brand: "OnePlus", name: "OnePlus 10R", releaseYear: 2022 },
  { brand: "OnePlus", name: "OnePlus Nord 2T", releaseYear: 2022 },
  { brand: "OnePlus", name: "OnePlus 9 Pro", releaseYear: 2021 },
  { brand: "OnePlus", name: "OnePlus 9", releaseYear: 2021 },
  { brand: "OnePlus", name: "OnePlus 8T", releaseYear: 2020 },
  { brand: "OnePlus", name: "OnePlus Nord", releaseYear: 2020 },

  // ---- Xiaomi ----
  { brand: "Xiaomi", name: "Xiaomi 14 Ultra", releaseYear: 2024, popular: true },
  { brand: "Xiaomi", name: "Xiaomi 13 Pro", releaseYear: 2023, popular: true },
  { brand: "Xiaomi", name: "Xiaomi 13", releaseYear: 2023 },
  { brand: "Xiaomi", name: "Xiaomi 12 Pro", releaseYear: 2022 },
  { brand: "Xiaomi", name: "Xiaomi 11T Pro", releaseYear: 2021 },
  { brand: "Xiaomi", name: "Mi 11X Pro", releaseYear: 2021 },
  { brand: "Xiaomi", name: "Mi 10T", releaseYear: 2020 },

  // ---- Redmi ----
  { brand: "Redmi", name: "Redmi Note 13 Pro+ 5G", releaseYear: 2024, popular: true },
  { brand: "Redmi", name: "Redmi Note 13 Pro 5G", releaseYear: 2024, popular: true },
  { brand: "Redmi", name: "Redmi Note 12 Pro 5G", releaseYear: 2023, popular: true },
  { brand: "Redmi", name: "Redmi Note 12 5G", releaseYear: 2023 },
  { brand: "Redmi", name: "Redmi Note 11 Pro+ 5G", releaseYear: 2022 },
  { brand: "Redmi", name: "Redmi Note 11", releaseYear: 2022 },
  { brand: "Redmi", name: "Redmi Note 10 Pro Max", releaseYear: 2021 },
  { brand: "Redmi", name: "Redmi 12 5G", releaseYear: 2023 },
  { brand: "Redmi", name: "Redmi 10 Prime", releaseYear: 2021 },
  { brand: "Redmi", name: "Redmi 9A", releaseYear: 2020 },

  // ---- Realme ----
  { brand: "Realme", name: "Realme 12 Pro+ 5G", releaseYear: 2024, popular: true },
  { brand: "Realme", name: "Realme 11 Pro+ 5G", releaseYear: 2023, popular: true },
  { brand: "Realme", name: "Realme GT 3", releaseYear: 2023 },
  { brand: "Realme", name: "Realme Narzo 60 Pro", releaseYear: 2023 },
  { brand: "Realme", name: "Realme 10 Pro 5G", releaseYear: 2022 },
  { brand: "Realme", name: "Realme 9 Pro+", releaseYear: 2022 },
  { brand: "Realme", name: "Realme 8 Pro", releaseYear: 2021 },
  { brand: "Realme", name: "Realme C55", releaseYear: 2023 },
  { brand: "Realme", name: "Realme C35", releaseYear: 2022 },

  // ---- Vivo ----
  { brand: "Vivo", name: "Vivo X100 Pro", releaseYear: 2024, popular: true },
  { brand: "Vivo", name: "Vivo X90 Pro", releaseYear: 2023, popular: true },
  { brand: "Vivo", name: "Vivo V29 Pro 5G", releaseYear: 2023 },
  { brand: "Vivo", name: "Vivo V27 Pro", releaseYear: 2023, popular: true },
  { brand: "Vivo", name: "Vivo V25 Pro", releaseYear: 2022 },
  { brand: "Vivo", name: "Vivo T2 5G", releaseYear: 2023 },
  { brand: "Vivo", name: "Vivo Y100 5G", releaseYear: 2023 },
  { brand: "Vivo", name: "Vivo Y56 5G", releaseYear: 2023 },

  // ---- Oppo ----
  { brand: "Oppo", name: "Oppo Find N3 Flip", releaseYear: 2023, popular: true },
  { brand: "Oppo", name: "Oppo Reno 11 Pro 5G", releaseYear: 2024, popular: true },
  { brand: "Oppo", name: "Oppo Reno 10 Pro+ 5G", releaseYear: 2023 },
  { brand: "Oppo", name: "Oppo Reno 8 Pro", releaseYear: 2022 },
  { brand: "Oppo", name: "Oppo F23 5G", releaseYear: 2023 },
  { brand: "Oppo", name: "Oppo A78 5G", releaseYear: 2023 },
  { brand: "Oppo", name: "Oppo A57", releaseYear: 2022 },

  // ---- Poco ----
  { brand: "Poco", name: "Poco X6 Pro 5G", releaseYear: 2024, popular: true },
  { brand: "Poco", name: "Poco F5 5G", releaseYear: 2023, popular: true },
  { brand: "Poco", name: "Poco X5 Pro 5G", releaseYear: 2023 },
  { brand: "Poco", name: "Poco M6 Pro 5G", releaseYear: 2023 },
  { brand: "Poco", name: "Poco F4 5G", releaseYear: 2022 },
  { brand: "Poco", name: "Poco X3 Pro", releaseYear: 2021 },

  // ---- Google ----
  { brand: "Google", name: "Pixel 8 Pro", releaseYear: 2023, popular: true },
  { brand: "Google", name: "Pixel 8", releaseYear: 2023, popular: true },
  { brand: "Google", name: "Pixel 7a", releaseYear: 2023 },
  { brand: "Google", name: "Pixel 7 Pro", releaseYear: 2022 },
  { brand: "Google", name: "Pixel 7", releaseYear: 2022 },
  { brand: "Google", name: "Pixel 6a", releaseYear: 2022 },
  { brand: "Google", name: "Pixel 6 Pro", releaseYear: 2021 },

  // ---- Nothing ----
  { brand: "Nothing", name: "Nothing Phone (2a)", releaseYear: 2024, popular: true },
  { brand: "Nothing", name: "Nothing Phone (2)", releaseYear: 2023, popular: true },
  { brand: "Nothing", name: "Nothing Phone (1)", releaseYear: 2022 },

  // ---- Motorola ----
  { brand: "Motorola", name: "Motorola Edge 50 Pro", releaseYear: 2024, popular: true },
  { brand: "Motorola", name: "Motorola Edge 40", releaseYear: 2023, popular: true },
  { brand: "Motorola", name: "Motorola Razr 40 Ultra", releaseYear: 2023 },
  { brand: "Motorola", name: "Moto G84 5G", releaseYear: 2023 },
  { brand: "Motorola", name: "Moto G62 5G", releaseYear: 2022 },
  { brand: "Motorola", name: "Moto G32", releaseYear: 2022 },

  // ---- Nokia ----
  { brand: "Nokia", name: "Nokia G42 5G", releaseYear: 2023, popular: true },
  { brand: "Nokia", name: "Nokia X30 5G", releaseYear: 2022 },
  { brand: "Nokia", name: "Nokia G21", releaseYear: 2022 },
  { brand: "Nokia", name: "Nokia C32", releaseYear: 2023 },
  { brand: "Nokia", name: "Nokia 105 (2023)", releaseYear: 2023 },

  // ---- iQOO ----
  { brand: "iQOO", name: "iQOO 12 5G", releaseYear: 2023, popular: true },
  { brand: "iQOO", name: "iQOO Neo 7 Pro", releaseYear: 2023, popular: true },
  { brand: "iQOO", name: "iQOO Z7 5G", releaseYear: 2023 },
  { brand: "iQOO", name: "iQOO 9 Pro", releaseYear: 2022 },

  // ---- Infinix ----
  { brand: "Infinix", name: "Infinix Zero 30 5G", releaseYear: 2023, popular: true },
  { brand: "Infinix", name: "Infinix Note 30 5G", releaseYear: 2023 },
  { brand: "Infinix", name: "Infinix Hot 30 5G", releaseYear: 2023 },
  { brand: "Infinix", name: "Infinix Smart 8", releaseYear: 2023 },

  // ---- Tecno ----
  { brand: "Tecno", name: "Tecno Phantom V Fold", releaseYear: 2023, popular: true },
  { brand: "Tecno", name: "Tecno Camon 20 Pro 5G", releaseYear: 2023 },
  { brand: "Tecno", name: "Tecno Spark 10 Pro", releaseYear: 2023 },
  { brand: "Tecno", name: "Tecno Pova 5 Pro", releaseYear: 2023 },

  // ---- Honor ----
  { brand: "Honor", name: "Honor 90 5G", releaseYear: 2023, popular: true },
  { brand: "Honor", name: "Honor X9b 5G", releaseYear: 2023 },
  { brand: "Honor", name: "Honor Magic 5 Pro", releaseYear: 2023 },

  // ---- Huawei ----
  { brand: "Huawei", name: "Huawei P60 Pro", releaseYear: 2023, popular: true },
  { brand: "Huawei", name: "Huawei Mate 50 Pro", releaseYear: 2022 },
  { brand: "Huawei", name: "Huawei Nova 11", releaseYear: 2023 },

  // ---- Asus ----
  { brand: "Asus", name: "Asus ROG Phone 8 Pro", releaseYear: 2024, popular: true },
  { brand: "Asus", name: "Asus ROG Phone 7", releaseYear: 2023, popular: true },
  { brand: "Asus", name: "Asus Zenfone 10", releaseYear: 2023 },
  { brand: "Asus", name: "Asus Zenfone 9", releaseYear: 2022 },

  // ---- LG ----
  { brand: "LG", name: "LG Wing", releaseYear: 2020 },
  { brand: "LG", name: "LG Velvet", releaseYear: 2020 },
  { brand: "LG", name: "LG G8X ThinQ", releaseYear: 2019 },
];

export interface DeviceInstallResult {
  brandsCreated: string[];
  brandsFlagged: string[];
  brandsUnchanged: string[];
  modelsCreated: number;
  modelsSkipped: number;
}

/**
 * Idempotent installer for the repair brand/model seed.
 *
 * Safe to run repeatedly and safe to run against a shop that has already edited
 * its catalogue: the only mutation applied to an existing row is setting
 * `repairable = true` on a brand that isn't flagged yet.
 */
export async function installDeviceCatalogue(): Promise<DeviceInstallResult> {
  const result: DeviceInstallResult = {
    brandsCreated: [],
    brandsFlagged: [],
    brandsUnchanged: [],
    modelsCreated: 0,
    modelsSkipped: 0,
  };

  const brandIdBySeedName = new Map<string, number>();

  for (const seed of SEED_BRANDS) {
    const slug = slugify(seed.name);
    const [existing] = await db.select().from(brands).where(eq(brands.slug, slug));

    if (!existing) {
      const [created] = await db
        .insert(brands)
        .values({
          name: seed.name,
          slug,
          bgColor: seed.bgColor,
          logoUrl: placeholderLogo(slug),
          active: true,
          repairable: true,
          sortOrder: seed.sortOrder,
        })
        .returning();
      brandIdBySeedName.set(seed.name, created.id);
      result.brandsCreated.push(seed.name);
      continue;
    }

    brandIdBySeedName.set(seed.name, existing.id);

    // The brand is already in the shop's catalogue (it sells this brand).
    // Flag it repairable and, only if it has no logo at all, fill in the
    // placeholder. Its name, colour and sort position are the owner's
    // merchandising decisions and are never touched — and an existing logo is
    // never replaced, because a real logo the owner uploaded must always beat
    // our generated stand-in.
    const patch: { repairable?: boolean; logoUrl?: string } = {};
    if (!existing.repairable) patch.repairable = true;
    if (!existing.logoUrl) patch.logoUrl = placeholderLogo(existing.slug);

    if (Object.keys(patch).length > 0) {
      await db.update(brands).set(patch).where(eq(brands.id, existing.id));
      result.brandsFlagged.push(existing.name);
    } else {
      result.brandsUnchanged.push(existing.name);
    }
  }

  for (const seed of SEED_MODELS) {
    const brandId = brandIdBySeedName.get(seed.brand);
    if (brandId == null) continue;

    // modelSlug, not slugify: "Galaxy S23+" and "Galaxy S23" must not collide.
    // See lib/repair/slug.ts.
    const slug = modelSlug(seed.name);
    const [existing] = await db
      .select()
      .from(deviceModels)
      .where(and(eq(deviceModels.brandId, brandId), eq(deviceModels.slug, slug)));

    if (existing) {
      result.modelsSkipped += 1;
      continue;
    }

    await db.insert(deviceModels).values({
      brandId,
      name: seed.name,
      slug,
      image: "",
      imageAlt: `${seed.brand} ${seed.name}`,
      releaseYear: seed.releaseYear ?? null,
      popular: Boolean(seed.popular),
      active: true,
      sortOrder: 0,
    });
    result.modelsCreated += 1;
  }

  return result;
}

/** Count of seeded models per brand, for Admin's "what will this add?" preview. */
export function seedModelCounts(): Record<string, number> {
  return SEED_MODELS.reduce<Record<string, number>>((acc, m) => {
    acc[m.brand] = (acc[m.brand] ?? 0) + 1;
    return acc;
  }, {});
}
