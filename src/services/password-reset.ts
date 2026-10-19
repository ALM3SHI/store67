import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema, type DbOrTx, type Tx } from "@/lib/db";
import { env } from "@/config/env";
import { brand } from "@/config/brand";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto";
import { rateLimit } from "@/services/rate-limit";
import { audit } from "@/services/audit";
import { sendEmailLogged } from "@/services/notify";
import { renderPasswordReset } from "@/services/notify/templates";

export const RESET_MINUTES = 30;
export const MIN_PASSWORD = 12;

/**
 * Starts a reset. Always resolves the same way whether or not the email
 * exists, so the form can't be used to discover admin accounts.
 */
export async function requestPasswordReset(emailRaw: string, ip: string | null, opts: { db?: DbOrTx; now?: Date } = {}): Promise<{ limited: boolean }> {
  const conn = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  const byIp = await rateLimit(`pwreset:ip:${ip ?? "unknown"}`, 10, 3600, conn);
  const byEmail = await rateLimit(`pwreset:email:${email}`, 3, 3600, conn);
  if (!byIp.allowed || !byEmail.allowed) return { limited: true };

  const [user] = await conn.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, email));
  if (!user || !user.active) {
    await audit({ action: "auth.reset_unknown", entity: "admin_user", actorEmail: email, ip }, conn);
    return { limited: false };
  }
  // Only the newest link works.
  await conn.delete(schema.adminPasswordResets).where(eq(schema.adminPasswordResets.userId, user.id));
  const token = randomToken(32);
  await conn.insert(schema.adminPasswordResets).values({
    tokenHash: sha256(token),
    userId: user.id,
    expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000),
    ip,
  });
  const link = `${env.appUrl}/admin/reset?token=${encodeURIComponent(token)}`;
  const mail = renderPasswordReset({ name: user.name, link, minutes: RESET_MINUTES, storeName: brand.name });
  await sendEmailLogged("password_reset", user.email, mail, conn);
  await audit({ actorId: user.id, actorEmail: user.email, action: "auth.reset_requested", entity: "admin_user", entityId: user.id, ip }, conn);
  return { limited: false };
}

export async function isResetTokenValid(token: string, db?: DbOrTx, now = new Date()) {
  if (!token || token.length < 32 || token.length > 100) return false;
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select({ userId: schema.adminPasswordResets.userId })
    .from(schema.adminPasswordResets)
    .where(and(eq(schema.adminPasswordResets.tokenHash, sha256(token)), isNull(schema.adminPasswordResets.usedAt), gt(schema.adminPasswordResets.expiresAt, now)));
  return Boolean(row);
}

export type ResetResult = { ok: true; email: string } | { ok: false; reason: "invalid" | "weak" };

/** Consumes the token exactly once, sets the password and signs out every device. */
export async function resetPassword(token: string, password: string, opts: { db?: DbOrTx; now?: Date; ip?: string | null } = {}): Promise<ResetResult> {
  if (password.length < MIN_PASSWORD || password.length > 200) return { ok: false, reason: "weak" };
  if (!token || token.length < 32 || token.length > 100) return { ok: false, reason: "invalid" };
  const conn = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const passwordHash = await hashPassword(password);
  return (conn as Tx).transaction(async (tx): Promise<ResetResult> => {
    const [claimed] = await tx
      .update(schema.adminPasswordResets)
      .set({ usedAt: now })
      .where(and(eq(schema.adminPasswordResets.tokenHash, sha256(token)), isNull(schema.adminPasswordResets.usedAt), gt(schema.adminPasswordResets.expiresAt, now)))
      .returning({ userId: schema.adminPasswordResets.userId });
    if (!claimed) return { ok: false, reason: "invalid" };
    const [user] = await tx.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, claimed.userId));
    if (!user || !user.active) return { ok: false, reason: "invalid" };
    await tx.update(schema.adminUsers).set({ passwordHash, updatedAt: now }).where(eq(schema.adminUsers.id, user.id));
    await tx.delete(schema.adminSessions).where(eq(schema.adminSessions.userId, user.id));
    await tx.delete(schema.rateLimits).where(eq(schema.rateLimits.key, `pwreset:email:${user.email}`));
    await audit({ actorId: user.id, actorEmail: user.email, action: "auth.password_reset", entity: "admin_user", entityId: user.id, ip: opts.ip ?? null }, tx);
    return { ok: true, email: user.email };
  });
}
