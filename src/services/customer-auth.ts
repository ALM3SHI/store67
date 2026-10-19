import "server-only";
import { randomInt } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DbOrTx, type Tx } from "@/lib/db";
import { env, serverSecret } from "@/config/env";
import { brand } from "@/config/brand";
import { hmacSha256, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { normalizeSaudiMobile } from "@/lib/phone";
import { rateLimit } from "@/services/rate-limit";
import { emailConfigured, smsConfigured, transport } from "@/services/notify/transport";
import { renderLoginCode } from "@/services/notify/templates";
import { customerOrderLink } from "@/services/order-links";

/*
 * Customer accounts without passwords: a 6-digit code sent to the mobile (SMS)
 * or email proves ownership. Proving a mobile number also unlocks the orders
 * placed earlier as a guest with that number. Sessions are random tokens whose
 * hash is stored, like the admin sessions.
 */

export const CUSTOMER_SESSION_COOKIE = "s76_cust";
export const SESSION_DAYS = 60;
export const CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;

export type Channel = "sms" | "email";
export type Identifier = { channel: Channel; target: string };
export type Customer = typeof schema.customers.$inferSelect;

export function parseIdentifier(input: string): Identifier | null {
  const raw = input.trim();
  const phone = normalizeSaudiMobile(raw);
  if (phone) return { channel: "sms", target: phone };
  const email = raw.toLowerCase();
  if (z.email().max(200).safeParse(email).success) return { channel: "email", target: email };
  return null;
}

/** Which ways of signing in actually work right now. Locally, codes are printed in the server console. */
export function loginChannels() {
  const dev = env.appEnv !== "production";
  return { sms: smsConfigured() || dev, email: emailConfigured() || dev };
}

export const maskTarget = (id: Identifier) =>
  id.channel === "sms" ? `${id.target.replace("+966", "0").slice(0, 3)}•••••${id.target.slice(-2)}` : id.target.replace(/^(.{2})[^@]*(@.*)$/, "$1•••$2");

const codeHash = (otpId: string, code: string) => hmacSha256(serverSecret(), `customer-otp:${otpId}:${code}`);

export type CodeRequest =
  | { ok: true; otpId: string; masked: string; channel: Channel; devCode?: string }
  | { ok: false; reason: "invalid" | "channel_unavailable" | "rate_limited" | "send_failed" };

export async function requestCode(
  input: string,
  opts: { purpose: "login" | "link"; customerId?: string; ip: string; locale: "ar" | "en"; db?: DbOrTx },
): Promise<CodeRequest> {
  const id = parseIdentifier(input);
  if (!id) return { ok: false, reason: "invalid" };
  if (!loginChannels()[id.channel]) return { ok: false, reason: "channel_unavailable" };
  const conn = opts.db ?? (await getDb());
  const a = await rateLimit(`otp:target:${id.target}`, 3, 600, conn);
  const b = await rateLimit(`otp:ip:${opts.ip}`, 12, 3600, conn);
  if (!a.allowed || !b.allowed) return { ok: false, reason: "rate_limited" };

  // Only the newest code for a target works.
  await conn
    .update(schema.customerOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(schema.customerOtps.target, id.target), eq(schema.customerOtps.purpose, opts.purpose), isNull(schema.customerOtps.consumedAt)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [row] = await conn
    .insert(schema.customerOtps)
    .values({ channel: id.channel, target: id.target, purpose: opts.purpose, customerId: opts.customerId ?? null, codeHash: "pending", expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) })
    .returning({ id: schema.customerOtps.id });
  await conn.update(schema.customerOtps).set({ codeHash: codeHash(row!.id, code) }).where(eq(schema.customerOtps.id, row!.id));

  const msg = renderLoginCode({ locale: opts.locale, code, minutes: CODE_MINUTES, storeName: brand.name });
  const sent = id.channel === "sms" ? await transport.sms(id.target, msg.sms) : await transport.email({ to: id.target, subject: msg.subject, html: msg.html, text: msg.text });
  // In development without a provider the code is printed to the console; treat as sent.
  if (!sent.ok && !(sent.skipped && env.appEnv !== "production")) return { ok: false, reason: "send_failed" };
  // Development without an SMS/email provider: show the code on screen (never in production).
  const devCode = !sent.ok && env.appEnv !== "production" ? code : undefined;
  return { ok: true, otpId: row!.id, masked: maskTarget(id), channel: id.channel, devCode };
}

export type VerifyResult = { ok: true; identifier: Identifier; purpose: string; customerId: string | null } | { ok: false; reason: "invalid" | "expired" | "too_many" };

export async function verifyCode(otpId: string, code: string, db?: DbOrTx): Promise<VerifyResult> {
  if (!z.uuid().safeParse(otpId).success || !/^\d{6}$/.test(code.trim())) return { ok: false, reason: "invalid" };
  const conn = db ?? (await getDb());
  const [otp] = await conn.select().from(schema.customerOtps).where(eq(schema.customerOtps.id, otpId));
  if (!otp || otp.consumedAt) return { ok: false, reason: "expired" };
  if (otp.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" };
  const [counted] = await conn
    .update(schema.customerOtps)
    .set({ attempts: sql`${schema.customerOtps.attempts} + 1` })
    .where(and(eq(schema.customerOtps.id, otpId), isNull(schema.customerOtps.consumedAt)))
    .returning({ attempts: schema.customerOtps.attempts });
  if (!counted) return { ok: false, reason: "expired" };
  if (!safeEqual(otp.codeHash, codeHash(otpId, code.trim()))) return { ok: false, reason: counted.attempts >= MAX_ATTEMPTS ? "too_many" : "invalid" };
  const [consumed] = await conn
    .update(schema.customerOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(schema.customerOtps.id, otpId), isNull(schema.customerOtps.consumedAt)))
    .returning({ id: schema.customerOtps.id });
  if (!consumed) return { ok: false, reason: "expired" };
  return { ok: true, identifier: { channel: otp.channel as Channel, target: otp.target }, purpose: otp.purpose, customerId: otp.customerId };
}

const isAccount = (c: Customer) => Boolean(c.phoneVerifiedAt || c.emailVerifiedAt);

/** Finds (or creates) the customer for a verified identifier and marks it verified. */
export async function customerForVerified(id: Identifier, db?: DbOrTx): Promise<Customer> {
  const conn = db ?? (await getDb());
  const now = new Date();
  return (conn as Tx).transaction(async (tx) => {
    if (id.channel === "sms") {
      const [c] = await tx
        .insert(schema.customers)
        .values({ phone: id.target, name: "", phoneVerifiedAt: now })
        .onConflictDoUpdate({ target: schema.customers.phone, set: { phoneVerifiedAt: sql`coalesce(${schema.customers.phoneVerifiedAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now } })
        .returning();
      return c!;
    }
    const [verified] = await tx
      .select()
      .from(schema.customers)
      .where(and(sql`lower(${schema.customers.email}) = ${id.target}`, sql`${schema.customers.emailVerifiedAt} is not null`))
      .limit(1);
    if (verified) return verified;
    // A single guest record that used this email at checkout becomes the account.
    const guests = await tx.select().from(schema.customers).where(sql`lower(${schema.customers.email}) = ${id.target}`).limit(2);
    if (guests.length === 1 && !isAccount(guests[0]!)) {
      const [c] = await tx.update(schema.customers).set({ emailVerifiedAt: now, email: id.target, updatedAt: now }).where(eq(schema.customers.id, guests[0]!.id)).returning();
      return c!;
    }
    const [c] = await tx.insert(schema.customers).values({ name: "", email: id.target, emailVerifiedAt: now }).returning();
    return c!;
  });
}

export type LinkResult = { ok: true } | { ok: false; reason: "taken" };

/**
 * Adds a verified mobile/email to an existing account. A guest record that
 * owns the same mobile (orders placed before signing up) is merged in.
 */
export async function linkIdentifier(customerId: string, id: Identifier, db?: DbOrTx): Promise<LinkResult> {
  const conn = db ?? (await getDb());
  const now = new Date();
  return (conn as Tx).transaction(async (tx): Promise<LinkResult> => {
    if (id.channel === "sms") {
      const [other] = await tx.select().from(schema.customers).where(eq(schema.customers.phone, id.target));
      if (other && other.id !== customerId) {
        if (isAccount(other)) return { ok: false, reason: "taken" };
        await tx.update(schema.orders).set({ customerId }).where(eq(schema.orders.customerId, other.id));
        await tx.delete(schema.customers).where(eq(schema.customers.id, other.id));
      }
      await tx.update(schema.customers).set({ phone: id.target, phoneVerifiedAt: now, updatedAt: now }).where(eq(schema.customers.id, customerId));
      return { ok: true };
    }
    const [other] = await tx
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(and(sql`lower(${schema.customers.email}) = ${id.target}`, sql`${schema.customers.emailVerifiedAt} is not null`));
    if (other && other.id !== customerId) return { ok: false, reason: "taken" };
    await tx.update(schema.customers).set({ email: id.target, emailVerifiedAt: now, updatedAt: now }).where(eq(schema.customers.id, customerId));
    return { ok: true };
  });
}

export async function startSession(customerId: string) {
  const token = randomToken(32);
  const db = await getDb();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.customerSessions).values({ tokenHash: sha256(token), customerId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 300) ?? null });
  await db.update(schema.customers).set({ lastLoginAt: new Date() }).where(eq(schema.customers.id, customerId));
  (await cookies()).set(CUSTOMER_SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/", expires: expiresAt });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) await (await getDb()).delete(schema.customerSessions).where(eq(schema.customerSessions.tokenHash, sha256(token)));
  jar.delete(CUSTOMER_SESSION_COOKIE);
}

/** The signed-in customer for this request, or null. */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token || token.length < 32) return null;
  const db = await getDb();
  const [row] = await db
    .select({ c: schema.customers })
    .from(schema.customerSessions)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.customerSessions.customerId))
    .where(and(eq(schema.customerSessions.tokenHash, sha256(token)), gt(schema.customerSessions.expiresAt, new Date())))
    .limit(1);
  return row?.c ?? null;
});

/** Orders that belong to the account: linked to it, or placed with its verified mobile/email. */
export async function accountOrders(c: Customer, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const conds = [eq(schema.orders.customerId, c.id)];
  if (c.phone && c.phoneVerifiedAt) conds.push(eq(schema.orders.phone, c.phone));
  if (c.email && c.emailVerifiedAt) conds.push(sql`lower(${schema.orders.email}) = ${c.email.toLowerCase()}`);
  const orders = await conn.select().from(schema.orders).where(or(...conds)).orderBy(desc(schema.orders.createdAt)).limit(100);
  const ids = orders.map((o) => o.id);
  const counts = ids.length
    ? await conn
        .select({ orderId: schema.orderItems.orderId, n: sql<number>`sum(${schema.orderItems.quantity})::int` })
        .from(schema.orderItems)
        .where(sql`${schema.orderItems.orderId} in (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`)
        .groupBy(schema.orderItems.orderId)
    : [];
  return orders.map((o) => ({
    id: o.id,
    number: o.number,
    createdAt: o.createdAt,
    status: o.status,
    paymentStatus: o.paymentStatus,
    totalHalalas: o.totalHalalas,
    items: counts.find((x) => x.orderId === o.id)?.n ?? 0,
    link: customerOrderLink(o),
  }));
}

/**
 * Deletes the account (personal data law: the customer can ask for it). Orders
 * are kept for accounting but no longer linked; addresses, wishlist and
 * sessions go with the account.
 */
export async function deleteAccount(customerId: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  await conn.delete(schema.customers).where(eq(schema.customers.id, customerId));
}
