import { createHash } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customers, passwordResets, sessions } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { sendCustomerEmail } from "@/lib/notify";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Step two of password recovery: redeem the emailed token and set a new
 * password.
 *
 * The token is matched by SHA-256 hash, must be unexpired and unused, and is
 * consumed inside the same transaction that changes the password — two
 * concurrent redemptions cannot both succeed. Every existing session for the
 * customer is destroyed at the same time: the most common reason to reset a
 * password is fear that someone else knows the old one, and leaving their
 * sessions alive would defeat the point.
 */
export async function POST(req: Request) {
  try {
    // 10 attempts per 15 minutes per IP — enough for a fumbled paste, far too
    // little for guessing 256-bit tokens.
    const rl = await checkRateLimit(`reset:${clientIp(req)}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const body = await req.json();
    const token = String(body.token || "").trim();
    const password = String(body.password || "");

    if (!token) {
      return Response.json({ error: "Reset link is missing or malformed." }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const result = await db.transaction(async (tx) => {
      // Consume the token atomically: the UPDATE both validates and claims it,
      // so a second request racing this one finds used_at already set.
      const claimed = await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResets.tokenHash, tokenHash),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, new Date())
          )
        )
        .returning();
      const reset = claimed[0];
      if (!reset) return null;

      const updated = await tx
        .update(customers)
        .set({ passwordHash: hashPassword(password) })
        .where(eq(customers.id, reset.customerId))
        .returning();
      const customer = updated[0];
      if (!customer) return null;

      // Sign out every device. Whoever holds the new password signs back in;
      // whoever held the old one is out.
      await tx.delete(sessions).where(eq(sessions.customerId, reset.customerId));

      return customer;
    });

    if (!result) {
      return Response.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Best-effort notice — if this email fails the reset has still succeeded,
    // so it must never turn into an error response.
    void sendCustomerEmail(
      result.email,
      "Your password was changed",
      `Hi ${result.name},\n\n` +
        `The password for your SMS Stores account was just changed using a reset link, ` +
        `and you have been signed out of all devices.\n\n` +
        `If this was you, no action is needed. If it wasn't, please reset your password ` +
        `again immediately and contact us.`
    );

    return Response.json({ ok: true });
  } catch (err) {
    reportError(err, "api/auth/reset");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
