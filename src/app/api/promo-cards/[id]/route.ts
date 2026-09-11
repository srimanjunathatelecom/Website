import { NextResponse } from "next/server";
import { db } from "@/db";
import { promoCards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateHomepage } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = Number((await params).id);
    const body = await req.json();
    const [existing] = await db.select().from(promoCards).where(eq(promoCards.id, id));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const title = body.title !== undefined ? String(body.title || "").trim() : existing.title;
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });

    await db.update(promoCards).set({
      title,
      subtitle: body.subtitle !== undefined ? body.subtitle : existing.subtitle,
      description: body.description !== undefined ? body.description : existing.description,
      icon: body.icon !== undefined ? body.icon : existing.icon,
      themeColor: body.themeColor ?? existing.themeColor,
      active: body.active !== undefined ? !!body.active : existing.active,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : existing.sortOrder,
    }).where(eq(promoCards.id, id));

    revalidateHomepage();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Promo card update failed:", error);
    return NextResponse.json({ error: "Could not update this promo card." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = Number((await params).id);
    await db.delete(promoCards).where(eq(promoCards.id, id));
    revalidateHomepage();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Promo card delete failed:", error);
    return NextResponse.json({ error: "Could not delete this promo card." }, { status: 500 });
  }
}