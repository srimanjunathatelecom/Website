import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope, Inter } from "next/font/google";
import { db } from "@/db";
import { contentPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SEO_CONFIG_SLUG, parseSeoConfig, DEFAULT_SEO_CONFIG } from "@/lib/siteConfig";
import { getSettings, getOutlets } from "@/lib/queries";
import { safeJsonLd } from "@/lib/safeJsonLd";
import "./globals.css";
import { siteUrl } from "@/lib/env";
import { headers } from "next/headers";
import IdleDecor from "@/components/IdleDecor";

// Manrope: confident, slightly geometric grotesque - closest open-source
// match to the Amazon Ember / Flipkart marketplace headline style.
const displayFont = Manrope({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// Inter: the same neutral, highly legible grotesque family used across
// most premium ecommerce UI body text.
const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  let seo = DEFAULT_SEO_CONFIG;
  try {
    const [row] = await db.select().from(contentPages).where(eq(contentPages.slug, SEO_CONFIG_SLUG));
    seo = parseSeoConfig(row?.body);
  } catch (e) {
    console.error("SEO metadata fetch failed", e);
  }

  const meta: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
      default: seo.siteTitle,
      template: seo.titleTemplate,
    },
    description: seo.metaDescription,
    openGraph: {
      type: "website",
      siteName: seo.siteName,
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: siteUrl,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
      ...(seo.ogImage ? { images: [seo.ogImage] } : {}),
    },
  };

  return meta;
}

/**
 * "10:00 AM" / "9:30 PM" → "10:00" / "21:30" for schema.org
 * openingHoursSpecification, which requires 24-hour HH:MM. Returns null on
 * anything unparseable so the field is omitted rather than emitted wrong —
 * bad hours in structured data are worse for local SEO than none.
 */
function to24h(s: string): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i.exec(s || "");
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const ap = (m[3] || "").toUpperCase();
  if (h > 23 || Number(min) > 59) return null;
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
}

const themeInit = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e){}
})();
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Set by src/middleware.ts. Next stamps its own script tags with this
  // automatically, but these hand-written JSON-LD tags are ours, so they need it
  // applied explicitly or script-src will block them.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Site-wide Organization/LocalBusiness structured data — built entirely
  // from real store settings + outlet rows (never fabricated placeholder
  // data). Missing/empty fields are simply omitted from the object rather
  // than filled with guesses, so a store that hasn't filled in every
  // setting still gets valid (if partial) structured data.
  let orgJsonLd: Record<string, any> | null = null;
  try {
    const [settings, outletRows] = await Promise.all([getSettings(), getOutlets()]);
    if (settings) {
      orgJsonLd = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: settings.brandName || settings.legalName || undefined,
        legalName: settings.legalName || undefined,
        url: siteUrl,
        logo: settings.logoUrl || undefined,
        email: settings.supportEmail || undefined,
        telephone: settings.supportPhone || undefined,
      };
      if (outletRows.length) {
        orgJsonLd.location = outletRows.map((o) => {
          const opens = to24h(o.hoursOpen);
          const closes = to24h(o.hoursClose);
          return {
            "@type": "LocalBusiness",
            name: o.name,
            // PostalAddress (rather than a bare string) is what Google's
            // local-business rich result parser actually reads. The full
            // street address lives in one free-text column, so it goes in
            // streetAddress verbatim — no invented locality/pincode splits.
            address: o.addressLine
              ? { "@type": "PostalAddress", streetAddress: o.addressLine, addressCountry: "IN" }
              : undefined,
            telephone: o.contact || undefined,
            email: o.email || undefined,
            image: o.photo || undefined,
            hasMap: o.mapsUrl || undefined,
            ...(opens && closes
              ? {
                  openingHoursSpecification: [
                    {
                      "@type": "OpeningHoursSpecification",
                      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                      opens,
                      closes,
                    },
                  ],
                }
              : {}),
            ...(o.lat && o.lng
              ? { geo: { "@type": "GeoCoordinates", latitude: Number(o.lat), longitude: Number(o.lng) } }
              : {}),
          };
        });
      }
    }
  } catch (e) {
    console.error("Organization structured data fetch failed", e);
  }

  return (
    <html lang="en" suppressHydrationWarning className={`${displayFont.variable} ${bodyFont.variable}`}>
      <head>
        {/* Must live in <head>, not <body>: `beforeInteractive` is only
            guaranteed to run before first paint when Next.js can inject it
            into <head>. It was previously placed inside <body>, which
            defeats the whole point of beforeInteractive — the dark class
            could land on <html> after the page had already started
            painting, causing the light/dark toggle to visibly flicker or
            occasionally fail to reflect the stored preference on first
            load. */}
        {/* Plain inline <script> rather than next/script: an inline script in
            the SSR'ed head already runs before first paint (equivalent to
            beforeInteractive), and next/script's wrapper swallowed
            suppressHydrationWarning — browsers hide the nonce content
            attribute after parsing (nonce hiding), so React's hydration diff
            saw nonce="" on the client and logged a mismatch on every load. */}
        <script
          id="theme-init"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInit }}
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col" suppressHydrationWarning>
        {orgJsonLd && (
          <script
            type="application/ld+json"
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: safeJsonLd(orgJsonLd) }}
          />
        )}
        {children}
        {/* Stops decorative infinite animations from ticking style and
            re-rasterising while they are off screen. Renders no markup. */}
        <IdleDecor />
      </body>
    </html>
  );
}