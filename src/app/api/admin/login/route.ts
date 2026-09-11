import { db } from "@/db";
import { admins, adminOtps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomInt } from "crypto";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse, refundRateLimit } from "@/lib/rateLimit";
import { sendAdminOtpEmail } from "@/lib/notify";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Max 8 attempts per 15 minutes per IP — stops brute-force/credential
    // stuffing against admin accounts while still allowing genuine retries.
    // Successful logins refund their slot below, so only failures spend the
    // budget — a whole team behind one office NAT can't lock itself out by
    // signing in normally.
    const ipKey = `admin-login:${clientIp(req)}`;
    const rl = await checkRateLimit(ipKey, 8, 15 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const [a] = await db.select().from(admins).where(eq(admins.email, email));
    const isValid = !!a && verifyPassword(password, a.passwordHash);

    if (!a || !isValid) {
      // Second limit, keyed on the account rather than the caller, and counted
      // only on failure.
      //
      // The IP limit above is only as good as TRUSTED_PROXY_HOPS matching the
      // real deployment. Get it wrong, or sit behind a proxy that doesn't
      // append, and an attacker rotating X-Forwarded-For gets a fresh IP bucket
      // per request. This limit doesn't care where the request came from: ten
      // wrong passwords for one account in fifteen minutes is the ceiling
      // however the attempts are spread.
      //
      // Counted here, on the failure path, rather than before the password
      // check, for two reasons. A legitimate admin signing in repeatedly never
      // consumes the budget. And because a correct password is verified before
      // this runs, an attacker cannot lock the real admin out by burning the
      // account's attempts — the usual cost of per-account limiting, avoided.
      if (email) {
        const accountRl = await checkRateLimit(`admin-login-account:${email}`, 10, 15 * 60 * 1000);
        if (!accountRl.allowed) return rateLimitedResponse(accountRl.retryAfterMs);
      }
      return Response.json({ error: "Invalid admin email or password." }, { status: 401 });
    }

    // Correct password — hand the IP slot back (see comment on the check).
    await refundRateLimit(ipKey);

    const adminMeta = { id: a.id, name: a.name, email: a.email, role: a.role };
    const hasSmtp = !!process.env.SMTP_HOST;

    if (!hasSmtp) {
      const token = await createSession({ adminId: a.id, role: "admin" });
      return Response.json({ ok: true, requireOtp: false, token, admin: adminMeta });
    }

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(adminOtps).values({ adminId: a.id, code, expiresAt });

    const sent = await sendAdminOtpEmail(a.email, code);
    if (!sent) {
      // Don't leave the admin stuck on a code they can never receive.
      return Response.json(
        { error: "Couldn't send the login code email. Please try again or contact support." },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, requireOtp: true, adminId: a.id, name: a.name });
  } catch (err) {
    // No email in the context: this is the admin login path and the report
    // travels to a log collector.
    reportError(err, "api/admin/login");
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}