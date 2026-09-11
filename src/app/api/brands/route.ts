import { db } from "@/db";
import { brands } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { slugify } from "@/lib/format";
import { revalidateHomepage } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const allBrands = await db.select().from(brands).orderBy(desc(brands.sortOrder));
    return Response.json(allBrands);
  } catch (e) {
    return Response.json({ error: "Failed to load brands." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return Response.json({ error: "Brand name is required." }, { status: 400 });

    const slug = slugify(name);
    
    const [b] = await db.insert(brands).values({
      name,
      slug,
      bgColor: body.bgColor || "#f8fafc",
      label: body.label || "",
      logoUrl: body.logoUrl || "",
      active: body.active !== false,
      sortOrder: Number(body.sortOrder || 0),
    }).returning();

    revalidateHomepage();
    return Response.json({ ok: true, brand: b });
  } catch (e) {
    return Response.json({ error: "Could not save brand." }, { status: 500 });
  }
}