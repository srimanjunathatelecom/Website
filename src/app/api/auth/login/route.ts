import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Max 10 attempts per 15 minutes per IP — stops brute-force/credential
    // stuffing while allowing genuine users who mistype a password.
    const rl = await checkRateLimit(`customer-login:${clientIp(req)}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const remember = body.remember !== false;

    const [c] = await db.select().from(customers).where(eq(customers.email, email));
    if (!c || !verifyPassword(password, c.passwordHash)) {
      // Per-account limit as well as per-IP, counted only on failure so that
      // normal sign-ins never consume it and nobody can lock a customer out of
      // their own account. See the admin login route for the full reasoning.
      if (email) {
        const accountRl = await checkRateLimit(`customer-login-account:${email}`, 12, 15 * 60 * 1000);
        if (!accountRl.allowed) return rateLimitedResponse(accountRl.retryAfterMs);
      }
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // "Keep me signed in" extends the session lifetime; unchecked falls back
    // to a short single-visit session instead of the default 7 days.
    await createSession({ customerId: c.id, role: "customer", days: remember ? 30 : 1 });
    return Response.json({ ok: true, customer: { id: c.id, name: c.name, email: c.email } });
  } catch (err) {
    reportError(err, "api/auth/login");
    return Response.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}