import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessions, admins, customers } from "@/db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "sms_session";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const h = scryptSync(pw, salt, 64);
  const hb = Buffer.from(hash, "hex");
  return hb.length === h.length && timingSafeEqual(h, hb);
}

export async function createSession(opts: {
  customerId?: number;
  adminId?: number;
  role: string;
  days?: number;
}): Promise<string> {
  const token = randomUUID();
  const expires = new Date(Date.now() + (opts.days ?? 7) * 86400000);
  await db.insert(sessions).values({
    id: token,
    customerId: opts.customerId ?? null,
    adminId: opts.adminId ?? null,
    role: opts.role,
    expiresAt: expires,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return token;
}

export async function getSession() {
  // Try cookie first
  const store = await cookies();
  let token: string | null = store.get(SESSION_COOKIE)?.value || null;

  // Try Bearer header (for admin iframe auth)
  if (!token) {
    try {
      const h = await headers();
      const auth = (h.get("authorization") || "").trim();
      const m = /^Bearer\s+(.+)$/i.exec(auth);
      if (m && m[1]) token = m[1].trim();
    } catch {}
  }

  if (!token) return null;
  const [s] = await db.select().from(sessions).where(eq(sessions.id, token));
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    // Expired — clean it up instead of leaving a dead row behind.
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }
  return s;
}

export async function getCurrentAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin" || !s.adminId) return null;
  const [a] = await db.select().from(admins).where(eq(admins.id, s.adminId));
  return a ?? null;
}

export async function getCurrentCustomer() {
  const s = await getSession();
  if (!s || !s.customerId) return null;
  const [c] = await db.select().from(customers).where(eq(customers.id, s.customerId));
  return c ?? null;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  store.delete(SESSION_COOKIE);
}