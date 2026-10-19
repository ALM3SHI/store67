import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { placeOrder } from "@/services/checkout";
import { saveSetting, getSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { resolveRange, salesReport } from "@/services/reports";
import { sendLowStockAlerts } from "@/services/low-stock";

let db: Db;
let variantId: string;
let price: number;
const order = (phone: string, qty = 1, city = "Riyadh") => ({
  idempotencyKey: `rp_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  locale: "ar",
  items: [{ variantId, quantity: qty }],
  paymentMethod: "cod",
  customer: { name: "عميل", phone, email: "" },
  address: { city, district: "حي", street: "شارع 1", nationalAddress: "", postalCode: "", notes: "" },
});

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  price = v!.priceHalalas;
  await db.update(schema.productVariants).set({ stock: 100 });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
  await saveSetting("notifications", { ...(await getSetting("notifications")), adminEmails: "team@example.com" });
});
afterEach(() => vi.restoreAllMocks());

describe("date ranges", () => {
  it("resolves presets in Riyadh time and rejects bad custom dates", () => {
    const now = new Date("2026-10-19T22:30:00Z"); // 01:30 on the 20th in Riyadh
    const r7 = resolveRange({ preset: "7" }, now);
    expect(r7.days).toHaveLength(7);
    expect(r7.days.at(-1)).toBe("2026-10-20");
    expect(r7.from.toISOString()).toBe("2026-10-13T21:00:00.000Z");
    const lm = resolveRange({ preset: "last_month" }, now);
    expect([lm.days[0], lm.days.at(-1), lm.days.length]).toEqual(["2026-09-01", "2026-09-30", 30]);
    expect(resolveRange({ from: "2026-10-05", to: "2026-10-01" }, now).preset).toBe("30"); // reversed → default
    expect(resolveRange({ from: "2026-10-01", to: "2026-10-05" }, now).days).toHaveLength(5);
  });
});

describe("sales report", () => {
  it("counts confirmed orders only and nets out refunds", async () => {
    vi.spyOn(transport, "email").mockResolvedValue({ ok: true });
    vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
    const a = await placeOrder(order("0551000001", 2, "Jeddah"));
    await placeOrder(order("0551000002", 1));
    const c = await placeOrder(order("0551000003", 1));
    await db.update(schema.orders).set({ status: "cancelled" }).where(eq(schema.orders.number, c.orderNumber));
    const [oa] = await db.select().from(schema.orders).where(eq(schema.orders.number, a.orderNumber));
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, oa!.id));
    await db.insert(schema.refunds).values({ paymentId: pay!.id, amountHalalas: 1000, reason: "test", status: "succeeded" });

    const r = await salesReport(resolveRange({ preset: "7" }));
    expect(r.orders).toBe(2);
    expect(r.cancelled).toBe(1);
    expect(r.units).toBe(3);
    expect(r.top[0]).toMatchObject({ units: 3, revenue: price * 3 });
    expect(r.refunds).toBe(1000);
    expect(r.net).toBe(r.gross - 1000);
    expect(r.newCustomers).toBe(2);
    expect(r.byCity.map((x) => x.city).sort()).toEqual(["Jeddah", "Riyadh"]);
    expect(r.days.reduce((s, d) => s + d.n, 0)).toBe(2);
    expect(r.codPending).toBe(r.gross);
  });
});

describe("low-stock alerts", () => {
  it("alerts once when a variant reaches its level and again only after restocking", async () => {
    const sent: string[] = [];
    vi.spyOn(transport, "email").mockImplementation(async (m) => (sent.push(m.text), { ok: true }));
    vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
    await db.update(schema.productVariants).set({ stock: 100, lowStockAlertedAt: null });
    await db.update(schema.productVariants).set({ stock: 6, lowStockThreshold: 5 }).where(eq(schema.productVariants.id, variantId));
    expect(await sendLowStockAlerts(db)).toBe(0);
    await placeOrder(order("0551000009", 1)); // 6 → 5, triggers the check after the order
    await vi.waitFor(async () => expect(sent.some((t) => t.includes("مخزون منخفض"))).toBe(true));
    expect(await sendLowStockAlerts(db)).toBe(0); // not again
    await db.update(schema.productVariants).set({ stock: 20 }).where(eq(schema.productVariants.id, variantId));
    expect(await sendLowStockAlerts(db)).toBe(0); // re-armed
    await db.update(schema.productVariants).set({ stock: 2 }).where(eq(schema.productVariants.id, variantId));
    expect(await sendLowStockAlerts(db)).toBe(1);
    await saveSetting("notifications", { ...(await getSetting("notifications")), lowStockAlerts: false });
    await db.update(schema.productVariants).set({ stock: 50, lowStockAlertedAt: null });
    await db.update(schema.productVariants).set({ stock: 1 }).where(eq(schema.productVariants.id, variantId));
    expect(await sendLowStockAlerts(db)).toBe(0); // switched off
  });
});
