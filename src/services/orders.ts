import "server-only";
import { and, eq, inArray, lt, sql, desc } from "drizzle-orm";
import { getDb, schema, type DbOrTx, type Tx } from "@/lib/db";
import { safeEqual, sha256 } from "@/lib/crypto";

type OrderRow = typeof schema.orders.$inferSelect;
export type OrderStatus = OrderRow["status"];

export async function addOrderEvent(
  conn: DbOrTx,
  e: { orderId: string; type: string; message: string; internal?: boolean; actorId?: string | null; actorName?: string | null },
) {
  await conn.insert(schema.orderEvents).values({
    orderId: e.orderId,
    type: e.type,
    message: e.message,
    internal: e.internal ?? true,
    actorId: e.actorId ?? null,
    actorName: e.actorName ?? null,
  });
}

/** Returns reserved stock (and the coupon use) of an order exactly once. */
export async function releaseOrderStock(tx: Tx, orderId: string, reason: string): Promise<boolean> {
  const [locked] = await tx
    .update(schema.orders)
    .set({ stockReleased: true, updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.stockReleased, false)))
    .returning({ id: schema.orders.id, couponCode: schema.orders.couponCode });
  if (!locked) return false; // already released

  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  for (const it of items) {
    if (!it.variantId) continue;
    const [v] = await tx
      .update(schema.productVariants)
      .set({ stock: sql`${schema.productVariants.stock} + ${it.quantity}`, updatedAt: new Date() })
      .where(and(eq(schema.productVariants.id, it.variantId), eq(schema.productVariants.trackInventory, true)))
      .returning({ id: schema.productVariants.id });
    if (v) await tx.insert(schema.inventoryMovements).values({ variantId: it.variantId, delta: it.quantity, reason: "release", orderId });
  }

  const [red] = await tx.delete(schema.couponRedemptions).where(eq(schema.couponRedemptions.orderId, orderId)).returning();
  if (red) {
    await tx
      .update(schema.coupons)
      .set({ usedCount: sql`greatest(${schema.coupons.usedCount} - 1, 0)` })
      .where(eq(schema.coupons.id, red.couponId));
  }
  await addOrderEvent(tx, { orderId, type: "system", message: `أُعيد المخزون المحجوز (${reason})` });
  return true;
}

/**
 * A payment arrived for an order whose reservation had already been released
 * (e.g. paid after the hold expired). Try to take the stock again; if it is
 * no longer available, flag the order for the team rather than overselling.
 */
export async function reReserveStock(tx: Tx, orderId: string): Promise<boolean> {
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  for (const it of items) {
    if (!it.variantId) continue;
    const [v] = await tx.select().from(schema.productVariants).where(eq(schema.productVariants.id, it.variantId));
    if (v && v.trackInventory && v.stock < it.quantity) return false;
  }
  for (const it of items) {
    if (!it.variantId) continue;
    const [v] = await tx
      .update(schema.productVariants)
      .set({ stock: sql`${schema.productVariants.stock} - ${it.quantity}`, updatedAt: new Date() })
      .where(and(eq(schema.productVariants.id, it.variantId), eq(schema.productVariants.trackInventory, true)))
      .returning({ id: schema.productVariants.id });
    if (v) await tx.insert(schema.inventoryMovements).values({ variantId: it.variantId, delta: -it.quantity, reason: "order", orderId });
  }
  await tx.update(schema.orders).set({ stockReleased: false }).where(eq(schema.orders.id, orderId));
  return true;
}

/** Cancels unpaid online orders whose stock hold has expired. Safe to run often. */
export async function expireStaleOrders(now = new Date(), db?: DbOrTx): Promise<number> {
  const conn = db ?? (await getDb());
  const stale = await conn
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, ["pending_payment", "payment_failed"]), lt(schema.orders.reservedUntil, now)))
    .limit(200);
  let n = 0;
  for (const o of stale) {
    await (conn as Tx).transaction(async (tx) => {
      const [upd] = await tx
        .update(schema.orders)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(and(eq(schema.orders.id, o.id), inArray(schema.orders.status, ["pending_payment", "payment_failed"])))
        .returning({ id: schema.orders.id });
      if (!upd) return;
      await tx
        .update(schema.payments)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(schema.payments.orderId, o.id), inArray(schema.payments.status, ["initiated", "pending", "failed"])));
      await releaseOrderStock(tx, o.id, "انتهت مهلة الدفع");
      await addOrderEvent(tx, { orderId: o.id, type: "status", message: "أُلغي الطلب تلقائيًا لانتهاء مهلة الدفع", internal: false });
      n++;
    });
  }
  return n;
}

export async function getOrderByNumber(number: string, db?: DbOrTx): Promise<OrderRow | null> {
  const conn = db ?? (await getDb());
  const [o] = await conn.select().from(schema.orders).where(eq(schema.orders.number, number.trim().toUpperCase())).limit(1);
  return o ?? null;
}

/** Guest access: the order number alone is never enough — the secret token is required. */
export async function getOrderForCustomer(number: string, token: string | undefined, db?: DbOrTx): Promise<OrderRow | null> {
  if (!token || token.length < 20) return null;
  const o = await getOrderByNumber(number, db);
  if (!o) return null;
  return safeEqual(o.accessTokenHash, sha256(token)) ? o : null;
}

/** Tracking lookup by order number + the phone used at checkout. */
export async function findOrderByNumberAndPhone(number: string, phoneE164: string, db?: DbOrTx): Promise<OrderRow | null> {
  const o = await getOrderByNumber(number, db);
  if (!o) return null;
  return safeEqual(o.phone, phoneE164) ? o : null;
}

export async function getOrderDetails(orderId: string, opts: { includeInternal: boolean }, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [items, events, payments, shipments] = await Promise.all([
    conn.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)),
    conn
      .select()
      .from(schema.orderEvents)
      .where(opts.includeInternal ? eq(schema.orderEvents.orderId, orderId) : and(eq(schema.orderEvents.orderId, orderId), eq(schema.orderEvents.internal, false)))
      .orderBy(desc(schema.orderEvents.createdAt)),
    conn.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).orderBy(desc(schema.payments.createdAt)),
    conn.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(desc(schema.shipments.createdAt)),
  ]);
  return { items, events, payments, shipments };
}

/** Allowed manual status changes in the admin. */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  payment_failed: ["cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return STATUS_TRANSITIONS[from].includes(to);
}
