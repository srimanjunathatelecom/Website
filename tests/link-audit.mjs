/**
 * Walk the storefront and verify every internal link resolves.
 *
 * Broken links are the cheapest possible way to look unfinished, and they are
 * invisible in code review: a `href="/stores"` compiles perfectly whether or not
 * that page exists. This follows what the site actually renders, so it catches
 * links that were typed once and never clicked.
 *
 * Run against a running dev or production server:
 *   BASE=http://localhost:3000 node tests/link-audit.mjs
 */

const BASE = process.env.BASE || "http://localhost:3000";
const START = ["/", "/products", "/cart", "/checkout", "/login", "/register", "/about", "/contact", "/faq", "/services", "/track", "/wishlist", "/compare", "/account"];

// Admin pages are behind auth and would all report as redirects; they are
// covered by the admin QA pass instead.
const SKIP = /^\/(admin|api|_next)/;

const seen = new Map(); // path -> status
const foundOn = new Map(); // path -> Set of pages linking to it
const queue = [...START];

function normalise(href, from) {
  if (!href) return null;
  if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return null;
  let u;
  try {
    u = new URL(href, BASE + from);
  } catch {
    return null;
  }
  if (u.origin !== new URL(BASE).origin) return null;
  // Query strings and fragments point at the same page; collapsing them keeps
  // the crawl from looping over every filter combination on the listing page.
  return u.pathname.replace(/\/$/, "") || "/";
}

async function run() {
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path) || SKIP.test(path)) continue;

    let res, body = "";
    try {
      res = await fetch(BASE + path, { redirect: "manual" });
      if (res.status >= 200 && res.status < 300) body = await res.text();
    } catch (e) {
      seen.set(path, `ERR ${e.message}`);
      continue;
    }
    seen.set(path, res.status);

    for (const m of body.matchAll(/href="([^"]*)"/g)) {
      const next = normalise(m[1], path);
      if (!next) continue;
      if (!foundOn.has(next)) foundOn.set(next, new Set());
      foundOn.get(next).add(path);
      if (!seen.has(next)) queue.push(next);
    }
  }

  const broken = [...seen.entries()].filter(([, s]) => typeof s !== "number" || s >= 400);
  const redirects = [...seen.entries()].filter(([, s]) => typeof s === "number" && s >= 300 && s < 400);

  console.log(`\nvisited ${seen.size} internal pages`);
  if (redirects.length) {
    console.log("\nredirects (expected for auth-gated pages):");
    for (const [p, s] of redirects) console.log(`  ${s}  ${p}`);
  }

  if (!broken.length) {
    console.log("\nno broken internal links\n");
    return;
  }

  console.log("\nBROKEN:");
  for (const [p, s] of broken) {
    console.log(`  ${s}  ${p}`);
    console.log(`        linked from: ${[...(foundOn.get(p) || ["(start url)"])].join(", ")}`);
  }
  console.log("");
  process.exit(1);
}

run();
