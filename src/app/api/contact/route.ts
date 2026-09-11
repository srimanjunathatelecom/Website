import { createNotification } from "@/lib/notify";
import { checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { reportError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Public, unauthenticated form: without a cap it is a free spam relay
    // into the owner's notification feed. 5 messages per IP per 10 minutes.
    const rl = await checkRateLimit(`contact:${clientIp(req)}`, 5, 10 * 60 * 1000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

    const b = await req.json();

    // Honeypot: "website" is a visually hidden field no human ever sees.
    // Autofill bots complete every input they find, so a value here marks the
    // submission as automated. Answer with the normal success message — a
    // rejection would just tell the bot author which field to skip.
    if (String(b.website || "").trim()) {
      return Response.json({ ok: true, message: "Thanks! Our team will get back to you shortly." });
    }

    const name = String(b.name || "Customer").slice(0, 80);
    const phone = String(b.phone || "—").slice(0, 20);
    const message = String(b.message || "").slice(0, 1000);
    if (!message.trim()) return Response.json({ error: "Message is required." }, { status: 400 });
    await createNotification(
      "system",
      "New contact message",
      `From ${name} (${phone}): ${message}`,
      "/admin"
    );
    return Response.json({ ok: true, message: "Thanks! Our team will get back to you shortly." });
  } catch (err) {
    reportError(err, "api/contact");
    return Response.json({ error: "Could not send message." }, { status: 500 });
  }
}
