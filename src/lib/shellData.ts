import { cache } from "react";
import { db } from "@/db";
import { storeSettings, outlets, categories, contentPages } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { HOME_CONFIG_SLUG, parseHomePageConfig } from "@/lib/homepageConfig";
import {
  NAV_CONFIG_SLUG,
  FOOTER_CONFIG_SLUG,
  ANNOUNCEMENT_CONFIG_SLUG,
  parseNavConfig,
  parseFooterConfig,
  parseAnnouncementConfig,
  DEFAULT_NAV_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_ANNOUNCEMENT_CONFIG,
} from "@/lib/siteConfig";

/**
 * Everything the site chrome needs, in as few database round trips as the shape
 * of the data allows.
 *
 * AppShell used to read this inline as seven sequential `await`s: settings,
 * outlets, categories, then four separate `contentPages` lookups for the home,
 * nav, footer and announcement configs. None of the seven depends on another,
 * so the shell's latency was the *sum* of seven round trips rather than the
 * *maximum* of them. Against a managed Postgres on another host that is a few
 * hundred milliseconds spent before the page's own content is even reached —
 * on every navigation, on every route, since AppShell wraps all of them. That
 * was the single largest contributor to the "nothing happens when I click"
 * complaint, and it was invisible in a local profile because a local database
 * answers in about a millisecond.
 *
 * Two changes fix it:
 *
 *  - The four `contentPages` reads collapse into one `IN (...)` query. They hit
 *    the same table on the same indexed column and differ only in the slug, so
 *    there was never a reason to ask four times.
 *
 *  - The remaining four reads run in `Promise.all`, because they are
 *    independent.
 *
 * Seven serial trips become one parallel batch of four.
 *
 * The whole thing is then wrapped in React's `cache()`. AppShell is rendered
 * once per request, but `getSettings()` and `getOutlets()` are also called from
 * the root layout's structured data and from several page bodies, and every one
 * of those was previously its own trip. `cache()` is per-request memoisation,
 * not a cross-request cache, so nothing here can serve a stale row to a
 * visitor: an Admin edit is still visible on the next request.
 */

const CONFIG_SLUGS = [
  HOME_CONFIG_SLUG,
  NAV_CONFIG_SLUG,
  FOOTER_CONFIG_SLUG,
  ANNOUNCEMENT_CONFIG_SLUG,
];

export type ShellData = {
  settings: any;
  outletList: any[];
  cats: any[];
  homeConfig: ReturnType<typeof parseHomePageConfig>;
  navConfig: typeof DEFAULT_NAV_CONFIG;
  footerConfig: typeof DEFAULT_FOOTER_CONFIG;
  announcementConfig: typeof DEFAULT_ANNOUNCEMENT_CONFIG;
};

function fallback(): ShellData {
  return {
    settings: null,
    outletList: [],
    cats: [],
    homeConfig: parseHomePageConfig(),
    navConfig: DEFAULT_NAV_CONFIG,
    footerConfig: DEFAULT_FOOTER_CONFIG,
    announcementConfig: DEFAULT_ANNOUNCEMENT_CONFIG,
  };
}

export const getShellData = cache(async function getShellData(): Promise<ShellData> {
  try {
    const [settingsRows, outletRows, categoryRows, configRows] = await Promise.all([
      db.select().from(storeSettings).where(eq(storeSettings.id, 1)),
      db.select().from(outlets).orderBy(desc(outlets.isMain), outlets.id),
      db.select().from(categories),
      db.select().from(contentPages).where(inArray(contentPages.slug, CONFIG_SLUGS)),
    ]);

    const bySlug = new Map(configRows.map((r) => [r.slug, r.body]));

    return {
      settings: settingsRows[0] ?? null,
      outletList: outletRows,
      cats: categoryRows,
      homeConfig: parseHomePageConfig(bySlug.get(HOME_CONFIG_SLUG)),
      navConfig: parseNavConfig(bySlug.get(NAV_CONFIG_SLUG)),
      footerConfig: parseFooterConfig(bySlug.get(FOOTER_CONFIG_SLUG)),
      announcementConfig: parseAnnouncementConfig(bySlug.get(ANNOUNCEMENT_CONFIG_SLUG)),
    };
  } catch (e) {
    // Same posture as before: the chrome renders with defaults rather than
    // taking the whole page down because one config row could not be read.
    console.error("AppShell data fetch failed", e);
    return fallback();
  }
});
