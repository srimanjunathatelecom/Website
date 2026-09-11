import { createHash, randomBytes } from "crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { customers, passwordResets } from "@/db/schema";
import { siteUrl } from "@/lib/env";
import { sendCustomerEmail } from "@/lib/notify";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Step one of password recovery: the customer submits their email and, if an
 * account exists, receives a single-use reset link valid for 30 minutes.
 *
 * The response is `{ ok: true }` whether or not the account exists. Anything
 * else turns this endpoint into a free email-enumeration oracle — an attacker
 * could confirm which addresses have accounts here before trying credential
 * stuffing on the login route.
 *
 * Only the SHA-256 hash of the token is stored. The raw token travels in the
 * email link and nowhere else, so a leaked database dump or a curious pair of
 * eyes on a DB console never yields a working reset URL.
 */
export async function POST(req: Request) {
  try {
    // Per-IP: 5 requests per 15 minutes — a reset email is a rare action for
    // a genuine user, and each request can trigger an outbound email.
    const rl = await checkRateLimit(`forgot:${clientIp(req)}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Per-address: 3 per hour regardless of requesting IP, so a distributed
    // caller can't flood one inbox with reset mail.
    const emailRl = await checkRateLimit(`forgot-email:${email}`, 3, 60 * 60 * 1000);
    if (!emailRl.allowed) return rateLimitedResponse(emailRl.retryAfterMs);

    const [c] = await db.select().from(customers).where(eq(customers.email, email));

    if (c) {
      // A fresh request supersedes any outstanding link: expire unused tokens
      // for this customer instead of leaving several live ones in flight.
      await db
        .update(passwordResets)
        .set({ expiresAt: new Date() })
        .where(and(eq(passwordResets.customerId, c.id), isNull(passwordResets.usedAt)));

      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.insert(passwordResets).values({
        customerId: c.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      const link = `${siteUrl}/reset-password?token=${token}`;
      await sendCustomerEmail(
        c.email,
        "Reset your password",
        `Hi ${c.name},\n\n` +
          `We received a request to reset the password for your SMS Stores account.\n\n` +
          `Reset it here (link valid for 30 minutes, one use):\n${link}\n\n` +
          `If you didn't request this, you can safely ignore this email — your password has not changed.`
      );
    }

    // Opportunistic housekeeping: clear long-expired rows so the table stays
    // small without a dedicated cron.
    void db
      .delete(passwordResets)
      .where(lt(passwordResets.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .catch(() => {});

    // Same answer for known and unknown addresses — see the note above.
    return Response.json({ ok: true });
  } catch (err) {
    reportError(err, "api/auth/forgot");
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
