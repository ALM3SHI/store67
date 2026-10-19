import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";
import { placeOrder } from "@/services/checkout";
import { buildQuote } from "@/services/quote";
import { saveSetting, getSetting } from "@/services/settings";
import { transport } from "@/services/notify/transport";
import { listPublishedProducts } from "@/services/catalog";
import { recommendationsFor } from "@/services/recommendations";
import { promotionsForProduct } from "@/services/promotions";

let db: Db;
let a: { variantId: string; productId: string; price: number };
let b: { variantId: string; productId: string; price: number };

const order = (items: { variantId: string; quantity: number }[], extra: Record<string, unknown> = {}) => ({
  idempotencyKey: `m_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  locale: "ar",
  items,
  paymentMethod: "cod",
  customer: { name: "خالد سعد", phone: "0557776655", email: "" },
  address: { city: "Riyadh", district: "العليا", street: "شارع 5", nationalAddress: "", postalCode: "", notes: "" },
  ...extra,
});

beforeAll(async () => {
  db = await getDb();
  await seedDatabase(db);
  await db.update(schema.products).set({ status: "published" });
  await db.update(schema.productVariants).set({ stock: 100, active: true });
  const vs = await db.select().from(schema.productVariants);
  const byProduct = [...new Map(vs.map((v) => [v.productId, v])).values()];
  expect(byProduct.length).toBeGreaterThanOrEqual(2);
  a = { variantId: byProduct[0]!.id, productId: byProduct[0]!.productId, price: byProduct[0]!.priceHalalas };
  b = { variantId: byProduct[1]!.id, productId: byProduct[1]!.productId, price: byProduct[1]!.priceHalalas };
  await saveSetting("payments", { ...(await getSetting("payments")), codEnabled: true });
});
afterEach(() => vi.restoreAllMocks());

describe("automatic offers", () => {
  it("are applied in the quote, stored on the order, and stack with a coupon after the offer", async () => {
    vi.spyOn(transport, "email").mockResolvedValue({ ok: true });
    vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
    const [bundle] = await db.insert(schema.promotions).values({ nameAr: "باقة التوفير", nameEn: "Saver bundle", type: "bundle", productIds: [a.productId, b.productId], percentOff: 20 }).returning();
    await db.insert(schema.promotions).values({ nameAr: "منتهي", nameEn: "Ended", type: "quantity", productIds: [], minQuantity: 1, percentOff: 50, endsAt: new Date(Date.now() - 1000) });
    await db.insert(schema.coupons).values({ code: "AFTER10", type: "percent", value: 10 });

    const q = await buildQuote({ items: [{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }], couponCode: "AFTER10" });
    const offer = Math.floor(((a.price + b.price) * 20) / 100);
    expect(q.offers).toEqual([{ id: bundle!.id, nameAr: "باقة التوفير", nameEn: "Saver bundle", amountHalalas: offer }]);
    const coupon = Math.floor(((a.price + b.price - offer) * 10) / 100);
    expect(q.totals.couponDiscountHalalas).toBe(coupon);

    const r = await placeOrder(order([{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }], { couponCode: "AFTER10" }));
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, r.orderNumber));
    expect(o!.offers).toHaveLength(1);
    expect(o!.discountHalalas).toBe(offer + coupon);
    expect(o!.totalHalalas).toBe(q.totals.totalHalalas);

    expect((await promotionsForProduct(a.productId)).map((p) => p.id)).toEqual([bundle!.id]); // the ended one is hidden
    await db.update(schema.promotions).set({ active: false }).where(eq(schema.promotions.id, bundle!.id));
    expect((await buildQuote({ items: [{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }] })).offers).toEqual([]);
  });
});

describe("recommendations", () => {
  it("say 'bought together' only once real orders back it up", async () => {
    await db.delete(schema.orderItems);
    vi.spyOn(transport, "email").mockResolvedValue({ ok: true });
    vi.spyOn(transport, "telegram").mockResolvedValue({ ok: true });
    const all = await listPublishedProducts();
    const pa = all.find((p) => p.id === a.productId)!;
    expect((await recommendationsFor(pa, all)).kind).toBe("related");
    await placeOrder(order([{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }]));
    expect((await recommendationsFor(pa, all)).kind).toBe("related"); // one order is not a pattern
    await placeOrder(order([{ variantId: a.variantId, quantity: 1 }, { variantId: b.variantId, quantity: 1 }]));
    const recs = await recommendationsFor(pa, all);
    expect(recs.kind).toBe("bought_together");
    expect(recs.products[0]!.id).toBe(b.productId);
  });
});
