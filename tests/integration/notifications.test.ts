import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { placeOrder } from "@/services/checkout";
import { applyPaymentState } from "@/services/payments/apply";
import { saveSetting, getSetting } from "@/services/settings";
import { notifyOrder, sendAdminAlert } from "@/services/notify";
import { transport } from "@/services/notify/transport";
import { renderOrderEmail } from "@/services/notify/templates";
import { customerOrderLink } from "@/services/order-links";

let db: Db;
let variantId: string;

const base = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: `n_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  locale: "ar",
  items: [{ variantId, quantity: 1 }],
  paymentMethod: "test",
  customer: { name: "سارة أحمد", phone: "0551234567", email: "sara@example.com" },
  address: { city: "Riyadh", district: "النخيل", street: "شارع الأمير 5", nationalAddress: "", postalCode: "", notes: "" },
  ...over,
});

const notesFor = (orderId: string) => db.select().from(schema.notifications).where(eq(schema.notifications.orderId, orderId));

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  await db.update(schema.productVariants).set({ stock: 100 });
  await saveSetting("notifications", { customerEmails: true, adminEmails: "owner@example.com", newOrderAlerts: true, errorAlerts: true });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
});

afterEach(() => vi.restoreAllMocks());

function captureTransport() {
  const emails: { to: string; subject: string; text: string; html: string }[] = [];
  const telegrams: string[] = [];
  vi.spyOn(transport, "email").mockImplementation(async (m) => {
    emails.push(m);
    return { ok: true, id: `em_${emails.length}` };
  });
  vi.spyOn(transport, "telegram").mockImplementation(async (t) => {
    telegrams.push(t);
    return { ok: true, id: String(telegrams.length) };
  });
  return { emails, telegrams };
}

describe("order notifications", () => {
  it("a COD order emails the customer and alerts the team", async () => {
    const { emails } = captureTransport();
    const r = await placeOrder(base({ paymentMethod: "cod" }));
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    const customer = emails.find((e) => e.to === "sara@example.com");
    expect(customer?.subject).toContain(r.orderNumber);
    // The email links to the same guest page the customer was redirected to.
    expect(customer?.text).toContain(r.redirectUrl);
    expect(customerOrderLink(o!)).toBe(r.redirectUrl);
    expect(emails.find((e) => e.to === "owner@example.com")?.text).toContain(r.orderNumber);
    const rows = await notesFor(o!.id);
    expect(rows.filter((n) => n.status === "sent").map((n) => n.kind).sort()).toEqual(["admin_new_order", "order_confirmed"]);
  });

  it("an online order notifies only once payment is confirmed, and only once", async () => {
    const { emails } = captureTransport();
    const r = await placeOrder(base());
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    expect(emails).toHaveLength(0); // unpaid: nothing sent yet
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o!.id));
    await applyPaymentState({ paymentId: p!.id, state: { status: "paid", amountHalalas: p!.amountHalalas, currency: "SAR" }, source: "webhook", eventId: "n_evt_1" });
    await applyPaymentState({ paymentId: p!.id, state: { status: "paid", amountHalalas: p!.amountHalalas, currency: "SAR" }, source: "return" });
    // A racing duplicate call to notifyOrder must not send again either.
    await notifyOrder(o!.id, "order_confirmed");
    expect(emails.filter((e) => e.to === "sara@example.com")).toHaveLength(1);
    expect(emails.filter((e) => e.to === "owner@example.com")).toHaveLength(1);
  });

  it("customers without an email get nothing, the team is still alerted", async () => {
    const { emails } = captureTransport();
    await placeOrder(base({ paymentMethod: "cod", customer: { name: "خالد", phone: "0559876543", email: "" } }));
    expect(emails.map((e) => e.to)).toEqual(["owner@example.com"]);
  });

  it("records a failure and never throws when the mail provider is down", async () => {
    vi.spyOn(transport, "email").mockResolvedValue({ ok: false, error: "resend 500: down" });
    vi.spyOn(transport, "telegram").mockResolvedValue({ ok: false, error: "not_configured", skipped: true });
    const r = await placeOrder(base({ paymentMethod: "cod" }));
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    const rows = await notesFor(o!.id);
    expect(rows.find((n) => n.kind === "order_confirmed")?.status).toBe("failed");
    expect(rows.find((n) => n.kind === "order_confirmed")?.error).toContain("down");
    // An admin resend (force) goes through once the provider is back.
    vi.restoreAllMocks();
    const { emails } = captureTransport();
    await notifyOrder(o!.id, "order_confirmed", { force: true, only: "customer" });
    expect(emails).toHaveLength(1);
    expect((await notesFor(o!.id)).find((n) => n.kind === "order_confirmed")?.status).toBe("sent");
  });

  it("respects the customer-email switch", async () => {
    const { emails } = captureTransport();
    await saveSetting("notifications", { ...(await getSetting("notifications")), customerEmails: false });
    await placeOrder(base({ paymentMethod: "cod" }));
    expect(emails.map((e) => e.to)).toEqual(["owner@example.com"]);
    await saveSetting("notifications", { ...(await getSetting("notifications")), customerEmails: true });
  });

  it("rejects invalid admin email lists", async () => {
    await expect(saveSetting("notifications", { ...(await getSetting("notifications")), adminEmails: "a@b.com, nope" })).rejects.toThrow();
  });

  it("admin alerts go to every listed address", async () => {
    const { emails } = captureTransport();
    await saveSetting("notifications", { ...(await getSetting("notifications")), adminEmails: "a@example.com, b@example.com" });
    const res = await sendAdminAlert("test", { subject: "s", text: "t", html: "<p>t</p>" });
    expect(emails.map((e) => e.to)).toEqual(["a@example.com", "b@example.com"]);
    expect(res.filter((x) => x.result.ok).length).toBeGreaterThanOrEqual(2);
    await saveSetting("notifications", { ...(await getSetting("notifications")), adminEmails: "owner@example.com" });
  });
});

describe("email templates", () => {
  const data = {
    number: "S76-ABC123",
    locale: "ar" as const,
    customerName: "<script>x</script> أحمد",
    createdAt: new Date(),
    paymentMethod: "cod",
    paymentStatus: "cod_pending",
    items: [{ name: "منتج", variant: "", quantity: 2, lineTotalHalalas: 29800 }],
    subtotalHalalas: 29800,
    discountHalalas: 0,
    shippingHalalas: 2500,
    codFeeHalalas: 0,
    taxHalalas: 0,
    totalHalalas: 32300,
    pricesIncludeTax: true,
    address: { city: "Riyadh", district: "النخيل", street: "شارع 1" },
    orderLink: "http://localhost:3000/ar/orders/S76-ABC123?t=x",
    tracking: null,
    store: { name: "STORE 76", email: "hi@example.com", phone: "", whatsapp: "" },
  };

  it("escapes customer-supplied text and is RTL for Arabic", () => {
    const m = renderOrderEmail("order_confirmed", data);
    expect(m.html).not.toContain("<script>x</script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain('dir="rtl"');
    expect(m.text).toContain(data.orderLink);
  });

  it("shipping emails carry the tracking number and only https carrier links", () => {
    const m = renderOrderEmail("order_shipped", { ...data, locale: "en", tracking: { number: "123456", carrier: "Aramex", url: "javascript:alert(1)" } });
    expect(m.text).toContain("123456");
    expect(m.html).not.toContain("javascript:");
    expect(m.html).toContain('dir="ltr"');
  });
});
