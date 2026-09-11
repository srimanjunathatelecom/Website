/**
 * Content-Security-Policy, with a per-request nonce.
 *
 * The static headers in next.config.ts already carried the parts of a CSP that
 * need no nonce — frame-ancestors, object-src, base-uri. The missing piece was
 * script-src, which is the directive that actually stops cross-site scripting,
 * and it cannot live in a static config file: a useful script-src has to name a
 * value that changes on every response, or an attacker who can inject a script
 * tag simply copies whatever static token it contains.
 *
 * Hence middleware. A fresh nonce is generated per request, handed to the render
 * through a request header, and named in the response CSP. Next.js reads the
 * nonce out of the request's CSP header and stamps it onto its own bootstrap and
 * next/script tags; the two hand-written JSON-LD tags read it from headers()
 * explicitly, since the framework doesn't own those.
 *
 * Why 'strict-dynamic' rather than a list of allowed hosts:
 *
 * Three things inject scripts at runtime here — the Razorpay checkout SDK, the
 * Google Analytics tag, and the inline gtag config. A host allowlist would have
 * to name all of them, and a host allowlist is weak in a well-known way: any
 * open redirect or hosted user content on an allowed domain turns into script
 * execution. 'strict-dynamic' instead says a script loaded by an
 * already-trusted script is trusted, which is exactly the behaviour those three
 * need, while parser-inserted inline scripts — the shape an injection attack
 * actually takes — stay blocked unless they carry the current nonce.
 *
 * Note that 'strict-dynamic' causes browsers to ignore host expressions in
 * script-src, so checkout.razorpay.com is deliberately not listed: it would be
 * silently ignored and would only mislead whoever reads this next.
 *
 * CSP_REPORT_ONLY=1 sends the policy as Content-Security-Policy-Report-Only,
 * which reports violations without blocking anything. That exists because a
 * mistaken CSP breaks a site quietly, in the browser, where server logs and
 * tests won't show it. Run report-only through a real checkout on the real
 * domain first, then switch it off.
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Cross-origin write protection for the API.
 *
 * Every state-changing route already relies on a session cookie with
 * SameSite=Lax, which blocks the classic CSRF shapes on its own. This check is
 * the cheap second layer the audit asked for: a browser attaches an Origin
 * header to every cross-origin POST/PUT/PATCH/DELETE, and a request whose
 * Origin names a site that isn't ours has no business mutating anything,
 * whatever cookies it carries.
 *
 * Requests without an Origin header pass. That is deliberate, not lenient:
 * server-to-server callers — the Razorpay webhook, curl, uptime checks, the
 * Playwright request fixture — send no Origin, and each of those routes
 * carries its own authentication (HMAC signature, session, seed key). The
 * attack this layer addresses is specifically a browser being driven from
 * another site, and a browser in that position always announces itself.
 */
function crossOriginWriteBlocked(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // A malformed Origin is not something a legitimate browser sends.
    return true;
  }

  // The host the request actually arrived at. Behind the proxy chain this is
  // the forwarded host; locally it is localhost:3000. Comparing against the
  // arrival host rather than a configured constant means the check works
  // unchanged on staging, preview and production domains.
  const requestHost = (
    request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  ).trim();
  if (originHost === requestHost) return false;

  // Also accept the canonical SITE_URL host, which covers a proxy that
  // rewrites Host on the way in.
  const siteUrl = (process.env.SITE_URL || "").trim();
  if (siteUrl) {
    try {
      if (originHost === new URL(siteUrl).host) return false;
    } catch {
      // Invalid SITE_URL is reported loudly elsewhere (env.ts); ignore here.
    }
  }

  return true;
}

/**
 * 128 bits of randomness, base64. Must be unpredictable per response — a nonce
 * an attacker can guess or reuse is the same as having no script-src at all.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest) {
  // API branch: same-origin enforcement only. JSON responses gain nothing
  // from a CSP, so the nonce work below is skipped entirely for these.
  if (request.nextUrl.pathname.startsWith("/api")) {
    if (crossOriginWriteBlocked(request)) {
      return NextResponse.json(
        { error: "Cross-origin request rejected." },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== "production";

  const policy = [
    "default-src 'self'",

    // The nonce covers Next's own bootstrap and the JSON-LD tags;
    // 'strict-dynamic' covers what those scripts go on to load.
    // 'unsafe-eval' is required by the dev server's refresh machinery and must
    // never reach production, so it's conditional rather than always present.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,

    // The weakest directive here, and honestly so. Next injects styles inline
    // during streaming and Tailwind's runtime does the same, neither of which
    // exposes a nonce hook. Inline style is a much smaller problem than inline
    // script — it enables defacement and some data exfiltration via CSS, not
    // code execution — but this is not a strict policy and shouldn't be
    // described as one.
    "style-src 'self' 'unsafe-inline'",

    // Images are the one place this app genuinely accepts arbitrary hosts: the
    // admin console stores product image URLs, historically including data:
    // URLs, and restricting this would blank out the catalogue. The optimizer's
    // own allowlist (NEXT_PUBLIC_IMAGE_HOSTS) is the control that matters for
    // server-side fetching; this directive only governs what the browser
    // renders.
    "img-src 'self' data: blob: https:",

    // Mirrors img-src, for the same reason: banner and hero videos are
    // admin-entered URLs (Cloudflare R2 in production, a data: URL when the
    // bucket isn't configured yet). There was no media-src at all, so video
    // fell through to default-src 'self' and every externally hosted banner
    // video was silently blocked — the <video> element just showed its
    // poster with a CSP violation in the console.
    "media-src 'self' data: blob: https:",

    "font-src 'self' data:",

    // XHR/fetch targets: the app's own API, the payment gateway's, and the
    // analytics endpoint the gtag script posts to.
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://www.google-analytics.com",

    // Razorpay's checkout renders in an iframe it injects into the page.
    // www.google.com is here for the store-location maps embedded on /contact.
    // Without it the policy blocked the iframe outright, so every visitor got a
    // blank box where the branch map should be and two CSP violations in the
    // console. Scoped to that one host rather than opening frame-src up.
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.google.com",

    // Nothing in this app embeds plugins or needs a <base> rewrite, and both are
    // routine bypass primitives.
    "object-src 'none'",
    "base-uri 'self'",

    // Kept from next.config.ts, where it used to live. frame-ancestors has no
    // meta-tag equivalent and is the clickjacking control that supersedes
    // X-Frame-Options.
    "frame-ancestors 'self'",

    // Only the checkout form should be able to submit anywhere, and it submits
    // to us.
    "form-action 'self'",

    // Belt-and-braces against a stray http:// asset downgrading the page once
    // this is served over TLS. Harmless locally, where nothing is https.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // The nonce travels to the render on the request. Next.js also looks for the
  // CSP header on the request to discover the nonce for its own script tags, so
  // both are set here rather than only on the response.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(
    process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    policy
  );
  return response;
}

export const config = {
  /**
   * Skip anything that can't execute script and doesn't need a policy: build
   * output, static files, and the image optimizer. This is a cost decision as
   * much as a correctness one — middleware runs on every matched request, and
   * generating a nonce for each icon is waste. API routes are matched, but
   * take the early same-origin branch above instead of the CSP work — a CSP
   * on a JSON response protects nothing, while a cross-origin write check on
   * exactly those routes is the point.
   */
  matcher: [
    "/api/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|images|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
