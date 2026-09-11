import { NextResponse } from "next/server";
import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { revalidateHomepage } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = Number((await params).id);
    const body = await req.json();
    const [existing] = await db.select().from(brands).where(eq(brands.id, id));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const name = body.name !== undefined ? String(body.name || "").trim() : existing.name;
    if (!name) return NextResponse.json({ error: "Brand name is required." }, { status: 400 });

    await db.update(brands).set({
      name,
      slug: body.name !== undefined ? slugify(name) : existing.slug,
      bgColor: body.bgColor ?? existing.bgColor,
      label: body.label !== undefined ? body.label : existing.label,
      logoUrl: body.logoUrl !== undefined ? body.logoUrl : existing.logoUrl,
      active: body.active !== undefined ? !!body.active : existing.active,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : existing.sortOrder,
    }).where(eq(brands.id, id));

    revalidateHomepage();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Brand update failed:", error);
    return NextResponse.json({ error: "Could not update this brand." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = Number((await params).id);
    await db.delete(brands).where(eq(brands.id, id));
    revalidateHomepage();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Brand delete failed:", error);
    return NextResponse.json({ error: "Could not delete this brand." }, { status: 500 });
  }
}