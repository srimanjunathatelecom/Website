import type { NextConfig } from "next";
import { imageRemotePatterns } from "./src/lib/imageHosts";

/**
 * Response headers applied to every route.
 *
 * The app previously sent none of these, which left three concrete holes:
 * the admin console could be framed by any site (clickjacking — an invisible
 * overlay over a real, logged-in session), browsers were free to MIME-sniff
 * responses, and a full referrer including the path was leaked to every
 * outbound link and third-party image host.
 *
 * There is deliberately no `script-src` here. Next.js inlines bootstrap and
 * flight-data scripts, so a strict script policy needs per-request nonces
 * wired through middleware; adding one carelessly is how you ship a site
 * whose JavaScript silently refuses to run. The directives below are the
 * subset that is unambiguously safe to set statically and still closes the
 * abuse worth closing: nothing may frame us, no plugins, and `<base>` cannot
 * be rewritten to hijack relative URLs.
 */
const securityHeaders = [
  // Legacy equivalent of frame-ancestors, still honoured by older browsers.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the origin cross-site but keep the full URL for same-origin
  // navigation, so internal analytics still work without leaking order or
  // invoice paths to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays enabled: the storefront uses it to pick the nearest
  // outlet. Everything else the site never asks for is switched off.
  //
  // `payment` has to be allowed now that checkout is real. This header was
  // written before online payment existed, when `payment=()` cost nothing.
  // Razorpay's checkout runs in an iframe from its own origin and reaches for
  // the Payment Request API to offer Google Pay and Apple Pay; with the feature
  // switched off those options simply don't appear. Nothing errors, the sheet
  // just quietly shows fewer ways to pay, which is close to the worst kind of
  // bug to find in production. Scoped to this origin and Razorpay's, not "*".
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "usb=()",
      "geolocation=(self)",
      'payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")',
    ].join(", "),
  },
  // Content-Security-Policy is deliberately NOT set here. It needs a per-request
  // nonce for script-src, which a static config cannot produce, so the whole
  // policy is built in src/middleware.ts. Setting it in both places would send
  // two CSP headers, and browsers enforce every policy they receive: the static
  // one has no nonce, so it would block the very scripts the nonce allows.
  // Ignored over plain HTTP, so this is inert locally and takes effect once
  // the site is served over TLS. No `preload` — that is effectively
  // irreversible and should be a deliberate decision, not a side effect of
  // a config change.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework version in every response.
  poweredByHeader: false,
  // Emit a self-contained server in .next/standalone so the Docker runner
  // stage can copy just that plus static assets, instead of shipping the
  // whole node_modules tree. `next start` locally is unaffected.
  output: "standalone",
  // Two lockfiles can be visible in some checkouts (workspace tooling); pin
  // the tracing root so the build never guesses the wrong project root.
  outputFileTracingRoot: __dirname,
  images: {
    // Hosts the optimizer may fetch from, from NEXT_PUBLIC_IMAGE_HOSTS. Empty by
    // default, which disables remote optimization rather than acting as an open
    // fetch-and-resize proxy for any HTTPS URL. Images on non-allowlisted hosts
    // still render — the components fall back to a plain <img>. See
    // src/lib/imageHosts.ts for why the default points this way.
    remotePatterns: imageRemotePatterns(),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
