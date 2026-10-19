import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { hashPassword } from "@/lib/crypto";
import { env } from "@/config/env";
import { placeOrder } from "@/services/checkout";
import { saveSetting, getSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { notifyOrder } from "@/services/notify";
import { subscribeStockAlert, sendBackInStockAlerts, stockAlertCounts } from "@/services/stock-alerts";
import { exportOrdersCsv, csvCell } from "@/services/order-export";
import { beginTwoFactorSetup, confirmTwoFactorSetup, verifySecondFactor, signPendingLogin, readPendingLogin, twoFactorStatus } from "@/services/two-factor";
import { hotp, totpStep, base32Encode, verifyTotp } from "@/lib/totp";
import { buildQuote } from "@/services/quote";

let db: Db;
let variantId: string;
let productId: string;

const order = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `f_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  locale: "ar",
  items: [{ variantId, quantity: 1 }],
  paymentMethod: "cod",
  customer: { name: "نورة سالم", phone: "0553334444", email: "noura@example.com" },
  address: { city: "Jeddah", district: "الروضة", street: "شارع 9", nationalAddress: "", postalCode: "", notes: "" },
  ...over,
});

function capture() {
  const emails: { to: string; subject: string; text: string }[] = [];
  const sms: { to: string; body: string }[] = [];
  vi.spyOn(transport, "email").mockImplementation(async (m) => (emails.push(m), { ok: true }));
  vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
  vi.spyOn(transport, "sms").mockImplementation(async (to, body) => (sms.push({ to, body }), { ok: true, id: "1" }));
  return { emails, sms };
}

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  productId = v!.productId;
  await db.update(schema.productVariants).set({ stock: 50 });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
});
afterEach(() => vi.restoreAllMocks());

describe("per-city shipping", () => {
  it("checkout charges the city price and quotes its delivery time", async () => {
    const shipping = await getSetting("shipping");
    await saveSetting("shipping", { ...shipping, cityRates: [{ city: "Jeddah", rateHalalas: 1900, etaAr: "يومان", etaEn: "2 days" }] });
    const q = await buildQuote({ items: [{ variantId, quantity: 1 }], city: "Jeddah" });
    expect(q.shipping.amountHalalas).toBe(1900);
    expect(q.shipping.etaAr).toBe("يومان");
    const q2 = await buildQuote({ items: [{ variantId, quantity: 1 }], city: "Riyadh" });
    expect(q2.shipping.amountHalalas).toBe(shipping.flatRateHalalas);
    capture();
    const r = await placeOrder(order());
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    expect(o!.shippingHalalas).toBe(1900);
    await saveSetting("shipping", shipping);
  });

  it("rejects the same city twice", async () => {
    const shipping = await getSetting("shipping");
    const row = { city: "Jeddah", rateHalalas: 1, etaAr: "", etaEn: "" };
    await expect(saveSetting("shipping", { ...shipping, cityRates: [row, row] })).rejects.toThrow();
  });
});

describe("back-in-stock alerts", () => {
  it("subscribes only while sold out, emails once when stock returns, then forgets the email", async () => {
    await db.update(schema.productVariants).set({ stock: 0 }).where(eq(schema.productVariants.id, variantId));
    expect(await subscribeStockAlert({ variantId, email: "Wait@Example.com", locale: "ar" })).toBe("subscribed");
    expect(await subscribeStockAlert({ variantId, email: "wait@example.com", locale: "ar" })).toBe("already");
    expect((await stockAlertCounts(db)).get(productId)).toBe(1);
    const { emails } = capture();
    expect(await sendBackInStockAlerts(db)).toBe(0); // still sold out
    await db.update(schema.productVariants).set({ stock: 5 }).where(eq(schema.productVariants.id, variantId));
    expect(await sendBackInStockAlerts(db)).toBe(1);
    expect(emails[0]!.to).toBe("wait@example.com");
    expect(emails[0]!.text).toContain("/ar/products/");
    expect(await db.select().from(schema.stockAlerts)).toHaveLength(0);
    expect(await sendBackInStockAlerts(db)).toBe(0);
    expect(await subscribeStockAlert({ variantId, email: "x@example.com", locale: "ar" })).toBe("in_stock");
    await db.update(schema.productVariants).set({ stock: 50 }).where(eq(schema.productVariants.id, variantId));
  });
});

describe("SMS", () => {
  it("is sent only when switched on and configured, once per order", async () => {
    const { sms } = capture();
    const saved = { ...env.sms };
    await placeOrder(order());
    expect(sms).toHaveLength(0); // off by default
    Object.assign(env.sms, { taqnyatKey: "k", sender: "STORE76" });
    await saveSetting("notifications", { ...(await getSetting("notifications")), customerSms: true });
    const r = await placeOrder(order());
    expect(sms).toHaveLength(1);
    expect(sms[0]!.to).toBe("+966553334444");
    expect(sms[0]!.body).toContain(r.orderNumber);
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    await notifyOrder(o!.id, "order_confirmed");
    expect(sms).toHaveLength(1);
    Object.assign(env.sms, saved);
    await saveSetting("notifications", { ...(await getSetting("notifications")), customerSms: false });
  });
});

describe("orders export", () => {
  it("produces Excel-friendly CSV and neutralises formulas", async () => {
    capture();
    await placeOrder(order({ customer: { name: "=HYPERLINK(\"x\")", phone: "0557778888", email: "" } }));
    const { csv, count } = await exportOrdersCsv({ q: "0557778888" });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(count).toBe(1);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain("رقم الطلب");
    expect(csvCell("+1")).toBe("\"'+1\"");
  });
});

describe("two-factor authentication", () => {
  it("matches the RFC 6238 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(hotp(secret, totpStep(59_000))).toBe("287082");
    expect(hotp(secret, totpStep(1111111109_000))).toBe("081804");
  });

  it("setup → login code → no replay → recovery code once", async () => {
    const [u] = await db.insert(schema.adminUsers).values({ email: "tf@example.com", name: "TF", role: "owner", passwordHash: await hashPassword("pw-pw-pw-pw-12") }).returning();
    const { secret } = await beginTwoFactorSetup(u!.id, u!.email, db);
    const now = Date.now();
    expect(await confirmTwoFactorSetup(u!.id, "000000", db, now)).toBeNull();
    const codes = await confirmTwoFactorSetup(u!.id, hotp(secret, totpStep(now)), db, now);
    expect(codes).toHaveLength(10);
    expect((await twoFactorStatus(u!.id, db)).enabled).toBe(true);

    const later = now + 60_000;
    const code = hotp(secret, totpStep(later));
    expect(await verifySecondFactor(u!.id, code, db, later)).toBe("totp");
    expect(await verifySecondFactor(u!.id, code, db, later)).toBeNull(); // replay
    expect(await verifySecondFactor(u!.id, codes![0]!.toUpperCase(), db)).toBe("recovery");
    expect(await verifySecondFactor(u!.id, codes![0]!, db)).toBeNull();
    expect((await twoFactorStatus(u!.id, db)).recoveryLeft).toBe(9);
    expect(verifyTotp(secret, "12345")).toBeNull();
  });

  it("pending-login ticket is signed and short-lived", () => {
    const t = signPendingLogin("user-1");
    expect(readPendingLogin(t)).toBe("user-1");
    expect(readPendingLogin(t.replace("user-1", "user-2"))).toBeNull();
    expect(readPendingLogin(t, Date.now() + 6 * 60_000)).toBeNull();
  });
});
