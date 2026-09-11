import { db } from "@/db";
import { contentPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (slug) {
    const [c] = await db.select().from(contentPages).where(eq(contentPages.slug, slug));
    return Response.json({ page: c });
  }
  const rows = await db.select().from(contentPages).orderBy(contentPages.slug);
  return Response.json({ items: rows });
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const slug = String(b.slug || "").trim();
  if (!slug) return Response.json({ error: "Slug required." }, { status: 400 });
  const [ex] = await db.select().from(contentPages).where(eq(contentPages.slug, slug));
  if (ex) {
    await db
      .update(contentPages)
      .set({ title: String(b.title ?? ex.title), body: String(b.body ?? ex.body), updatedAt: new Date() })
      .where(eq(contentPages.slug, slug));
  } else {
    await db.insert(contentPages).values({
      slug,
      title: String(b.title ?? slug),
      body: String(b.body ?? ""),
    });
  }
  revalidateContent();
  return Response.json({ ok: true });
}
