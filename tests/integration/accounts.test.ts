import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { placeOrder } from "@/services/checkout";
import { getSetting, saveSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { accountOrders, customerForVerified, deleteAccount, linkIdentifier, parseIdentifier, requestCode, verifyCode } from "@/services/customer-auth";

let db: Db;
let variantId: string;
const sent: { to: string; text: string }[] = [];

const order = (phone: string, email = "") => ({
  idempotencyKey: `acc_${Math.random().toString(36).slice(2)}_${Date.now()}_padding`,
  locale: "ar",
  items: [{ variantId, quantity: 1 }],
  paymentMethod: "cod",
  customer: { name: "هند", phone, email },
  address: { city: "Riyadh", district: "الياسمين", street: "شارع 2", nationalAddress: "", postalCode: "", notes: "" },
});

/** Requests a code and reads it from the captured SMS/email. */
async function codeFor(identifier: string, purpose: "login" | "link" = "login", customerId?: string) {
  const r = await requestCode(identifier, { purpose, customerId, ip: `ip-${Math.random()}`, locale: "ar", db });
  if (!r.ok) throw new Error(r.reason);
  const code = /(\d{6})/.exec(sent.at(-1)!.text)![1]!;
  return { otpId: r.otpId, code, masked: r.masked };
}

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  await db.update(schema.productVariants).set({ stock: 100 });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
});

beforeAll(() => {
  vi.spyOn(transport, "sms").mockImplementation(async (to, text) => (sent.push({ to, text }), { ok: true }));
  vi.spyOn(transport, "email").mockImplementation(async (m) => (sent.push({ to: m.to, text: m.text }), { ok: true }));
  vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
});
afterEach(() => undefined);

describe("customer sign-in codes", () => {
  it("parses mobiles (any common format) and emails", () => {
    expect(parseIdentifier("٠٥٥١٢٣٤٥٦٧")).toEqual({ channel: "sms", target: "+966551234567" });
    expect(parseIdentifier(" Me@Example.COM ")).toEqual({ channel: "email", target: "me@example.com" });
    expect(parseIdentifier("hello")).toBeNull();
  });

  it("a code works once; wrong codes are limited; the newest code replaces older ones", async () => {
    const first = await codeFor("0551110001");
    const second = await codeFor("0551110001");
    expect(sent.at(-1)!.to).toBe("+966551110001");
    expect(await verifyCode(first.otpId, first.code, db)).toMatchObject({ ok: false, reason: "expired" });
    expect(await verifyCode(second.otpId, "000000", db)).toMatchObject({ ok: false, reason: "invalid" });
    const ok = await verifyCode(second.otpId, second.code, db);
    expect(ok).toMatchObject({ ok: true, identifier: { channel: "sms", target: "+966551110001" } });
    expect(await verifyCode(second.otpId, second.code, db)).toMatchObject({ ok: false });

    const third = await codeFor("0551110002");
    for (let i = 0; i < 5; i++) await verifyCode(third.otpId, "111111", db);
    expect(await verifyCode(third.otpId, third.code, db)).toMatchObject({ ok: false, reason: "too_many" });
  });

  it("limits how many codes one number can receive", async () => {
    await codeFor("0551110003");
    await codeFor("0551110003");
    await codeFor("0551110003");
    await expect(codeFor("0551110003")).rejects.toThrow("rate_limited");
  });
});

describe("accounts", () => {
  it("signing in with a mobile unlocks the orders placed earlier as a guest", async () => {
    await placeOrder(order("0552220001"), { db });
    const c = await customerForVerified({ channel: "sms", target: "+966552220001" }, db);
    expect(c.phoneVerifiedAt).not.toBeNull();
    const list = await accountOrders(c, db);
    expect(list).toHaveLength(1);
    expect(list[0]!.link).toContain("/ar/orders/");
  });

  it("orders placed while signed in belong to the account even with another mobile", async () => {
    const c = await customerForVerified({ channel: "email", target: "acct@example.com" }, db);
    await placeOrder(order("0552220099", ""), { db, customerId: c.id });
    expect((await accountOrders(c, db)).length).toBe(1);
    const [fresh] = await db.select().from(schema.customers).where(eq(schema.customers.id, c.id));
    expect(fresh!.name).toBe("هند"); // name filled from the first order
  });

  it("an email-only account can add a mobile; a guest record with that mobile is merged in", async () => {
    await placeOrder(order("0552220077"), { db });
    const c = await customerForVerified({ channel: "email", target: "merge@example.com" }, db);
    expect((await accountOrders(c, db)).length).toBe(0);
    expect(await linkIdentifier(c.id, { channel: "sms", target: "+966552220077" }, db)).toEqual({ ok: true });
    expect((await accountOrders((await db.select().from(schema.customers).where(eq(schema.customers.id, c.id)))[0]!, db)).length).toBe(1);
    // a mobile that already belongs to another *account* can't be taken
    const other = await customerForVerified({ channel: "sms", target: "+966552220088" }, db);
    expect(other.phoneVerifiedAt).not.toBeNull();
    expect(await linkIdentifier(c.id, { channel: "sms", target: "+966552220088" }, db)).toEqual({ ok: false, reason: "taken" });
  });

  it("deleting the account keeps the orders but unlinks them", async () => {
    const c = await customerForVerified({ channel: "email", target: "bye@example.com" }, db);
    const r = await placeOrder(order("0552220055"), { db, customerId: c.id });
    await db.insert(schema.customerAddresses).values({ customerId: c.id, recipientName: "x", phone: "+966552220055", city: "Riyadh", district: "d", street: "s" });
    await deleteAccount(c.id, db);
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    expect(o!.customerId).toBeNull();
    expect(await db.select().from(schema.customerAddresses).where(eq(schema.customerAddresses.customerId, c.id))).toHaveLength(0);
  });
});
