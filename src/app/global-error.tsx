"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary.
 *
 * `app/error.tsx` only catches failures inside a route's own tree — it still
 * renders inside the root layout. If the failure is in the layout itself
 * (a bad settings fetch feeding the header, a throw in a provider), that
 * boundary never mounts and the visitor gets Next's raw error screen instead.
 *
 * This file replaces the entire document, so it must render its own <html>
 * and <body> and cannot rely on the app's providers, fonts or Tailwind
 * layout classes being available. The styling is therefore inline and
 * deliberately self-contained rather than pretty.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#e11d48",
            }}
          >
            Something went wrong
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.875rem", fontWeight: 900 }}>
            The site hit an unexpected error
          </h1>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.95rem", color: "#64748b" }}>
            Please try again in a moment. If it keeps happening, call the store and
            we&apos;ll help you directly.
          </p>
          {/* The digest is the only handle support has to correlate a report
              with a server log line, so it is worth showing. It contains no
              stack trace or internal detail. */}
          {error.digest && (
            <p style={{ margin: "1rem 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>
              Reference: {error.digest}
            </p>
          )}
          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                cursor: "pointer",
                borderRadius: "9999px",
                border: 0,
                background: "#0f172a",
                color: "#fff",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 800,
              }}
            >
              Try again
            </button>
            {/* A plain anchor, not next/link, on purpose: the root tree has
                already failed, and a client-side navigation would try to
                re-render into that same broken tree. A full document load is
                the recovery we actually want here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: "9999px",
                border: "1px solid #cbd5e1",
                color: "#334155",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
