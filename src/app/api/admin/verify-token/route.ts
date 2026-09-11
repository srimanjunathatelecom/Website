import { db } from "@/db";
import { sessions, admins } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body.token || "").trim();
    if (!token) return Response.json({ error: "No token provided" }, { status: 400 });

    const [s] = await db.select().from(sessions).where(eq(sessions.id, token));
    if (!s) return Response.json({ error: "Session invalid or removed" }, { status: 401 });
    if (s.expiresAt.getTime() < Date.now()) {
      return Response.json({ error: "Session expired" }, { status: 401 });
    }

    if (!s.adminId) return Response.json({ error: "Not an admin session" }, { status: 401 });
    const [a] = await db.select().from(admins).where(eq(admins.id, s.adminId));
    if (!a) return Response.json({ error: "Admin user not found" }, { status: 404 });

    return Response.json({
      ok: true,
      admin: {
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
      },
    });
  } catch (e) {
    return Response.json({ error: "Token verification failed" }, { status: 500 });
  }
}
