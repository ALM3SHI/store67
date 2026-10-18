import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { cache } from "react";
import { getDb, schema } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/config/env";
import { can, type Permission, type Role } from "./permissions";

export const ADMIN_COOKIE = "s76_admin";
const SESSION_HOURS = 12;

export type AdminSession = { userId: string; email: string; name: string; role: Role };

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function createAdminSession(userId: string) {
  const token = randomToken(32);
  const db = await getDb();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.insert(schema.adminSessions).values({
    tokenHash: sha256(token),
    userId,
    expiresAt,
    ip: await clientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  // Opportunistic cleanup of expired sessions
  await db.delete(schema.adminSessions).where(lt(schema.adminSessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.adminSessions).where(eq(schema.adminSessions.tokenHash, sha256(token)));
  }
  jar.delete(ADMIN_COOKIE);
}

/** Validates the session cookie against the database (per request, memoised). */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token || token.length < 32) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: schema.adminUsers, expiresAt: schema.adminSessions.expiresAt })
    .from(schema.adminSessions)
    .innerJoin(schema.adminUsers, eq(schema.adminUsers.id, schema.adminSessions.userId))
    .where(and(eq(schema.adminSessions.tokenHash, sha256(token)), gt(schema.adminSessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.user.active) return null;
  return { userId: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role };
});

/** Use at the top of every admin page and server action. */
export async function requireAdmin(perm: Permission = "dashboard.view"): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  if (!can(s.role, perm)) redirect("/admin?denied=1");
  return s;
}

/** For route handlers: returns null instead of redirecting. */
export async function adminFromRequest(perm: Permission): Promise<AdminSession | null> {
  const s = await getAdminSession();
  return s && can(s.role, perm) ? s : null;
}
