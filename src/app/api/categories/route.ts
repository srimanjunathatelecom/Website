import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { revalidateProduct } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(categories).orderBy(categories.id);
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const name = String(b.name || "").trim();
  if (!name) return Response.json({ error: "Category name required." }, { status: 400 });
  let slug = slugify(b.slug || name);
  const [dup] = await db.select().from(categories).where(eq(categories.slug, slug));
  if (dup) slug = `${slug}-${Date.now().toString(36)}`;
  const [c] = await db
    .insert(categories)
    .values({ name, slug, image: b.image || null, description: b.description || "" })
    .returning();
  revalidateProduct();
  return Response.json({ ok: true, category: c });
}
