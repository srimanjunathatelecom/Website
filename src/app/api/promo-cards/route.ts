import { db } from "@/db";
import { promoCards } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { revalidateHomepage } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const cards = await db.select().from(promoCards).orderBy(desc(promoCards.sortOrder));
    return Response.json(cards);
  } catch (e) {
    return Response.json({ error: "Failed to load promo cards." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) return Response.json({ error: "Title is required." }, { status: 400 });

    const [c] = await db.insert(promoCards).values({
      title,
      subtitle: body.subtitle || "",
      description: body.description || "",
      icon: body.icon || "",
      themeColor: body.themeColor || "blue-400",
      active: body.active !== false,
      sortOrder: Number(body.sortOrder || 0),
    }).returning();

    revalidateHomepage();
    return Response.json({ ok: true, promoCard: c });
  } catch (e) {
    return Response.json({ error: "Could not save promo card." }, { status: 500 });
  }
}