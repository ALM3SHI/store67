import "server-only";
import { desc, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { env, serverSecret } from "@/config/env";
import { brand } from "@/config/brand";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { rateLimit } from "@/services/rate-limit";
import { getSettings } from "@/services/settings";
import { sendEmailLogged } from "@/services/notify";
import { renderOrdersLink } from "@/services/notify/templates";
import { customerOrderLink } from "@/services/order-links";

/*
 * Passwordless "My orders": a signed link (30 min) emailed to the address used
 * at checkout opens a signed session cookie (30 days) that lists orders placed
 * with that email. Nothing about the customer is stored for this.
 */
export const CUSTOMER_COOKIE = "s76_customer";
export const LINK_MINUTES = 30;
export const SESSION_DAYS = 30;

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const sign = (purpose: string, email: string, exp: number) => hmacSha256(serverSecret(), `${purpose}:${email}:${exp}`);

export function makeToken(purpose: "link" | "session", email: string, ttlMs: number, now = Date.now()) {
  const exp = now + ttlMs;
  return `${b64(email)}.${exp}.${sign(purpose, email, exp)}`;
}

export function readToken(purpose: "link" | "session", token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const [e, exp, sig] = token.split(".");
  if (!e || !exp || !sig || !/^\d+$/.test(exp)) return null;
  let email: string;
  try {
    email = unb64(e);
  } catch {
    return null;
  }
  if (!safeEqual(sig, sign(purpose, email, Number(exp)))) return null;
  if (Number(exp) < now) return null;
  return email;
}

/** Always resolves the same way so the form can't reveal who has ordered. */
export async function requestOrdersLink(emailRaw: string, locale: "ar" | "en", ip: string, db?: DbOrTx): Promise<{ limited: boolean }> {
  const conn = db ?? (await getDb());
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  const a = await rateLimit(`orders-link:ip:${ip}`, 10, 3600, conn);
  const b = await rateLimit(`orders-link:email:${email}`, 3, 3600, conn);
  if (!a.allowed || !b.allowed) return { limited: true };
  const [has] = await conn.select({ id: schema.orders.id }).from(schema.orders).where(sql`lower(${schema.orders.email}) = ${email}`).limit(1);
  if (!has) return { limited: false };
  const token = makeToken("link", email, LINK_MINUTES * 60_000);
  const link = `${env.appUrl}/${locale}/account/verify?token=${encodeURIComponent(token)}`;
  const { store } = await getSettings(["store"], conn);
  const storeName = locale === "ar" ? store.nameAr || brand.nameAr : store.nameEn || brand.name;
  await sendEmailLogged("orders_link", email, renderOrdersLink({ locale, link, minutes: LINK_MINUTES, storeName }), conn);
  return { limited: false };
}

export async function ordersForEmail(email: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const orders = await conn
    .select()
    .from(schema.orders)
    .where(sql`lower(${schema.orders.email}) = ${email.toLowerCase()}`)
    .orderBy(desc(schema.orders.createdAt))
    .limit(100);
  const counts = orders.length
    ? await conn
        .select({ orderId: schema.orderItems.orderId, n: sql<number>`sum(${schema.orderItems.quantity})::int` })
        .from(schema.orderItems)
        .where(sql`${schema.orderItems.orderId} in (${sql.join(orders.map((o) => sql`${o.id}`), sql`, `)})`)
        .groupBy(schema.orderItems.orderId)
    : [];
  return orders.map((o) => ({
    number: o.number,
    createdAt: o.createdAt,
    status: o.status,
    paymentStatus: o.paymentStatus,
    totalHalalas: o.totalHalalas,
    items: counts.find((c) => c.orderId === o.id)?.n ?? 0,
    link: customerOrderLink(o),
  }));
}

