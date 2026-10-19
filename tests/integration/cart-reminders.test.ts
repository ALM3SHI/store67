import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { env } from "@/config/env";
import { placeOrder } from "@/services/checkout";
import { saveSetting, getSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { saveCartReminder, sendCartReminders, cartForToken, deleteCartReminder } from "@/services/cart-reminders";

let db: Db;
let variantId: string;
const HOUR = 3600_000;

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  await db.update(schema.productVariants).set({ stock: 50 });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(env.email, { resendKey: undefined, from: undefined });
});

describe("cart reminders", () => {
  it("are off until the store enables them and email is set up", async () => {
    expect(await saveCartReminder({ email: "a@example.com", locale: "ar", items: [{ variantId, quantity: 1 }] })).toBe(false);
    Object.assign(env.email, { resendKey: "re_x", from: "Store <s@example.com>" });
    expect(await saveCartReminder({ email: "a@example.com", locale: "ar", items: [{ variantId, quantity: 1 }] })).toBe(false);
    expect(await db.select().from(schema.cartReminders)).toHaveLength(0);
  });

  it("send one email after the delay with a working restore link, and never twice", async () => {
    Object.assign(env.email, { resendKey: "re_x", from: "Store <s@example.com>" });
    await saveSetting("notifications", { ...(await getSetting("notifications")), cartReminders: true, cartReminderHours: 3 });
    const mails: { to: string; text: string }[] = [];
    vi.spyOn(transport, "email").mockImplementation(async (m) => (mails.push(m), { ok: true }));
    const now = new Date();
    expect(await saveCartReminder({ email: "Shopper@Example.com", locale: "ar", items: [{ variantId, quantity: 2 }] }, db, now)).toBe(true);
    expect(await sendCartReminders(db, new Date(now.getTime() + 2 * HOUR))).toBe(0); // too early
    expect(await sendCartReminders(db, new Date(now.getTime() + 3 * HOUR + 1000))).toBe(1);
    expect(mails[0]!.to).toBe("shopper@example.com");
    expect(mails[0]!.text).toContain("× 2");
    const token = /token=([\w-]+)/.exec(mails[0]!.text)![1]!;
    expect(await cartForToken(token, db)).toEqual({ items: [{ variantId, quantity: 2 }], locale: "ar" });
    expect(await cartForToken("x".repeat(30), db)).toBeNull();
    expect(await sendCartReminders(db, new Date(now.getTime() + 5 * HOUR))).toBe(0); // once only
    expect(await sendCartReminders(db, new Date(now.getTime() + 8 * 24 * HOUR))).toBe(0);
    expect(await db.select().from(schema.cartReminders)).toHaveLength(0); // forgotten after a week
  });

  it("are dropped when the shopper orders or unticks the box", async () => {
    Object.assign(env.email, { resendKey: "re_x", from: "Store <s@example.com>" });
    await saveSetting("notifications", { ...(await getSetting("notifications")), cartReminders: true });
    const mails: unknown[] = [];
    vi.spyOn(transport, "email").mockImplementation(async (m) => (mails.push(m), { ok: true }));
    vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
    await saveCartReminder({ email: "buyer@example.com", locale: "ar", items: [{ variantId, quantity: 1 }] }, db);
    await placeOrder({
      idempotencyKey: `cr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      locale: "ar",
      items: [{ variantId, quantity: 1 }],
      paymentMethod: "cod",
      customer: { name: "مشترٍ", phone: "0554441122", email: "BUYER@example.com" },
      address: { city: "Riyadh", district: "حي", street: "شارع 1", nationalAddress: "", postalCode: "", notes: "" },
    });
    await vi.waitFor(async () => expect(await db.select().from(schema.cartReminders)).toHaveLength(0));
    await saveCartReminder({ email: "maybe@example.com", locale: "en", items: [{ variantId, quantity: 1 }] }, db);
    await deleteCartReminder("MAYBE@example.com", db);
    expect(await db.select().from(schema.cartReminders)).toHaveLength(0);
  });
});
