import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { revalidateProduct } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

// UPDATE A CATEGORY
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  const b = await req.json();

  const [existing] = await db.select().from(categories).where(eq(categories.id, id));
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  let slug = existing.slug;
  if (b.slug && b.slug !== existing.slug) {
    slug = slugify(b.slug);
    // Ensure the new slug doesn't collide with another category
    const [dup] = await db.select().from(categories).where(eq(categories.slug, slug));
    if (dup && dup.id !== id) slug = `${slug}-${id}`;
  }

  await db
    .update(categories)
    .set({
      name: b.name ?? existing.name,
      slug,
      image: b.image !== undefined ? b.image : existing.image,
      description: b.description ?? existing.description,
    })
    .where(eq(categories.id, id));

  revalidateProduct();
  return Response.json({ ok: true });
}

// DELETE A CATEGORY
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await db.delete(categories).where(eq(categories.id, Number((await params).id)));
  revalidateProduct();
  return Response.json({ ok: true });
}