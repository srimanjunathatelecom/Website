import { db } from "@/db";
import { notificationSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const [s] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1));
  return Response.json({ settings: s });
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const [ex] = await db.select().from(notificationSettings).where(eq(notificationSettings.id, 1));
  if (!ex) {
    await db.insert(notificationSettings).values({ id: 1, ...b });
    return Response.json({ ok: true });
  }
  await db.update(notificationSettings).set({
    email: b.email ?? ex.email,
    phone: b.phone ?? ex.phone,
    emailEnabled: b.emailEnabled !== undefined ? !!b.emailEnabled : ex.emailEnabled,
    smsEnabled: b.smsEnabled !== undefined ? !!b.smsEnabled : ex.smsEnabled,
    whatsappEnabled: b.whatsappEnabled !== undefined ? !!b.whatsappEnabled : ex.whatsappEnabled,
    newOrder: b.newOrder !== undefined ? !!b.newOrder : ex.newOrder,
    newBooking: b.newBooking !== undefined ? !!b.newBooking : ex.newBooking,
    newClaim: b.newClaim !== undefined ? !!b.newClaim : ex.newClaim,
    lowStock: b.lowStock !== undefined ? !!b.lowStock : ex.lowStock,
  }).where(eq(notificationSettings.id, 1));
  return Response.json({ ok: true });
}
