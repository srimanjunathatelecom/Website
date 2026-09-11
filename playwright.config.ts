import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Playwright runs in its own process, so it does not inherit the .env loading
// that Next does for the app. Without this, tests that need real credentials
// (the admin sign-in helper) would see undefined. @next/env ships with Next and
// applies the same .env precedence rules the app itself uses, so there is no
// extra dependency and no second set of rules to keep in sync.
loadEnvConfig(process.cwd());

/**
 * End-to-end tests for the storefront and admin console.
 *
 * These run against a real server and a real database — they place actual
 * orders and write actual rows. Point BASE_URL at a disposable environment,
 * never at production.
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm run build && npm run start     (or set BASE_URL to a running server)
 *
 * Then:  npm run test:e2e
 */
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Several specs assert on rate limits and coupon redemption counts, which
  // are shared global state — running them in parallel would make them fight
  // each other and flake. Correctness over speed for a suite this small.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // This app's network never fully settles (polling, ISR revalidation), so
    // "networkidle" waits hang. Specs wait on concrete elements instead.
    actionTimeout: 15_000,
  },
  projects: [
    // Mobile first: the original brief called out 320-414px, and layout
    // regressions show up there long before they do on desktop.
    { name: "mobile", use: { ...devices["Pixel 5"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
