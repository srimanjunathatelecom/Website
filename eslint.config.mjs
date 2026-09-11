import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  {
    // The admin dashboard's <img> tags are all thumbnails and previews of
    // whatever the owner just pasted or uploaded, which in practice is an
    // inline data: URI. next/image cannot process those — it needs a source it
    // can fetch and re-encode — so "fixing" these would blank out the previews.
    //
    // Nor is there anything to win: the dashboard sits behind a login, is never
    // indexed, has no meaningful LCP, and routing owner-supplied URLs through
    // the optimizer would only add work and cost per edit. The customer-facing
    // images are the ones that matter, and those go through next/image wherever
    // the source allows it (see ProductCard).
    //
    // Disabled here rather than with a dozen inline comments so the reason is
    // recorded once, and so real warnings elsewhere stay visible instead of
    // being lost in known noise.
    files: ["src/components/AdminDashboard.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },

  {
    // Surfaces disable comments that no longer match the code they were written
    // for — that is how a suppression silently outlives its reason.
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
]);
