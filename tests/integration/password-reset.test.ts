import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { requestPasswordReset, resetPassword, isResetTokenValid } from "@/services/password-reset";
import { transport } from "@/services/notify/transport";

let db: Db;
let userId: string;

beforeAll(async () => {
  db = await getDb();
  const [u] = await db
    .insert(schema.adminUsers)
    .values({ email: "reset-owner@example.com", name: "Owner", role: "owner", passwordHash: await hashPassword("old-password-123") })
    .returning();
  userId = u!.id;
});
afterEach(() => vi.restoreAllMocks());

function captureLink() {
  const sent: { to: string; text: string }[] = [];
  vi.spyOn(transport, "email").mockImplementation(async (m) => {
    sent.push(m);
    return { ok: true };
  });
  const token = () => {
    const m = /token=([A-Za-z0-9_-]+)/.exec(sent.at(-1)?.text ?? "");
    return m ? decodeURIComponent(m[1]!) : "";
  };
  return { sent, token };
}

describe("admin password reset", () => {
  it("emails a one-time link that sets a new password and signs out every session", async () => {
    const { sent, token } = captureLink();
    await db.insert(schema.adminSessions).values({ tokenHash: "h_reset_1", userId, expiresAt: new Date(Date.now() + 3600_000) });
    await requestPasswordReset("Reset-Owner@example.com", "1.1.1.1", { db });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("reset-owner@example.com");
    const t = token();
    expect(await isResetTokenValid(t, db)).toBe(true);

    expect(await resetPassword(t, "short", { db })).toEqual({ ok: false, reason: "weak" });
    expect(await resetPassword(t, "a-brand-new-password", { db })).toMatchObject({ ok: true });
    const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, userId));
    expect(await verifyPassword("a-brand-new-password", u!.passwordHash)).toBe(true);
    expect(await db.select().from(schema.adminSessions).where(eq(schema.adminSessions.userId, userId))).toHaveLength(0);
    // single use
    expect(await resetPassword(t, "another-password-1", { db })).toEqual({ ok: false, reason: "invalid" });
  });

  it("expires after 30 minutes and only the newest link works", async () => {
    const { token } = captureLink();
    await requestPasswordReset("reset-owner@example.com", "2.2.2.2", { db });
    const first = token();
    await requestPasswordReset("reset-owner@example.com", "2.2.2.2", { db });
    const second = token();
    expect(await isResetTokenValid(first, db)).toBe(false);
    const later = new Date(Date.now() + 31 * 60_000);
    expect(await resetPassword(second, "a-brand-new-password-2", { db, now: later })).toEqual({ ok: false, reason: "invalid" });
  });

  it("does not reveal unknown or disabled accounts and rate-limits per email", async () => {
    const { sent } = captureLink();
    expect(await requestPasswordReset("nobody@example.com", "3.3.3.3", { db })).toEqual({ limited: false });
    expect(sent).toHaveLength(0);
    // the second test already used 2 of the 3 hourly requests for this address
    await requestPasswordReset("reset-owner@example.com", "4.4.4.4", { db });
    expect(await requestPasswordReset("reset-owner@example.com", "4.4.4.4", { db })).toEqual({ limited: true });
  });

  it("rejects garbage tokens", async () => {
    expect(await isResetTokenValid("x", db)).toBe(false);
    expect(await resetPassword("x".repeat(40), "a-brand-new-password", { db })).toEqual({ ok: false, reason: "invalid" });
  });
});
