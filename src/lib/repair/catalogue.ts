// The full SMS Stores mobile-repair catalogue.
// Installed idempotently: existing services (matched by name, case-insensitive)
// are never duplicated and owner-edited fields are never overwritten — the
// installer only fills fields that are still empty.

import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { services } from "@/db/schema";
import { REPAIR_IMAGE_LIBRARY, findLibraryImage } from "./imageLibrary";

export interface RepairServiceDef {
  name: string;
  description: string;
  category: string;
  /** slug into REPAIR_IMAGE_LIBRARY */
  imageSlug: string;
  featured?: boolean;
  sortOrder: number;
  /** owner should double-check this entry (naming or image) in Admin */
  needsReview?: boolean;
  reviewNote?: string;
}

export const CATEGORIES = [
  "Buttons & Sensors",
  "Display & Glass",
  "Power & Charging",
  "Audio & Mic",
  "Camera",
  "Body & Frame",
  "Other",
] as const;

// Prices and turnarounds are intentionally NOT invented here. New services
// default to "Price on inspection" / "On diagnosis"; existing services keep
// whatever the owner already entered.
export const REPAIR_CATALOGUE: RepairServiceDef[] = [
  { name: "Volume Up & Down Keys Replacement", description: "Replacement of faulty, stuck or unresponsive volume keys.", category: "Buttons & Sensors", imageSlug: "volume-keys", sortOrder: 1, needsReview: true, reviewNote: "Closest professional photo applied — confirm the volume-keys image." },
  { name: "Home Button Replacement", description: "Replacement of a worn or non-working home button.", category: "Buttons & Sensors", imageSlug: "home-button", sortOrder: 2 },
  { name: "Fingerprint Sensor Replacement", description: "Replacement of a faulty fingerprint sensor.", category: "Buttons & Sensors", imageSlug: "fingerprint-sensor", sortOrder: 3 },
  { name: "Screen Replacement", description: "Replacement of a damaged or unresponsive touch screen.", category: "Display & Glass", imageSlug: "screen-replacement", featured: true, sortOrder: 4, needsReview: true, reviewNote: "Closest professional photo applied — confirm the screen-replacement image." },
  { name: "Other Service", description: "Any repair not listed here — tell us the issue and we will diagnose it.", category: "Other", imageSlug: "other-service", sortOrder: 19 },
  { name: "Glass Replacement (Front)", description: "Replacement of the front glass while keeping the original display.", category: "Display & Glass", imageSlug: "glass-front", sortOrder: 5 },
  { name: "Display Replacement", description: "Replacement of a cracked or shattered display panel.", category: "Display & Glass", imageSlug: "display-replacement", featured: true, sortOrder: 6 },
  { name: "Back Glass Replacement", description: "Replacement of a cracked or scratched rear glass panel.", category: "Body & Frame", imageSlug: "back-glass", featured: true, sortOrder: 7 },
  { name: "Battery Replacement", description: "Replacement of a weak or swollen battery.", category: "Power & Charging", imageSlug: "battery", featured: true, sortOrder: 8 },
  { name: "Body Housing Replacement", description: "Replacement of a bent or damaged body housing / frame.", category: "Body & Frame", imageSlug: "body-housing", sortOrder: 9 },
  { name: "Charging Port Replacement", description: "Replacement of a loose or non-charging port connector.", category: "Power & Charging", imageSlug: "charging-port", featured: true, sortOrder: 10 },
  { name: "Speaker Replacement", description: "Replacement of a distorted or silent earpiece / media speaker.", category: "Audio & Mic", imageSlug: "speaker", sortOrder: 11 },
  { name: "Camera Replacement (Rear)", description: "Replacement of a blurry, shaky or non-working rear camera module.", category: "Camera", imageSlug: "camera-rear", featured: true, sortOrder: 12 },
  { name: "Camera Replacement (Front)", description: "Replacement of a faulty front camera module.", category: "Camera", imageSlug: "camera-second", sortOrder: 13, needsReview: true, reviewNote: "Catalogue listed two camera services — confirm the rear/front naming matches how the shop quotes them." },
  { name: "Ringer Replacement", description: "Replacement of a faulty ringer / loudspeaker.", category: "Audio & Mic", imageSlug: "ringer", sortOrder: 14 },
  { name: "Mic Replacement", description: "Replacement of a muffled or dead microphone.", category: "Audio & Mic", imageSlug: "mic", sortOrder: 15 },
  { name: "Vibrator Replacement", description: "Replacement of a weak or non-working vibration motor.", category: "Buttons & Sensors", imageSlug: "vibrator", sortOrder: 16, needsReview: true, reviewNote: "Closest professional photo applied — confirm the vibration-motor image." },
  { name: "Handsfree Connector Jack Replacement", description: "Replacement of a loose or non-working 3.5mm headphone jack.", category: "Audio & Mic", imageSlug: "handsfree-jack", sortOrder: 17 },
  { name: "Power On-Off Button Replacement", description: "Replacement of a stuck or unresponsive power button.", category: "Buttons & Sensors", imageSlug: "power-button", sortOrder: 18, needsReview: true, reviewNote: "Closest professional photo applied — confirm the power-button image." },
];

export interface InstallResult {
  created: string[];
  updated: string[];
  skipped: string[];
  needsReview: { name: string; note: string }[];
}

function buildImageSource(def: RepairServiceDef): string {
  const entry = findLibraryImage(def.imageSlug);
  if (!entry) return "";
  return JSON.stringify({
    name: entry.source.name,
    url: entry.source.url,
    license: entry.source.license,
    status: def.needsReview || entry.status === "needs_review" ? "needs_review" : "verified",
    note: def.reviewNote || undefined,
  });
}

/**
 * Idempotent installer:
 *  - missing services are created with library image + category
 *  - existing services only get empty fields filled (image/alt/source/category)
 *  - nothing the owner already set is ever overwritten
 */
export async function installRepairCatalogue(): Promise<InstallResult> {
  const result: InstallResult = { created: [], updated: [], skipped: [], needsReview: [] };

  for (const def of REPAIR_CATALOGUE) {
    const entry = findLibraryImage(def.imageSlug);
    const [existing] = await db
      .select()
      .from(services)
      .where(sql`lower(${services.name}) = lower(${def.name})`);

    if (!existing) {
      await db.insert(services).values({
        name: def.name,
        description: def.description,
        deviceTypes: "Mobile",
        startPrice: "Price on inspection",
        turnaround: "On diagnosis",
        sortOrder: def.sortOrder,
        status: "active",
        image: entry?.file ?? "",
        imageAlt: entry?.alt ?? "",
        imageSource: buildImageSource(def),
        category: def.category,
        featured: Boolean(def.featured),
      });
      result.created.push(def.name);
    } else {
      const patch: Partial<typeof services.$inferInsert> = {};
      if (!existing.image && entry) {
        patch.image = entry.file;
        patch.imageAlt = existing.imageAlt || entry.alt;
        patch.imageSource = existing.imageSource || buildImageSource(def);
      }
      if (!existing.category) patch.category = def.category;
      if (Object.keys(patch).length > 0) {
        await db.update(services).set(patch).where(eq(services.id, existing.id));
        result.updated.push(def.name);
      } else {
        result.skipped.push(def.name);
      }
    }

    if (def.needsReview) {
      result.needsReview.push({ name: def.name, note: def.reviewNote || "Review this service in Admin." });
    }
  }

  return result;
}

export { REPAIR_IMAGE_LIBRARY };
