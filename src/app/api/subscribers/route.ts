import { db } from "@/db";
import { subscribers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Public newsletter box on every page. Unthrottled it lets anyone
    // stuff the subscriber list, which is both junk data and a way to use
    // the store as a mailing-list bomb. 5 per IP per 10 minutes.
    const rl = await checkRateLimit(`subscribe:${clientIp(req)}`, 5, 10 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const b = await req.json();

    // Honeypot — see /api/contact. A filled hidden field means a bot; answer
    // success and store nothing.
    if (String(b.website || "").trim()) {
      return Response.json({ ok: true, message: "Subscribed! Watch for our best offers." });
    }

    const email = String(b.email || "").trim();
    const phone = String(b.phone || "").trim();
    const channel = String(b.channel || (email ? "email" : "whatsapp"));
    if (!email && !phone) {
      return Response.json({ error: "Please provide an email or WhatsApp number." }, { status: 400 });
    }
    const [ex] = await db
      .select()
      .from(subscribers)
      .where(email ? eqEmail(email) : eqPhone(phone));
    if (ex) {
      return Response.json({ ok: true, message: "You're already subscribed. We'll be in touch!" });
    }
    await db.insert(subscribers).values({ email, phone, channel });
    return Response.json({ ok: true, message: "Subscribed! Watch for our best offers." });
  } catch (err) {
    reportError(err, "api/subscribers");
    return Response.json({ error: "Could not subscribe. Please try again." }, { status: 500 });
  }
}

function eqEmail(e: string) {
  return eq(subscribers.email, e);
}
function eqPhone(p: string) {
  return eq(subscribers.phone, p);
}
