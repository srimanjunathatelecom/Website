import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl;
  return {
    // /admin is the internal management console — it's already
    // authenticated and login carries its own noindex metadata, but
    // keeping crawlers out entirely here too means the admin shell is
    // never fetched or linked from search results in the first place.
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: base + "/sitemap.xml",
  };
}