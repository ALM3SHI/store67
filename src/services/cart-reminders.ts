import "server-only";
import { and, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { getSettings } from "@/services/settings";
import { emailConfigured } from "@/services/notify/transport";
import { env } from "@/config/env";
import { brand } from "@/config/brand";

/* Opt-in cart reminders. Nothing is stored unless the shopper ticks the box;
   one email at most; the row is removed when they order, untick, or after a week. */

const KEEP_DAYS = 7;

export const cartReminderSchema = z.object({
  email: z.email().max(200).transform((v) => v.trim().toLowerCase()),
  locale: z.enum(["ar", "en"]),
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(99) })).min(1).max(20),
});

export async function cartRemindersAvailable(db?: DbOrTx) {
  const { notifications } = await getSettings(["notifications"], db);
  return notifications.cartReminders && emailConfigured();
}

/** Saves (or refreshes) the shopper's cart reminder. Returns false when the store has the feature off. */
export async function saveCartReminder(input: z.input<typeof cartReminderSchema>, db?: DbOrTx, now = new Date()) {
  const conn = db ?? (await getDb());
  const { notifications } = await getSettings(["notifications"], conn);
  if (!notifications.cartReminders || !emailConfigured()) return false;
  const v = cartReminderSchema.parse(input);
  const remindAt = new Date(now.getTime() + notifications.cartReminderHours * 3600_000);
  await conn
    .insert(schema.cartReminders)
    .values({ email: v.email, locale: v.locale, items: v.items, tokenHash: sha256(randomToken()), remindAt, createdAt: now })
    .onConflictDoUpdate({ target: schema.cartReminders.email, set: { items: v.items, locale: v.locale, remindAt, sentAt: null, createdAt: now } });
  return true;
}

export async function deleteCartReminder(email: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  await conn.delete(schema.cartReminders).where(eq(schema.cartReminders.email, email.trim().toLowerCase()));
}

/** The cart behind a restore link (works for the week the reminder is kept). */
export async function cartForToken(token: string, db?: DbOrTx) {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const conn = db ?? (await getDb());
  const [row] = await conn.select().from(schema.cartReminders).where(eq(schema.cartReminders.tokenHash, sha256(token)));
  return row ? { items: row.items, locale: row.locale } : null;
}

/**
 * Sends reminders that are due (from the scheduler). Shoppers who placed an
 * order with the same email since they asked are skipped and forgotten.
 */
export async function sendCartReminders(db?: DbOrTx, now = new Date()): Promise<number> {
  const conn = db ?? (await getDb());
  await conn.delete(schema.cartReminders).where(lt(schema.cartReminders.createdAt, new Date(now.getTime() - KEEP_DAYS * 86_400_000)));
  const { notifications, store } = await getSettings(["notifications", "store"], conn);
  if (!notifications.cartReminders || !emailConfigured()) return 0;
  const due = await conn
    .select()
    .from(schema.cartReminders)
    .where(and(isNull(schema.cartReminders.sentAt), lte(schema.cartReminders.remindAt, now)))
    .limit(100);
  const { buildQuote } = await import("@/services/quote");
  const { transport } = await import("@/services/notify/transport");
  const { renderCartReminder } = await import("@/services/notify/templates");
  let sent = 0;
  for (const r of due) {
    const [ordered] = await conn
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(sql`lower(${schema.orders.email}) = ${r.email}`, gt(schema.orders.createdAt, r.createdAt)))
      .limit(1);
    if (ordered) {
      await deleteCartReminder(r.email, conn);
      continue;
    }
    // Claim it first (once only), with a fresh restore secret we can put in the link.
    const token = randomToken(24);
    const [claimed] = await conn
      .update(schema.cartReminders)
      .set({ sentAt: now, tokenHash: sha256(token) })
      .where(and(eq(schema.cartReminders.email, r.email), isNull(schema.cartReminders.sentAt)))
      .returning();
    if (!claimed) continue;
    const q = await buildQuote({ items: r.items }, { db: conn, now });
    const lines = q.lines.filter((l) => l.quantity > 0);
    if (!lines.length) continue; // nothing left to buy
    const L = r.locale === "en" ? "en" : "ar";
    const mail = renderCartReminder({
      locale: L,
      storeName: (L === "ar" ? store.nameAr : store.nameEn) || (L === "ar" ? brand.nameAr : brand.name),
      items: lines.map((l) => ({ name: L === "ar" ? l.nameAr : l.nameEn, quantity: l.quantity, lineTotalHalalas: l.lineTotalHalalas })),
      link: `${env.appUrl}/${L}/cart/restore?token=${token}`,
    });
    const res = await transport.email({ to: r.email, ...mail });
    if (res.ok) sent++;
  }
  return sent;
}

/** Called after an order: the shopper no longer needs a reminder. */
export async function forgetCartReminderFor(email: string | null | undefined, db?: DbOrTx) {
  if (email) await deleteCartReminder(email, db);
}

