import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import WhatsAppFloat from "./WhatsAppFloat";
import CookieConsent from "./CookieConsent";
import Analytics from "./Analytics";
import AnnouncementBar from "./AnnouncementBar";
import { isAnnouncementLive } from "@/lib/siteConfig";
import { getShellData } from "@/lib/shellData";

/**
 * The chrome every page renders inside: announcement bar, header, footer and
 * the floating helpers.
 *
 * The seven sequential database reads that used to live in this function are
 * now one parallel, request-memoised batch in `@/lib/shellData` — see the note
 * there for why that mattered more than anything else on the site. This file is
 * back to being markup.
 *
 * The `export const dynamic = "force-dynamic"` that used to sit here has been
 * removed. Route segment config is only read from `page.tsx`, `layout.tsx` and
 * `route.ts`; in a plain component file it was inert, and leaving it in place
 * only invited someone to believe the caching behaviour of every page on the
 * site was decided here.
 */

export default async function AppShell({ children }: { children: ReactNode }) {
  const {
    settings,
    outletList,
    cats,
    homeConfig,
    navConfig,
    footerConfig,
    announcementConfig,
  } = await getShellData();

  const brand = settings?.brandName || "SMS Stores";
  const wa = settings?.whatsappNumber || "";
  const logoUrl = settings?.logoUrl || "/images/sms-logo.png";

  return (
    <div className="flex min-h-screen flex-col">
      {isAnnouncementLive(announcementConfig) && (
        <div className="print:hidden">
          <AnnouncementBar config={announcementConfig} />
        </div>
      )}
      {/* Every page puts an announcement bar, a category strip and a full
          header between the top of the document and the actual content. A
          keyboard or screen-reader user had to tab through all of it on every
          single page before reaching anything they came for. The link is
          visually hidden until it takes focus, so it costs sighted users
          nothing and is the first stop for everyone else. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>
      <Header brand={brand} categories={cats} whatsapp={wa} logoUrl={logoUrl} homeConfig={homeConfig} navItems={navConfig.items} />
      {/* tabIndex={-1} so the skip link can actually move focus here; without
          it the browser scrolls but focus stays in the header, and the next Tab
          drops the user straight back into the navigation they just skipped. */}
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <Footer settings={settings} outlets={outletList} categories={cats} footerConfig={footerConfig} logoUrl={logoUrl} />
      <WhatsAppFloat number={wa} />
      <CookieConsent />
      <Analytics />
    </div>
  );
}