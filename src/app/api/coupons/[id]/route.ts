import { db } from "@/db";
import { coupons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { couponLimitsFromBody } from "@/lib/coupon";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const b = await req.json();
  const [existing] = await db.select().from(coupons).where(eq(coupons.id, id));
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const code = b.code != null ? String(b.code).trim().toUpperCase() : existing.code;
  if (!code) return Response.json({ error: "Coupon code required." }, { status: 400 });

  await db
    .update(coupons)
    .set({
      code,
      type: b.type === "fixed" ? "fixed" : b.type === "percent" ? "percent" : existing.type,
      value: b.value != null ? String(b.value) : existing.value,
      minOrder: b.minOrder != null ? String(b.minOrder) : existing.minOrder,
      active: b.active != null ? !!b.active : existing.active,
      // The editor always submits all three limit fields, and an empty field
      // legitimately means "remove this limit" — so these are set from the
      // body rather than falling back to the existing value, which would make
      // a limit impossible to clear once set.
      ...couponLimitsFromBody(b),
    })
    .where(eq(coupons.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await db.delete(coupons).where(eq(coupons.id, Number((await params).id)));
  return Response.json({ ok: true });
}