import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  return Response.json({ settings: s });
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const [ex] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (!ex) return Response.json({ error: "Settings missing." }, { status: 404 });

  await db
    .update(storeSettings)
    .set({
      brandName: b.brandName ?? ex.brandName,
      legalName: b.legalName ?? ex.legalName,
      logoUrl: b.logoUrl !== undefined ? b.logoUrl : ex.logoUrl,
      tagline: b.tagline ?? ex.tagline,
      taglineAlt: b.taglineAlt ?? ex.taglineAlt,
      gstin: b.gstin ?? ex.gstin,
      pan: b.pan ?? ex.pan,
      state: b.state ?? ex.state,
      stateCode: b.stateCode ?? ex.stateCode,
      placeOfSupply: b.placeOfSupply ?? ex.placeOfSupply,
      whatsappNumber: b.whatsappNumber ?? ex.whatsappNumber,
      supportEmail: b.supportEmail ?? ex.supportEmail,
      supportPhone: b.supportPhone ?? ex.supportPhone,
      gaId: b.gaId !== undefined ? b.gaId : ex.gaId,
      promoVideoUrl: b.promoVideoUrl !== undefined ? b.promoVideoUrl : ex.promoVideoUrl,
      promoVideoHeading: b.promoVideoHeading !== undefined ? b.promoVideoHeading : ex.promoVideoHeading,
      promoVideoSubtext: b.promoVideoSubtext !== undefined ? b.promoVideoSubtext : ex.promoVideoSubtext,
    })
    .where(eq(storeSettings.id, 1));

  return Response.json({ ok: true });
}