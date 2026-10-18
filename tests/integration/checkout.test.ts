import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { placeOrder, CheckoutError, retryPayment } from "@/services/checkout";
import { buildQuote } from "@/services/quote";
import { applyPaymentState } from "@/services/payments/apply";
import { handleTestWebhook, signTestEvent, handleMoyasarWebhook } from "@/services/payments/webhooks";
import { expireStaleOrders, getOrderForCustomer, findOrderByNumberAndPhone } from "@/services/orders";
import { saveSetting, getSetting } from "@/services/settings";

let db: Db;
let variantId: string;

const base = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `k_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  locale: "ar",
  items: [{ variantId, quantity: 1 }],
  paymentMethod: "test",
  customer: { name: "سارة أحمد", phone: "0551234567", email: "" },
  address: { city: "Riyadh", district: "النخيل", street: "شارع الأمير 5", nationalAddress: "", postalCode: "", notes: "" },
  ...over,
});

const stock = async () => (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]!.stock;
const setStock = (n: number) => db.update(schema.productVariants).set({ stock: n }).where(eq(schema.productVariants.id, variantId));
const orderByNumber = async (n: string) => (await db.select().from(schema.orders).where(eq(schema.orders.number, n)))[0]!;
const paymentFor = async (orderId: string) => (await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)))[0]!;

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
});

beforeEach(async () => {
  await setStock(40);
  await db.update(schema.productVariants).set({ priceHalalas: 14900 }).where(eq(schema.productVariants.id, variantId));
});

describe("pricing is computed on the server", () => {
  it("ignores totals sent by the browser", async () => {
    const r = await placeOrder({ ...base(), subtotal: 1, total: 1, items: [{ variantId, quantity: 2, price: 1 }] });
    const o = await orderByNumber(r.orderNumber);
    expect(o.subtotalHalalas).toBe(29800);
    expect(o.shippingHalalas).toBe(2500);
    expect(o.totalHalalas).toBe(32300);
    expect(r.totalHalalas).toBe(32300);
  });

  it("quotes reflect admin price changes immediately", async () => {
    await db.update(schema.productVariants).set({ priceHalalas: 9900 }).where(eq(schema.productVariants.id, variantId));
    const q = await buildQuote({ items: [{ variantId, quantity: 1 }] });
    expect(q.totals.subtotalHalalas).toBe(9900);
  });

  it("rejects invalid input with field details", async () => {
    await expect(placeOrder(base({ customer: { name: "x", phone: "123", email: "bad" } }))).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects unknown variants", async () => {
    await expect(placeOrder(base({ items: [{ variantId: "00000000-0000-4000-8000-000000000000", quantity: 1 }] }))).rejects.toBeInstanceOf(CheckoutError);
  });
});

describe("inventory", () => {
  it("reserves stock on order and refuses to oversell", async () => {
    await setStock(3);
    await placeOrder(base({ items: [{ variantId, quantity: 2 }] }));
    expect(await stock()).toBe(1);
    await expect(placeOrder(base({ items: [{ variantId, quantity: 2 }] }))).rejects.toMatchObject({ code: "out_of_stock" });
    expect(await stock()).toBe(1);
  });

  it("concurrent checkouts can never take more than the stock", async () => {
    await setStock(2);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => placeOrder(base())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await stock()).toBe(0);
  });

  it("enforces the per-item quantity cap", async () => {
    await expect(placeOrder(base({ items: [{ variantId, quantity: 50 }] }))).rejects.toMatchObject({ code: "out_of_stock" });
  });

  it("releases stock when an unpaid order expires", async () => {
    await expireStaleOrders(new Date(Date.now() + 2 * 3600_000)); // clear holds from earlier tests
    await setStock(40);
    const r = await placeOrder(base({ items: [{ variantId, quantity: 3 }] }));
    expect(await stock()).toBe(37);
    const n = await expireStaleOrders(new Date(Date.now() + 2 * 3600_000));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await stock()).toBe(40);
    expect((await orderByNumber(r.orderNumber)).status).toBe("cancelled");
  });
});

describe("idempotency", () => {
  it("the same checkout submission creates one order", async () => {
    const input = base();
    const a = await placeOrder(input);
    const b = await placeOrder(input);
    expect(b.orderNumber).toBe(a.orderNumber);
    expect(b.accessToken).toBe(a.accessToken);
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(eq(schema.orders.idempotencyKey, input.idempotencyKey))) as [{ n: number }];
    expect(n).toBe(1);
    expect(await stock()).toBe(39);
  });
});

describe("payments", () => {
  async function newTestOrder() {
    const r = await placeOrder(base());
    const o = await orderByNumber(r.orderNumber);
    const p = await paymentFor(o.id);
    return { r, o, p };
  }
  const event = (type: string, ref: string, amount: number, id = `evt_${Math.random()}`) => JSON.stringify({ id, type, ref, amount, currency: "SAR" });

  it("a signed paid event confirms the order", async () => {
    const { o, p } = await newTestOrder();
    expect(p.status).toBe("pending");
    const raw = event("payment_paid", p.providerRef!, p.amountHalalas);
    const out = await handleTestWebhook(raw, signTestEvent(raw));
    expect(out.result).toBe("applied");
    const after = await orderByNumber(o.number);
    expect(after.status).toBe("confirmed");
    expect(after.paymentStatus).toBe("paid");
  });

  it("the same event delivered twice is processed once", async () => {
    const { o, p } = await newTestOrder();
    const raw = event("payment_paid", p.providerRef!, p.amountHalalas, "evt_dup_1");
    expect((await handleTestWebhook(raw, signTestEvent(raw))).result).toBe("applied");
    expect((await handleTestWebhook(raw, signTestEvent(raw))).result).toBe("duplicate_event");
    // A different event id for an already-paid payment changes nothing either
    const raw2 = event("payment_paid", p.providerRef!, p.amountHalalas, "evt_dup_2");
    expect((await handleTestWebhook(raw2, signTestEvent(raw2))).result).toBe("no_change");
    const events = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, o.id));
    expect(events.filter((e) => e.message === "تم تأكيد الدفع")).toHaveLength(1);
  });

  it("rejects unsigned or tampered events", async () => {
    const { p } = await newTestOrder();
    const raw = event("payment_paid", p.providerRef!, p.amountHalalas);
    expect((await handleTestWebhook(raw, "bad")).status).toBe(401);
    expect((await handleTestWebhook(raw, null)).status).toBe(401);
    const tampered = raw.replace(String(p.amountHalalas), "1");
    expect((await handleTestWebhook(tampered, signTestEvent(raw))).status).toBe(401);
  });

  it("does not accept a payment for the wrong amount", async () => {
    const { o, p } = await newTestOrder();
    const raw = event("payment_paid", p.providerRef!, 100);
    expect((await handleTestWebhook(raw, signTestEvent(raw))).result).toBe("amount_mismatch");
    expect((await orderByNumber(o.number)).paymentStatus).not.toBe("paid");
  });

  it("a failed payment marks the order and keeps stock reserved for a retry", async () => {
    const { o, p, r } = await newTestOrder();
    const before = await stock();
    const raw = event("payment_failed", p.providerRef!, p.amountHalalas);
    await handleTestWebhook(raw, signTestEvent(raw));
    const after = await orderByNumber(o.number);
    expect(after.status).toBe("payment_failed");
    expect(await stock()).toBe(before);
    const url = await retryPayment(o.id, r.accessToken);
    expect(url).toContain("/pay/test/");
    expect((await orderByNumber(o.number)).status).toBe("pending_payment");
  });

  it("a late payment after expiry re-reserves stock", async () => {
    const { o, p } = await newTestOrder();
    await expireStaleOrders(new Date(Date.now() + 2 * 3600_000));
    expect((await orderByNumber(o.number)).status).toBe("cancelled");
    const s0 = await stock();
    const res = await applyPaymentState({ paymentId: p.id, state: { status: "paid", amountHalalas: p.amountHalalas, currency: "SAR" }, eventId: "late_1", source: "webhook" });
    expect(res).toBe("applied");
    const after = await orderByNumber(o.number);
    expect(after.status).toBe("confirmed");
    expect(await stock()).toBe(s0 - 1);
  });
});

describe("Moyasar webhook", () => {
  it("is refused when Moyasar is not configured", async () => {
    const out = await handleMoyasarWebhook({ id: "x", type: "payment_paid", secret_token: "s", data: { id: "p" } });
    expect(out.status).toBe(503);
  });

  it("checks the secret token and re-fetches the payment from the API", async () => {
    vi.resetModules();
    process.env.MOYASAR_SECRET_KEY = "sk_test_x";
    process.env.MOYASAR_WEBHOOK_SECRET = "whsec_correct";
    const mod = await import("@/services/payments/webhooks");
    const { getDb: getDb2, schema: s2 } = await import("@/lib/db");
    const db2 = await getDb2();
    // Same in-memory database instance is shared through globalThis
    const [o] = await db2.select().from(s2.orders).limit(1);
    const [pay] = await db2.insert(s2.payments).values({ orderId: o!.id, provider: "moyasar", providerRef: "inv_123", status: "pending", amountHalalas: o!.totalHalalas, currency: "SAR" }).returning();

    expect((await mod.handleMoyasarWebhook({ id: "e1", type: "payment_paid", secret_token: "wrong", data: { id: "pay_1", invoice_id: "inv_123" } })).status).toBe(401);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "pay_1", status: "paid", amount: o!.totalHalalas, currency: "SAR", invoice_id: "inv_123", source: { type: "creditcard", company: "mada" }, live: false }), { status: 200 }),
    );
    const ok = await mod.handleMoyasarWebhook({ id: "e2", type: "payment_paid", secret_token: "whsec_correct", data: { id: "pay_1", invoice_id: "inv_123", amount: 1, status: "paid" } });
    expect(ok.result).toBe("applied");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/payments/pay_1"), expect.anything());
    const [p2] = await db2.select().from(s2.payments).where(eq(s2.payments.id, pay!.id));
    expect(p2!.status).toBe("paid");
    expect(p2!.method).toBe("mada");
    fetchMock.mockRestore();
    delete process.env.MOYASAR_SECRET_KEY;
    delete process.env.MOYASAR_WEBHOOK_SECRET;
  });
});

describe("order privacy", () => {
  it("requires the secret token to view an order", async () => {
    const r = await placeOrder(base());
    expect(await getOrderForCustomer(r.orderNumber, r.accessToken)).not.toBeNull();
    expect(await getOrderForCustomer(r.orderNumber, undefined)).toBeNull();
    expect(await getOrderForCustomer(r.orderNumber, "x".repeat(43))).toBeNull();
    const other = await placeOrder(base({ customer: { name: "خالد", phone: "0559876543", email: "" } }));
    // One customer's token never opens another customer's order
    expect(await getOrderForCustomer(other.orderNumber, r.accessToken)).toBeNull();
  });

  it("tracking requires the matching phone", async () => {
    const r = await placeOrder(base());
    expect(await findOrderByNumberAndPhone(r.orderNumber, "+966551234567")).not.toBeNull();
    expect(await findOrderByNumberAndPhone(r.orderNumber, "+966500000000")).toBeNull();
  });
});

describe("coupons", () => {
  it("applies a valid coupon and enforces its usage limit", async () => {
    await db.insert(schema.coupons).values({ code: "WELCOME10", type: "percent", value: 10, usageLimit: 1, active: true }).onConflictDoNothing();
    const r = await placeOrder(base({ couponCode: "welcome10" }));
    const o = await orderByNumber(r.orderNumber);
    expect(o.discountHalalas).toBe(1490);
    expect(o.couponCode).toBe("WELCOME10");
    await expect(placeOrder(base({ couponCode: "WELCOME10" }))).rejects.toMatchObject({ code: "coupon_invalid" });
  });

  it("frees the coupon use again if the order expires unpaid", async () => {
    await db.insert(schema.coupons).values({ code: "ONCE", type: "fixed", value: 1000, usageLimit: 1, active: true }).onConflictDoNothing();
    await placeOrder(base({ couponCode: "ONCE" }));
    await expireStaleOrders(new Date(Date.now() + 2 * 3600_000));
    const [c] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, "ONCE"));
    expect(c!.usedCount).toBe(0);
  });
});

describe("payment availability", () => {
  it("offers only configured methods", async () => {
    const q = await buildQuote({ items: [{ variantId, quantity: 1 }] });
    expect(q.paymentMethods.map((m) => m.id)).toEqual(["test"]); // no Moyasar keys, COD disabled
    await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true, codFeeHalalas: 1000 });
    const q2 = await buildQuote({ items: [{ variantId, quantity: 1 }], paymentMethod: "cod" });
    expect(q2.paymentMethods.map((m) => m.id)).toContain("cod");
    expect(q2.totals.codFeeHalalas).toBe(1000);
  });

  it("cash on delivery orders are confirmed without a gateway", async () => {
    const r = await placeOrder(base({ paymentMethod: "cod" }));
    const o = await orderByNumber(r.orderNumber);
    expect(o.status).toBe("confirmed");
    expect(o.paymentStatus).toBe("cod_pending");
    expect(r.redirectUrl).toContain(`/ar/orders/${o.number}`);
  });

  it("rejects a method that isn't enabled", async () => {
    await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: false });
    await expect(placeOrder(base({ paymentMethod: "cod" }))).rejects.toMatchObject({ code: "payment_unavailable" });
    await expect(placeOrder(base({ paymentMethod: "moyasar" }))).rejects.toMatchObject({ code: "payment_unavailable" });
  });
});
