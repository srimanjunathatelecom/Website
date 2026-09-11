import { db } from "@/db";
import { adminOtps, admins } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // A 6-digit OTP has only 1,000,000 combinations — without a cap on
    // guesses this endpoint is brute-forceable within its 10-minute expiry.
    // Limit to 6 attempts per adminId+IP per 10 minutes.
    const body = await req.json();
    const adminId = Number(body.adminId);
    const code = String(body.code || "").trim();

    const rl = await checkRateLimit(`admin-otp:${adminId}:${clientIp(req)}`, 6, 10 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const [otp] = await db
      .select()
      .from(adminOtps)
      .where(
        and(
          eq(adminOtps.adminId, adminId),
          eq(adminOtps.code, code),
          eq(adminOtps.used, false)
        )
      )
      .orderBy(adminOtps.id);

    if (!otp) {
      return Response.json({ error: "Invalid OTP. Please try again." }, { status: 401 });
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      return Response.json({ error: "OTP expired. Please log in again." }, { status: 401 });
    }

    await db.update(adminOtps).set({ used: true }).where(eq(adminOtps.id, otp.id));
    const [a] = await db.select().from(admins).where(eq(admins.id, adminId));
    const token = await createSession({ adminId: a.id, role: "admin" });

    return Response.json({ ok: true, admin: { id: a.id, name: a.name, role: a.role }, token });
  } catch (err) {
    reportError(err, "api/admin/verify-otp");
    return Response.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}