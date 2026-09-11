import { db } from "@/db";
import { deliveryPincodes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pin = searchParams.get("pin");

  // Admin management view: GET /api/pincodes (no ?pin=) while logged in as
  // admin returns the full list instead of doing a single-pincode
  // customer-facing check.
  if (!pin) {
    const admin = await getCurrentAdmin();
    if (!admin) return Response.json({ error: "Invalid pincode" }, { status: 400 });
    const rows = await db.select().from(deliveryPincodes).orderBy(asc(deliveryPincodes.pincode));
    return Response.json({ items: rows });
  }

  if (pin.length !== 6) {
    return Response.json({ error: "Invalid pincode" }, { status: 400 });
  }

  try {
    const [result] = await db
      .select()
      .from(deliveryPincodes)
      .where(eq(deliveryPincodes.pincode, pin));

    // No fallback: an unknown pincode means delivery availability hasn't
    // been configured for it, not that delivery is assumed available.
    // Fabricating "deliverable: true, 4 days, COD available" for a pincode
    // the shopkeeper never entered risks promising delivery that can't
    // actually be fulfilled.
    if (!result) {
      return Response.json({
        deliverable: false,
        unconfirmed: true,
        message: "We haven't confirmed delivery for this pincode yet. Please call the store to check availability.",
      });
    }

    // Pincode exists but is explicitly marked non-deliverable — respect that.
    if (!result.isDeliverable) {
      return Response.json({
        deliverable: false,
        message: "Sorry, we currently don't deliver to this pincode.",
      });
    }

    // IF FOUND IN DATABASE: Format a nice dynamic message based on estimatedDays
    let message = `Delivery in ${result.estimatedDays} day${result.estimatedDays > 1 ? 's' : ''}.`;
    if (result.estimatedDays === 0) {
      message = "Same Day Delivery available in this zone!";
    } else if (result.estimatedDays === 1) {
      message = "Next Day Delivery available!";
    }

    if (result.codAvailable) {
      message += " Cash on Delivery available.";
    }

    // Delivery pricing comes straight from what the admin configured for this
    // pincode. Both default to 0, which means free delivery — the PDP only
    // shows a charge when one has actually been entered, so no fee or
    // threshold is ever invented.
    const charge = Number(result.deliveryCharge) || 0;
    const freeAbove = Number(result.freeDeliveryAbove) || 0;

    // The expected arrival date, derived from the configured lead time. Sent
    // as an ISO date so the browser can format it in the shopper's locale
    // rather than the server guessing one.
    const eta = new Date();
    eta.setDate(eta.getDate() + result.estimatedDays);

    return Response.json({
      deliverable: true,
      days: result.estimatedDays,
      cod: result.codAvailable,
      city: result.city,
      state: result.state,
      deliveryCharge: charge,
      freeDeliveryAbove: freeAbove,
      estimatedDate: eta.toISOString(),
      message,
    });
  } catch (error) {
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}

// ---- Admin CRUD (add/edit/remove deliverable pincodes) ----

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const pincode = String(b.pincode || "").trim();
  if (!/^\d{6}$/.test(pincode)) {
    return Response.json({ error: "Enter a valid 6-digit pincode." }, { status: 400 });
  }
  const [existing] = await db.select().from(deliveryPincodes).where(eq(deliveryPincodes.pincode, pincode));
  if (existing) {
    return Response.json({ error: "This pincode is already configured. Edit it instead." }, { status: 409 });
  }
  const [row] = await db
    .insert(deliveryPincodes)
    .values({
      pincode,
      city: String(b.city || "Bengaluru"),
      state: String(b.state || "Karnataka"),
      estimatedDays: Number.isFinite(Number(b.estimatedDays)) ? Number(b.estimatedDays) : 1,
      isDeliverable: b.isDeliverable !== false,
      codAvailable: b.codAvailable !== false,
      deliveryCharge: String(Math.max(0, Number(b.deliveryCharge) || 0)),
      freeDeliveryAbove: String(Math.max(0, Number(b.freeDeliveryAbove) || 0)),
    })
    .returning();
  return Response.json({ ok: true, item: row });
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Pincode id required." }, { status: 400 });
  const [existing] = await db.select().from(deliveryPincodes).where(eq(deliveryPincodes.id, id));
  if (!existing) return Response.json({ error: "Not found." }, { status: 404 });

  await db
    .update(deliveryPincodes)
    .set({
      city: b.city != null ? String(b.city) : existing.city,
      state: b.state != null ? String(b.state) : existing.state,
      estimatedDays: b.estimatedDays != null ? Number(b.estimatedDays) : existing.estimatedDays,
      isDeliverable: b.isDeliverable != null ? !!b.isDeliverable : existing.isDeliverable,
      codAvailable: b.codAvailable != null ? !!b.codAvailable : existing.codAvailable,
      deliveryCharge:
        b.deliveryCharge != null ? String(Math.max(0, Number(b.deliveryCharge) || 0)) : existing.deliveryCharge,
      freeDeliveryAbove:
        b.freeDeliveryAbove != null ? String(Math.max(0, Number(b.freeDeliveryAbove) || 0)) : existing.freeDeliveryAbove,
    })
    .where(eq(deliveryPincodes.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Pincode id required." }, { status: 400 });
  await db.delete(deliveryPincodes).where(eq(deliveryPincodes.id, id));
  return Response.json({ ok: true });
}