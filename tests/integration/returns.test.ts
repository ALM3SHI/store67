import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { placeOrder } from "@/services/checkout";
import { saveSetting, getSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { createReturnRequest, cancelReturnByCustomer, moveReturn, returnOverview, returnWindow, returnValueHalalas } from "@/services/returns";

let db: Db;
let variantId: string;
const actor = { id: null, name: "Staff" };

const capture = () => {
  const emails: { to: string; subject: string; text: string }[] = [];
  vi.spyOn(transport, "email").mockImplementation(async (m) => (emails.push(m), { ok: true }));
  vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
  return emails;
};

async function deliveredOrder(daysAgo = 1) {
  const r = await placeOrder({
    idempotencyKey: `ret_${Math.random().toString(36).slice(2)}_${Date.now()}`,
    locale: "ar",
    items: [{ variantId, quantity: 3 }],
    paymentMethod: "cod",
    customer: { name: "سارة علي", phone: "0551112222", email: "sara@example.com" },
    address: { city: "Riyadh", district: "النخيل", street: "شارع 1", nationalAddress: "", postalCode: "", notes: "" },
  });
  const deliveredAt = new Date(Date.now() - daysAgo * 86_400_000);
  const [o] = await db.update(schema.orders).set({ status: "delivered", deliveredAt }).where(eq(schema.orders.number, r.orderNumber)).returning();
  const [line] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o!.id));
  return { order: o!, line: line! };
}
const stock = async () => (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variantId)))[0]!.stock;

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  const [v] = await db.select().from(schema.productVariants);
  variantId = v!.id;
  await db.update(schema.productVariants).set({ stock: 100 });
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
  await saveSetting("commerce", { ...(await getSetting("commerce")), returnsWindowDays: 7 });
});
afterEach(() => vi.restoreAllMocks());

describe("return window", () => {
  it("opens on delivery and closes after the configured days", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const o = { status: "delivered" as const, deliveredAt: new Date("2026-10-05T12:00:00Z"), updatedAt: now };
    expect(returnWindow(o, 7, now).state).toBe("open");
    expect(returnWindow(o, 3, now).state).toBe("closed");
    expect(returnWindow(o, 0, now).state).toBe("disabled");
    expect(returnWindow({ ...o, status: "shipped" }, 7, now).state).toBe("not_delivered");
  });
});

describe("return requests", () => {
  it("customer requests, staff approves, receives with restock, completes — emails each step once", async () => {
    const emails = capture();
    const { order, line } = await deliveredOrder();
    const before = await stock();
    const r = await createReturnRequest(order.id, { kind: "return", reason: "defective", note: "لا يشحن", items: [{ orderItemId: line.id, quantity: 2 }] }, { db });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.number).toMatch(/^R-/);
    expect(emails.some((e) => e.to === "sara@example.com" && e.subject.includes(r.request.number))).toBe(true);

    // only one pending request at a time, and quantities can't exceed what's left
    expect(await createReturnRequest(order.id, { kind: "return", reason: "other", items: [{ orderItemId: line.id, quantity: 1 }] }, { db })).toEqual({ ok: false, error: "pending" });

    expect(await moveReturn(r.request.id, "receive", { actor, db })).toEqual({ ok: false, error: "state" });
    expect(await moveReturn(r.request.id, "reject", { actor, db, message: "" })).toEqual({ ok: false, error: "message" });
    const a = await moveReturn(r.request.id, "approve", { actor, db, message: "أرسله عبر سمسا إلى مستودعنا" });
    expect(a.ok).toBe(true);
    expect(emails.some((e) => e.text.includes("أرسله عبر سمسا"))).toBe(true);

    const rec = await moveReturn(r.request.id, "receive", { actor, db, restock: true });
    expect(rec.ok && rec.restockedUnits).toBe(2);
    expect(await stock()).toBe(before + 2);
    expect(await moveReturn(r.request.id, "receive", { actor, db, restock: true })).toEqual({ ok: false, error: "state" }); // no double restock

    expect((await moveReturn(r.request.id, "complete", { actor, db })).ok).toBe(true);
    const ov = await returnOverview(order, db);
    expect(ov.remaining.get(line.id)).toBe(1);
    expect(ov.canRequest).toBe(true);
    expect(returnValueHalalas(r.request, [line])).toBe(Math.round((line.lineTotalHalalas / 3) * 2));

    const events = await db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id));
    expect(events.filter((e) => e.type === "return" && !e.internal).length).toBeGreaterThanOrEqual(4);
    const kinds = (await db.select().from(schema.notifications).where(eq(schema.notifications.orderId, order.id))).map((n) => n.kind);
    expect(new Set(kinds.filter((k) => k.startsWith("return_")).map((k) => k.split("_")[1]))).toEqual(new Set(["requested", "approved", "completed"]));
  });

  it("rejects bad input: closed window, foreign items, too many, exchange without details", async () => {
    capture();
    const old = await deliveredOrder(10);
    expect(await createReturnRequest(old.order.id, { kind: "return", reason: "changed_mind", items: [{ orderItemId: old.line.id, quantity: 1 }] }, { db })).toEqual({ ok: false, error: "window" });

    const { order, line } = await deliveredOrder();
    expect(await createReturnRequest(order.id, { kind: "return", reason: "other", items: [{ orderItemId: old.line.id, quantity: 1 }] }, { db })).toEqual({ ok: false, error: "items" });
    expect(await createReturnRequest(order.id, { kind: "return", reason: "other", items: [{ orderItemId: line.id, quantity: 4 }] }, { db })).toEqual({ ok: false, error: "items" });
    expect(await createReturnRequest(order.id, { kind: "return", reason: "other", items: [{ orderItemId: line.id, quantity: 0 }] }, { db })).toEqual({ ok: false, error: "items" });
    expect(await createReturnRequest(order.id, { kind: "exchange", reason: "size_fit", items: [{ orderItemId: line.id, quantity: 1 }] }, { db })).toEqual({ ok: false, error: "exchangeFor" });

    const ex = await createReturnRequest(order.id, { kind: "exchange", reason: "size_fit", exchangeFor: "مقاس L", items: [{ orderItemId: line.id, quantity: 1 }] }, { db });
    expect(ex.ok).toBe(true);
    if (!ex.ok) return;
    expect(await cancelReturnByCustomer(old.order.id, ex.request.id, db)).toBe(false); // wrong order
    expect(await cancelReturnByCustomer(order.id, ex.request.id, db)).toBe(true);
    expect((await returnOverview(order, db)).remaining.get(line.id)).toBe(3); // cancelled requests free the items
  });
});
