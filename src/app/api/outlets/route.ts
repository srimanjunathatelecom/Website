import { db } from "@/db";
import { outlets } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidateStorefront";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(outlets).orderBy(desc(outlets.isMain), outlets.id);
  return Response.json({ items: rows });
}

export async function PUT(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const id = Number(b.id);
  if (!id) return Response.json({ error: "Outlet id required." }, { status: 400 });
  const [ex] = await db.select().from(outlets).where(eq(outlets.id, id));
  if (!ex) return Response.json({ error: "Not found" }, { status: 404 });
  await db
    .update(outlets)
    .set({
      name: b.name ?? ex.name,
      addressLine: b.addressLine ?? ex.addressLine,
      contact: b.contact ?? ex.contact,
      email: b.email ?? ex.email,
      mapsUrl: b.mapsUrl ?? ex.mapsUrl,
      photo: b.photo !== undefined ? b.photo : ex.photo,
      isMain: b.isMain !== undefined ? !!b.isMain : ex.isMain,
      hoursOpen: b.hoursOpen ?? ex.hoursOpen,
      hoursClose: b.hoursClose ?? ex.hoursClose,
      lat: b.lat !== undefined ? b.lat : ex.lat,
      lng: b.lng !== undefined ? b.lng : ex.lng,
    })
    .where(eq(outlets.id, id));
  revalidateContent();
  return Response.json({ ok: true });
}
