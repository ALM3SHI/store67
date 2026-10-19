import "server-only";
import { and, eq, isNull, or, lt, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { serverSecret } from "@/config/env";
import { brand } from "@/config/brand";
import { sha256, hmacSha256, safeEqual } from "@/lib/crypto";
import { decryptSecret, encryptSecret, newRecoveryCodes, newTotpSecret, normalizeRecovery, otpauthUri, verifyTotp } from "@/lib/totp";

export async function twoFactorStatus(userId: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [u] = await conn
    .select({ enabledAt: schema.adminUsers.totpEnabledAt, codes: schema.adminUsers.recoveryCodes })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.id, userId));
  return { enabled: Boolean(u?.enabledAt), recoveryLeft: u?.codes.length ?? 0 };
}

/** Step 1: new secret saved (not yet active) + QR code for the authenticator app. */
export async function beginTwoFactorSetup(userId: string, email: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const secret = newTotpSecret();
  await conn
    .update(schema.adminUsers)
    .set({ totpSecret: encryptSecret(secret, serverSecret()), updatedAt: new Date() })
    .where(and(eq(schema.adminUsers.id, userId), isNull(schema.adminUsers.totpEnabledAt)));
  const uri = otpauthUri(secret, email, brand.name);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, uri, qrSvg };
}

/** Step 2: the first valid code turns 2FA on and returns the recovery codes (shown once). */
export async function confirmTwoFactorSetup(userId: string, code: string, db?: DbOrTx, now = Date.now()): Promise<string[] | null> {
  const conn = db ?? (await getDb());
  const [u] = await conn.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, userId));
  if (!u?.totpSecret || u.totpEnabledAt) return null;
  const secret = decryptSecret(u.totpSecret, serverSecret());
  if (!secret) return null;
  const step = verifyTotp(secret, code, { now });
  if (step === null) return null;
  const codes = newRecoveryCodes();
  await conn
    .update(schema.adminUsers)
    .set({ totpEnabledAt: new Date(now), totpLastStep: step, recoveryCodes: codes.map((c) => sha256(normalizeRecovery(c))), updatedAt: new Date() })
    .where(eq(schema.adminUsers.id, userId));
  return codes;
}

/**
 * Checks a 6-digit code (each code works once) or a recovery code (removed
 * after use). Returns how the user got in, or null.
 */
export async function verifySecondFactor(userId: string, code: string, db?: DbOrTx, now = Date.now()): Promise<"totp" | "recovery" | null> {
  const conn = db ?? (await getDb());
  const [u] = await conn.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, userId));
  if (!u?.totpSecret || !u.totpEnabledAt) return null;
  const clean = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(clean)) {
    const secret = decryptSecret(u.totpSecret, serverSecret());
    if (!secret) return null;
    const step = verifyTotp(secret, clean, { now, lastStep: u.totpLastStep });
    if (step === null) return null;
    // Compare-and-set so the same code can't be accepted twice concurrently.
    const [ok] = await conn
      .update(schema.adminUsers)
      .set({ totpLastStep: step })
      .where(and(eq(schema.adminUsers.id, userId), or(isNull(schema.adminUsers.totpLastStep), lt(schema.adminUsers.totpLastStep, step))))
      .returning({ id: schema.adminUsers.id });
    return ok ? "totp" : null;
  }
  const h = sha256(normalizeRecovery(clean));
  if (!u.recoveryCodes.includes(h)) return null;
  const [ok] = await conn
    .update(schema.adminUsers)
    .set({ recoveryCodes: sql`${schema.adminUsers.recoveryCodes} - ${h}` })
    .where(and(eq(schema.adminUsers.id, userId), sql`${schema.adminUsers.recoveryCodes} ? ${h}`))
    .returning({ id: schema.adminUsers.id });
  return ok ? "recovery" : null;
}

export async function disableTwoFactor(userId: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  await conn
    .update(schema.adminUsers)
    .set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [], updatedAt: new Date() })
    .where(eq(schema.adminUsers.id, userId));
}

export async function countWithoutTwoFactor(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [r] = await conn
    .select({ total: sql<number>`count(*)::int`, on: sql<number>`count(${schema.adminUsers.totpEnabledAt})::int` })
    .from(schema.adminUsers)
    .where(eq(schema.adminUsers.active, true));
  return { total: r?.total ?? 0, enabled: r?.on ?? 0 };
}

/* Pending-login ticket: after the password is right, a signed, short-lived
   cookie remembers *who* is logging in until the second factor is entered. */
export const PENDING_COOKIE = "s76_2fa";
export const PENDING_MINUTES = 5;

export function signPendingLogin(userId: string, now = Date.now()) {
  const exp = now + PENDING_MINUTES * 60_000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmacSha256(serverSecret(), `2fa-pending:${payload}`)}`;
}

export function readPendingLogin(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const [userId, exp, sig] = value.split(".");
  if (!userId || !exp || !sig) return null;
  if (!safeEqual(sig, hmacSha256(serverSecret(), `2fa-pending:${userId}.${exp}`))) return null;
  if (Number(exp) < now) return null;
  return userId;
}

