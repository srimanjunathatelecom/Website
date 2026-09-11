import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";

// The console's typography was designed around these two — Bricolage
// Grotesque for headings (characterful, unmistakably "internal tool", so an
// admin tab never gets confused with the shop) and JetBrains Mono for
// numbers and codes (fixed-width digits keep stock counts and rupee amounts
// aligned in tables). globals.css referenced both by name from day one, but
// nothing ever loaded them, so every admin heading silently fell back to
// Inter. Loaded here — not in the root layout — so shoppers never download
// admin-only fonts.
const admDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-adm-display",
  display: "swap",
});

const admMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-adm-mono",
  display: "swap",
});

// Applies to every route under /admin (dashboard, login, variants,
// pincodes) — this is the internal management console and should never
// appear in search results, regardless of which admin page a crawler
// happens to reach. robots.ts also disallows /admin outright; this meta
// tag is the authoritative per-page signal for any bot that indexes a
// URL without crawling it (e.g. one reached via an external link).
// Every admin route also needs its own browser-tab title. Without one they all
// inherited the storefront's "SMS Stores — Genuine Products, Honest Pricing",
// so a shop owner with the shop open in one tab and the console in another had
// two identical tabs and no way to tell which was which. The dashboard is a
// client component and cannot export metadata itself, so it belongs here.
export const metadata: Metadata = {
  // `absolute` rather than `default` on purpose: the root layout applies its own
  // title template (which the shop owner edits under Nav/Footer/SEO), and a
  // `default` here would be fed through it - the console came out titled
  // "Admin Console · SMS Stores | SMS Stores". `absolute` opts this segment out
  // of the parent template while `template` still applies to the pages beneath
  // it, so /admin/variants reads "Product Variants · SMS Stores Admin".
  title: {
    absolute: "Admin Console · SMS Stores",
    template: "%s · SMS Stores Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className={`${admDisplay.variable} ${admMono.variable}`}>{children}</div>;
}