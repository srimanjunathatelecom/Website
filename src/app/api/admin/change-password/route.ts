import { db } from "@/db";
import { admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentAdmin, hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json();
  const currentPassword = String(b.currentPassword || "");
  const newPassword = String(b.newPassword || "");

  if (!verifyPassword(currentPassword, admin.passwordHash)) {
    return Response.json({ error: "Current password is incorrect." }, { status: 401 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  await db.update(admins).set({ passwordHash: hashPassword(newPassword) }).where(eq(admins.id, admin.id));
  return Response.json({ ok: true });
}