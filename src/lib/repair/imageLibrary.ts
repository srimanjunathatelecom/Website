// Bundled library of real, licence-verified repair photos.
// Every file in /public/images/services was manually reviewed before inclusion.
// Licences: Pexels License / Unsplash License — free for commercial use, no attribution required.

export type RepairImageStatus = "verified" | "needs_review";

export interface RepairImageEntry {
  /** stable id, also the file name under /images/services */
  slug: string;
  /** public path served by Next.js */
  file: string;
  /** descriptive alt text */
  alt: string;
  /** lower-case keywords used by the auto-fill matcher */
  keywords: string[];
  /** provenance + licence, stored on the service row when applied */
  source: { name: string; url: string; license: string };
  /**
   * "verified"      – image visually matches the repair type exactly
   * "needs_review"  – closest professional real photo available; owner should confirm
   */
  status: RepairImageStatus;
}

const PEXELS = "Pexels License (free for commercial use, no attribution required)";
const UNSPLASH = "Unsplash License (free for commercial use, no attribution required)";

export const REPAIR_IMAGE_LIBRARY: RepairImageEntry[] = [
  {
    slug: "volume-keys",
    file: "/images/services/volume-keys.webp",
    alt: "Side of a smartphone showing the volume and power buttons",
    keywords: ["volume", "keys", "side", "buttons", "rocker"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/33210184/", license: PEXELS },
    status: "needs_review",
  },
  {
    slug: "home-button",
    file: "/images/services/home-button.webp",
    alt: "Bottom bezel of a white smartphone with the home button visible",
    keywords: ["home", "button", "bezel", "front"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/288479/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "fingerprint-sensor",
    file: "/images/services/fingerprint-sensor.webp",
    alt: "Finger touching the in-display fingerprint area of a smartphone",
    keywords: ["finger", "fingerprint", "sensor", "biometric", "touch"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/12376016/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "screen-replacement",
    file: "/images/services/screen-replacement.webp",
    alt: "Hand holding a smartphone with the screen switched on",
    keywords: ["screen", "touch", "digitizer", "front", "display"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/34975230/", license: PEXELS },
    status: "needs_review",
  },
  {
    slug: "other-service",
    file: "/images/services/other-service.webp",
    alt: "Person holding a blue smartphone",
    keywords: ["other", "general", "misc", "diagnosis", "blue"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/5099867/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "glass-front",
    file: "/images/services/glass-front.webp",
    alt: "Hand holding a smartphone with pristine front glass",
    keywords: ["glass", "front", "tempered", "gorilla"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/13570135/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "display-replacement",
    file: "/images/services/display-replacement.webp",
    alt: "Hand holding up a smartphone with a severely cracked display",
    keywords: ["display", "cracked", "shattered", "broken", "lcd", "amoled"],
    source: {
      name: "Unsplash",
      url: "https://unsplash.com/photos/a-hand-holding-up-a-broken-cell-phone-NVsTuphVWhU",
      license: UNSPLASH,
    },
    status: "verified",
  },
  {
    slug: "back-glass",
    file: "/images/services/back-glass.webp",
    alt: "Rear panels of two smartphones showing the back glass",
    keywords: ["back", "glass", "rear", "panel", "cover"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/28927518/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "battery",
    file: "/images/services/battery.webp",
    alt: "Technician removing components from an opened smartphone with a screwdriver",
    keywords: ["battery", "power", "cell", "replace", "swollen"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/6755075/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "body-housing",
    file: "/images/services/body-housing.webp",
    alt: "Disassembled smartphones and housings on a repair workbench",
    keywords: ["body", "housing", "frame", "chassis", "disassembled"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/31862950/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "charging-port",
    file: "/images/services/charging-port.webp",
    alt: "Close-up of a smartphone charging port with the cable unplugged",
    keywords: ["charging", "port", "usb", "connector", "lightning", "type-c"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/4195332/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "speaker",
    file: "/images/services/speaker.webp",
    alt: "Close-up of a smartphone bottom edge showing the speaker grille",
    keywords: ["speaker", "grille", "audio", "sound"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/32932370/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "camera-rear",
    file: "/images/services/camera-rear.webp",
    alt: "Rear triple-camera module of a smartphone in close-up",
    keywords: ["camera", "rear", "lens", "module", "photo"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/12794501/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "camera-second",
    file: "/images/services/camera-second.webp",
    alt: "Close-up of a smartphone camera housing on a blue phone",
    keywords: ["camera", "front", "selfie", "lens", "second"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/12969045/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "ringer",
    file: "/images/services/ringer.webp",
    alt: "Bottom edge of a smartphone showing the loudspeaker outlets",
    keywords: ["ringer", "loudspeaker", "buzzer", "ringtone"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/18662753/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "mic",
    file: "/images/services/mic.webp",
    alt: "Soldering work on a smartphone logic board during a component repair",
    keywords: ["mic", "microphone", "audio", "solder", "board"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/6755136/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "vibrator",
    file: "/images/services/vibrator.webp",
    alt: "Smartphone board under a repair microscope for a small-component replacement",
    keywords: ["vibrator", "vibration", "motor", "haptic", "taptic"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/6755092/", license: PEXELS },
    status: "needs_review",
  },
  {
    slug: "handsfree-jack",
    file: "/images/services/handsfree-jack.webp",
    alt: "Bottom edge of a smartphone showing the 3.5mm headphone jack",
    keywords: ["handsfree", "jack", "headphone", "3.5mm", "aux"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/845163/", license: PEXELS },
    status: "verified",
  },
  {
    slug: "power-button",
    file: "/images/services/power-button.webp",
    alt: "Side rail of a smartphone where the power button sits",
    keywords: ["power", "button", "on", "off", "switch", "side"],
    source: { name: "Pexels", url: "https://www.pexels.com/photo/13657932/", license: PEXELS },
    status: "needs_review",
  },
];

export function findLibraryImage(slug: string): RepairImageEntry | undefined {
  return REPAIR_IMAGE_LIBRARY.find((e) => e.slug === slug);
}

/**
 * Score how well a library entry matches a service name/description.
 * Returns 0..1 — used by the Auto-Fill Service Images workflow.
 */
export function scoreLibraryMatch(entry: RepairImageEntry, text: string): number {
  const hay = text.toLowerCase();
  if (!hay.trim()) return 0;
  let hits = 0;
  for (const kw of entry.keywords) {
    if (hay.includes(kw)) hits += 1;
  }
  return Math.min(1, hits / Math.max(2, Math.ceil(entry.keywords.length / 2)));
}
