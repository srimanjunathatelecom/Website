import { db } from "@/db";
import { sessions, admins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

/**
 * Resolves the current admin from the httpOnly sms_session cookie.
 *
 * Earlier versions also accepted the token via an Authorization header
 * or a ?token= query param, to work around sandboxed preview iframes
 * that blocked cookies. On a real deploy those extra paths just widen
 * the attack surface (a token in a URL ends up in browser history,
 * server logs, and Referer headers) for no benefit, since cookies work
 * normally outside of a sandboxed iframe. Cookie-only, matching how
 * customer auth already works.
 */
export async function resolveAdmin(): Promise<typeof admins.$inferSelect | null> {
  let token: string | null = null;

  try {
    const store = await cookies();
    const ct = store.get("sms_session")?.value;
    if (ct) token = ct.trim();
  } catch {}

  if (!token) return null;

  const [s] = await db.select().from(sessions).where(eq(sessions.id, token));
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) return null;
  if (!s.adminId || s.role !== "admin") return null;

  const [a] = await db.select().from(admins).where(eq(admins.id, s.adminId));
  return a ?? null;
}