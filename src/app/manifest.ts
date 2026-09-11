import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/queries";

/**
 * PWA web app manifest, served at /manifest.webmanifest (Next generates the
 * <link> tag automatically). With this, Chrome on Android offers "Add to Home
 * screen" as a real install: the store opens full-screen from its own icon,
 * which is the closest a small shop gets to "having an app" for free.
 *
 * Brand name and tagline come from store settings so a rename in the admin
 * panel carries through; the DB read is wrapped because the manifest must
 * still be servable while the database is down (e.g. during first deploy).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let brandName = "SMS Stores";
  let legalName = "Smart Mobile Stores";
  let tagline = "Real Prices. Real Savings. Every Day.";
  try {
    const s = await getSettings();
    if (s?.brandName) brandName = s.brandName;
    if (s?.legalName) legalName = s.legalName;
    if (s?.tagline) tagline = s.tagline;
  } catch {
    // Defaults above match the seeded settings row.
  }

  return {
    name: legalName,
    short_name: brandName,
    description: tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    // Matches the storefront header's deep blue so the installed app's
    // status bar blends with the UI.
    theme_color: "#1e40af",
    orientation: "portrait",
    categories: ["shopping"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // The same tile doubles as the maskable icon: the logo sits inside
        // the 72% safe zone, so circular crops don't clip the wordmark.
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
