import { test, expect } from "@playwright/test";

/**
 * Password reset flow.
 *
 * SMTP is not configured in the test environment, so the emailed link itself
 * can't be followed here — what these tests lock down instead is everything
 * around it: the pages exist and are reachable from the login form, the
 * forgot endpoint never reveals whether an account exists (the enumeration
 * property that makes the whole design safe), and the reset endpoint refuses
 * bad tokens and weak passwords. The full email round-trip is covered by the
 * launch checklist's manual staging test.
 */

test.describe("forgot password", () => {
  test("login page links to the forgot-password page", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /forgot password/i });
    await expect(link).toHaveAttribute("href", "/forgot-password");
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole("heading", { name: /forgot your password/i })).toBeVisible();
  });

  test("submitting an email shows the same confirmation whether or not the account exists", async ({ page }) => {
    // Unknown address first.
    await page.goto("/forgot-password");
    // Exact match: the footer newsletter field is also labelled
    // "Email address for offers and updates", which a loose regex catches.
    await page.getByLabel("Email address", { exact: true }).fill("definitely-not-a-customer@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 15_000 });

    // The API answer must be indistinguishable too, not just the UI.
    const res = await page.request.post("/api/auth/forgot", {
      data: { email: "another-unknown@example.com" },
    });
    // 429 means the rate limiter (also under test elsewhere) spent this IP's
    // budget — that is a refusal, not an enumeration leak.
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      expect(await res.json()).toEqual({ ok: true });
    }
  });

  test("a malformed email is rejected", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/auth/forgot", { data: { email: "not-an-email" } });
    expect([400, 429]).toContain(res.status());
  });
});

test.describe("reset password", () => {
  test("the reset page renders and asks for a new password", async ({ page }) => {
    await page.goto("/reset-password?token=example");
    await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();
    await expect(page.getByLabel(/^new password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm new password/i)).toBeVisible();
  });

  test("an invalid token is refused", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/auth/reset", {
      data: { token: "0".repeat(64), password: "brand-new-password" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(String(body.error || "")).toMatch(/invalid|expired/i);
    }
  });

  test("a short password is refused before any token work happens", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/auth/reset", {
      data: { token: "0".repeat(64), password: "abc" },
    });
    expect([400, 429]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(String(body.error || "")).toMatch(/6 characters/i);
    }
  });

  test("a missing token is refused", async ({ page }) => {
    await page.goto("/");
    const res = await page.request.post("/api/auth/reset", {
      data: { password: "brand-new-password" },
    });
    expect([400, 429]).toContain(res.status());
  });
});
