import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createSession } from "@/lib/auth";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Max 5 new accounts per hour per IP — slows down automated signup spam.
    const rl = await checkRateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");

    if (!name || !email || !password) {
      return Response.json({ error: "Name, email and password are required." }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const [existing] = await db.select().from(customers).where(eq(customers.email, email));
    if (existing) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const [c] = await db
      .insert(customers)
      .values({ name, email, phone, passwordHash: hashPassword(password) })
      .returning();

    await createSession({ customerId: c.id, role: "customer" });
    return Response.json({ ok: true, customer: { id: c.id, name: c.name, email: c.email } });
  } catch (e) {
    return Response.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}