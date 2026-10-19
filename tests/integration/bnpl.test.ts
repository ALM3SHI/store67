import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { env } from "@/config/env";
import { placeOrder, CheckoutError } from "@/services/checkout";
import { transport } from "@/services/notify/transport";
import { handleTabbyWebhook, handleTamaraWebhook } from "@/services/payments/webhooks";
import { paymentProviderOnShipped } from "@/services/payments/shipped";
import { buildQuote } from "@/services/quote";

let db: Db;
let variantId: string;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

const order = (method: "tabby" | "tamara") => ({
  idempotencyKey: `bnpl_${method}_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  locale: "ar",
  items: [{ variantId, quantity: 2 }],
  paymentMethod: method,
  customer: { name: "فهد القحطاني", phone: "0554443322", email: "fahad@example.com" },
  address: { city: "Riyadh", district: "الملقا", street: "طريق أنس بن مالك 9", nationalAddress: "", postalCode: "13521", notes: "" },
});
const stock = async () => (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]!.stock;

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  await db.update(schema.productVariants).set({ stock: 50 });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(env.tabby, { secretKey: undefined, merchantCode: undefined, webhookSecret: undefined });
  Object.assign(env.tamara, { apiToken: undefined });
});
const quiet = () => {
  vi.spyOn(transport, "email").mockResolvedValue({ ok: true });
  vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
};

describe("Tabby", () => {
  it("is offered only when configured", async () => {
    expect((await buildQuote({ items: [{ variantId, quantity: 1 }] })).paymentMethods.map((m) => m.id)).not.toContain("tabby");
    Object.assign(env.tabby, { secretKey: "sk_test_x", merchantCode: "store76" });
    expect((await buildQuote({ items: [{ variantId, quantity: 1 }] })).paymentMethods.map((m) => m.id)).toContain("tabby");
  });

  it("creates a session, confirms by API, then captures", async () => {
    quiet();
    Object.assign(env.tabby, { secretKey: "sk_test_x", merchantCode: "store76", webhookSecret: "hook" });
    const calls: { url: string; body?: unknown }[] = [];
    let status = "CREATED";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.endsWith("/api/v2/checkout")) return json({ id: "sess1", status: "created", payment: { id: "pay-tabby-1" }, configuration: { available_products: { installments: [{ web_url: "https://checkout.tabby.sa/x" }] } } });
      if (u.endsWith("/api/v2/payments/pay-tabby-1")) return json({ id: "pay-tabby-1", status, amount: "323.00", currency: "SAR", captures: status === "CLOSED" ? [{ id: "c", amount: "323.00" }] : [] });
      if (u.endsWith("/captures")) return json({ id: "pay-tabby-1", status: "CLOSED" });
      return json({}, 404);
    });
    const r = await placeOrder(order("tabby"), { db });
    expect(r.redirectUrl).toBe("https://checkout.tabby.sa/x");
    const create = calls[0]!;
    expect(create.url).toBe("https://api.tabby.sa/api/v2/checkout");
    const body = create.body as { payment: { amount: string; currency: string; buyer: { phone: string }; order: { reference_id: string; items: unknown[] } }; merchant_code: string; lang: string };
    expect(body.payment.amount).toBe("323.00"); // 2 × 149 + 25 shipping
    expect(body.payment.buyer.phone).toBe("+966554443322");
    expect(body.payment.order.reference_id).toBe(r.orderNumber);
    expect(body.merchant_code).toBe("store76");
    expect(body.lang).toBe("ar");

    // webhook: wrong secret refused, then accepted and verified via the API
    expect((await handleTabbyWebhook({ id: "pay-tabby-1", status: "authorized" }, "nope")).status).toBe(401);
    status = "AUTHORIZED";
    const out = await handleTabbyWebhook({ id: "pay-tabby-1", status: "authorized" }, "hook");
    expect(out).toEqual({ status: 200, result: "applied" });
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    expect(o!.paymentStatus).toBe("paid");
    expect(calls.some((c) => c.url.endsWith("/api/v2/payments/pay-tabby-1/captures"))).toBe(true);
    expect((await handleTabbyWebhook({ id: "unknown-payment" }, "hook")).status).toBe(404); // retried by Tabby
  });

  it("a rejected customer gets their order cancelled and stock back, to pay another way", async () => {
    quiet();
    Object.assign(env.tabby, { secretKey: "sk_test_x", merchantCode: "store76" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: "s", status: "rejected", configuration: { products: { installments: { is_available: false, rejection_reason: "order_amount_too_high" } } } }));
    const before = await stock();
    await expect(placeOrder(order("tabby"), { db })).rejects.toMatchObject({ code: "payment_rejected" });
    expect(await stock()).toBe(before);
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.phone, "+966554443322")).orderBy(schema.orders.createdAt).then((rows) => rows.slice(-1));
    expect(o!.status).toBe("cancelled");
    expect(CheckoutError).toBeTruthy();
  });
});

describe("Tamara", () => {
  it("creates a checkout, authorises on approval, captures when shipped", async () => {
    quiet();
    Object.assign(env.tamara, { apiToken: "tok", apiBase: "https://api-sandbox.tamara.co" });
    let status = "new";
    const calls: { url: string; method: string; body?: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.endsWith("/checkout")) return json({ order_id: "tam-1", checkout_id: "c1", checkout_url: "https://checkout-sandbox.tamara.co/x", status: "new" });
      if (u.endsWith("/orders/tam-1/authorise")) {
        status = "authorised";
        return json({ order_id: "tam-1", status: "authorised" });
      }
      if (u.endsWith("/orders/tam-1")) return json({ order_id: "tam-1", status, total_amount: { amount: 323, currency: "SAR" } });
      if (u.endsWith("/payments/capture")) {
        status = "fully_captured";
        return json({ capture_id: "cap", order_id: "tam-1", status: "fully_captured" });
      }
      return json({}, 404);
    });
    const r = await placeOrder(order("tamara"), { db });
    expect(r.redirectUrl).toBe("https://checkout-sandbox.tamara.co/x");
    const body = calls[0]!.body as { total_amount: { amount: number }; consumer: { first_name: string; last_name: string; phone_number: string }; country_code: string; order_reference_id: string; locale: string };
    expect(body.total_amount.amount).toBe(323);
    expect(body.consumer).toMatchObject({ first_name: "فهد", last_name: "القحطاني", phone_number: "+966554443322" });
    expect(body.country_code).toBe("SA");
    expect(body.locale).toBe("ar_SA");

    status = "approved";
    expect(await handleTamaraWebhook({ order_id: "tam-1", event_type: "order_approved" })).toEqual({ status: 200, result: "applied" });
    expect(calls.some((c) => c.url.endsWith("/orders/tam-1/authorise") && c.method === "POST")).toBe(true);
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    expect(o!.paymentStatus).toBe("paid");

    await db.insert(schema.shipments).values({ orderId: o!.id, provider: "manual", carrierName: "SMSA", trackingNumber: "T123", status: "in_transit" });
    await paymentProviderOnShipped(o!.id);
    const cap = calls.find((c) => c.url.endsWith("/payments/capture"))!;
    expect(cap.body).toMatchObject({ order_id: "tam-1", total_amount: { amount: 323, currency: "SAR" }, shipping_info: { shipping_company: "SMSA", tracking_number: "T123" } });
  });
});
