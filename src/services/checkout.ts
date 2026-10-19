import "server-only";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx, type Tx } from "@/lib/db";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { orderNumber, sha256 } from "@/lib/crypto";
import { accessTokenFor, orderUrl } from "@/services/order-links";
import { randomUUID } from "node:crypto";
import { checkoutSchema, type CheckoutData } from "@/schemas/checkout";
import { buildQuote } from "@/services/quote";
import { getSettings } from "@/services/settings";
import { addOrderEvent, expireStaleOrders, releaseOrderStock } from "@/services/orders";
import { getOnlineProvider } from "@/services/payments/registry";
import { cityLabel } from "@/lib/saudi-cities";
import { notifyOrder } from "@/services/notify";
import { runAfterResponse } from "@/lib/after";
import { reportError } from "@/services/monitoring";

export type CheckoutErrorCode =
  | "invalid_input"
  | "empty_cart"
  | "out_of_stock"
  | "price_changed"
  | "coupon_invalid"
  | "payment_unavailable"
  | "shipping_unavailable"
  | "payment_provider_error";

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "CheckoutError";
  }
}

export type CheckoutResult = {
  orderNumber: string;
  /** Raw access token — returned once and placed in the confirmation link */
  accessToken: string;
  redirectUrl: string;
  totalHalalas: number;
};

export { accessTokenFor, orderUrl } from "@/services/order-links";

/**
 * Creates an order from untrusted input. Prices, stock, discounts, shipping
 * and tax are all recomputed here — anything totals-related coming from the
 * browser is ignored.
 */
export async function placeOrder(raw: unknown, opts: { db?: DbOrTx; now?: Date; customerId?: string } = {}): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) throw new CheckoutError("invalid_input", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const input: CheckoutData = parsed.data;
  const conn = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();

  // Idempotency: a double-click or a network retry returns the same order.
  const [existing] = await conn.select().from(schema.orders).where(eq(schema.orders.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing) {
    const token = accessTokenFor(existing.id, input.idempotencyKey);
    const [pay] = await conn.select().from(schema.payments).where(eq(schema.payments.orderId, existing.id)).limit(1);
    return {
      orderNumber: existing.number,
      accessToken: token,
      redirectUrl: existing.status === "pending_payment" && pay?.checkoutUrl ? pay.checkoutUrl : orderUrl(existing.locale, existing.number, token),
      totalHalalas: existing.totalHalalas,
    };
  }

  await expireStaleOrders(now, conn).catch(() => 0);

  const quote = await buildQuote(
    {
      items: input.items,
      couponCode: input.couponCode || undefined,
      city: input.address.city,
      paymentMethod: input.paymentMethod,
      phone: input.customer.phone,
    },
    { db: conn, now },
  );

  if (quote.removedVariantIds.length || quote.lines.some((l) => l.issue !== null)) {
    throw new CheckoutError(
      "out_of_stock",
      quote.lines.filter((l) => l.issue).map((l) => ({ variantId: l.variantId, available: l.maxQuantity, issue: l.issue })),
    );
  }
  const lines = quote.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new CheckoutError("empty_cart");
  if (input.couponCode && !quote.coupon?.applied) throw new CheckoutError("coupon_invalid", quote.coupon?.error);
  if (quote.shipping.amountHalalas === null) throw new CheckoutError("shipping_unavailable");

  const method = quote.paymentMethods.find((m) => m.id === input.paymentMethod);
  if (!method) throw new CheckoutError("payment_unavailable");

  const { commerce, shipping } = await getSettings(["commerce", "shipping"], conn);
  if (shipping.cities.length && !shipping.cities.includes(input.address.city)) throw new CheckoutError("shipping_unavailable");

  const orderId = randomUUID();
  const token = accessTokenFor(orderId, input.idempotencyKey);
  const isCod = method.id === "cod";
  const t = quote.totals;

  const order = await (conn as Tx).transaction(async (tx) => {
    // Atomic stock reservation: the WHERE clause refuses to go below zero, so
    // concurrent checkouts can never oversell.
    for (const l of lines) {
      if (!l.trackInventory) continue;
      const [ok] = await tx
        .update(schema.productVariants)
        .set({ stock: sql`${schema.productVariants.stock} - ${l.quantity}`, updatedAt: now })
        .where(and(eq(schema.productVariants.id, l.variantId), gte(schema.productVariants.stock, l.quantity)))
        .returning({ id: schema.productVariants.id });
      if (!ok) throw new CheckoutError("out_of_stock", [{ variantId: l.variantId }]);
    }

    // Signed-in customers: the order belongs to their account. Guests: one record per mobile number.
    const [customer] = opts.customerId
      ? await tx
          .update(schema.customers)
          .set({
            name: sql`case when ${schema.customers.name} = '' then ${input.customer.name} else ${schema.customers.name} end`,
            email: sql`coalesce(${schema.customers.email}, ${input.customer.email || null})`,
            updatedAt: now,
          })
          .where(eq(schema.customers.id, opts.customerId))
          .returning()
      : await tx
          .insert(schema.customers)
          .values({ phone: input.customer.phone, name: input.customer.name, email: input.customer.email || null })
          .onConflictDoUpdate({
            target: schema.customers.phone,
            set: { name: input.customer.name, email: sql`coalesce(${input.customer.email || null}, ${schema.customers.email})`, updatedAt: now },
          })
          .returning();
    if (!customer) throw new CheckoutError("invalid_input");

    let number = orderNumber(brand.orderPrefix);
    for (let i = 0; i < 3; i++) {
      const [clash] = await tx.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.number, number));
      if (!clash) break;
      number = orderNumber(brand.orderPrefix);
    }

    const [o] = await tx
      .insert(schema.orders)
      .values({
        id: orderId,
        number,
        accessTokenHash: sha256(token),
        idempotencyKey: input.idempotencyKey,
        customerId: customer!.id,
        status: isCod ? "confirmed" : "pending_payment",
        paymentStatus: isCod ? "cod_pending" : "initiated",
        paymentMethod: method.id,
        customerName: input.customer.name,
        phone: input.customer.phone,
        email: input.customer.email || null,
        shippingAddress: {
          city: input.address.city,
          district: input.address.district,
          street: input.address.street,
          nationalAddress: input.address.nationalAddress || undefined,
          postalCode: input.address.postalCode || undefined,
          notes: input.address.notes || undefined,
        },
        locale: input.locale,
        subtotalHalalas: t.subtotalHalalas,
        discountHalalas: t.discountHalalas,
        shippingHalalas: t.shippingHalalas,
        codFeeHalalas: t.codFeeHalalas,
        taxHalalas: t.taxHalalas,
        totalHalalas: t.totalHalalas,
        taxRateBps: quote.tax.enabled ? quote.tax.rateBps : 0,
        pricesIncludeTax: quote.tax.pricesIncludeTax,
        couponCode: quote.coupon?.applied ? quote.coupon.code : null,
        shippingMethod: quote.shipping.source === "aramex" ? "aramex" : "manual",
        customerNote: input.address.notes || null,
        reservedUntil: isCod ? null : new Date(now.getTime() + commerce.reservationMinutes * 60000),
      })
      .returning();

    await tx.insert(schema.orderItems).values(
      lines.map((l) => ({
        orderId: o!.id,
        productId: l.productId,
        variantId: l.variantId,
        sku: l.sku,
        nameAr: l.nameAr,
        nameEn: l.nameEn,
        variantNameAr: l.variantNameAr,
        variantNameEn: l.variantNameEn,
        imageUrl: l.imageUrl,
        unitPriceHalalas: l.unitPriceHalalas,
        quantity: l.quantity,
        lineTotalHalalas: l.lineTotalHalalas,
      })),
    );
    const tracked = lines.filter((l) => l.trackInventory);
    if (tracked.length) {
      await tx.insert(schema.inventoryMovements).values(tracked.map((l) => ({ variantId: l.variantId, delta: -l.quantity, reason: "order", orderId: o!.id })));
    }

    if (quote.coupon?.applied && quote.coupon.couponId) {
      const [c] = await tx
        .update(schema.coupons)
        .set({ usedCount: sql`${schema.coupons.usedCount} + 1` })
        .where(
          and(
            eq(schema.coupons.id, quote.coupon.couponId),
            or(isNull(schema.coupons.usageLimit), lt(schema.coupons.usedCount, schema.coupons.usageLimit)),
          ),
        )
        .returning({ id: schema.coupons.id });
      if (!c) throw new CheckoutError("coupon_invalid", "exhausted");
      await tx.insert(schema.couponRedemptions).values({ couponId: c.id, orderId: o!.id, phone: input.customer.phone });
    }

    // Online payments get their row when the gateway session is created (startPaymentSession).
    if (isCod) {
      await tx.insert(schema.payments).values({
        orderId: o!.id,
        provider: "cod",
        providerRef: `cod_${o!.id}`,
        status: "cod_pending",
        amountHalalas: t.totalHalalas,
        currency: "SAR",
        method: "cod",
      });
    }

    await addOrderEvent(tx, {
      orderId: o!.id,
      type: "status",
      message: isCod ? "تم استلام الطلب — الدفع عند الاستلام" : "تم إنشاء الطلب بانتظار الدفع",
      internal: false,
    });
    return o!;
  });

  if (isCod) {
    await runAfterResponse(() => notifyOrder(order.id, "order_confirmed", { db: opts.db }));
    return { orderNumber: order.number, accessToken: token, redirectUrl: orderUrl(order.locale, order.number, token), totalHalalas: order.totalHalalas };
  }

  // Online payment session — created after the order is safely stored.
  const redirectUrl = await startPaymentSession(order.id, token, conn);
  return { orderNumber: order.number, accessToken: token, redirectUrl, totalHalalas: order.totalHalalas };
}

/**
 * Creates (or recreates, for a retry) the gateway session for an unpaid order
 * and returns the URL to send the customer to.
 */
export async function startPaymentSession(orderId: string, accessToken: string, db?: DbOrTx): Promise<string> {
  const conn = db ?? (await getDb());
  const [order] = await conn.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) throw new CheckoutError("invalid_input");
  const provider = getOnlineProvider(order.paymentMethod);
  if (!provider || !provider.isConfigured()) throw new CheckoutError("payment_unavailable");

  const [payment] = await conn
    .insert(schema.payments)
    .values({ orderId: order.id, provider: provider.id, status: "initiated", amountHalalas: order.totalHalalas, currency: "SAR" })
    .returning();

  const back = orderUrl(order.locale, order.number, accessToken);
  try {
    const session = await provider.createSession({
      paymentId: payment!.id,
      orderNumber: order.number,
      amountHalalas: order.totalHalalas,
      currency: "SAR",
      locale: order.locale === "en" ? "en" : "ar",
      returnUrl: `${env.appUrl}/api/payments/return?p=${payment!.id}&o=${encodeURIComponent(order.number)}&t=${encodeURIComponent(accessToken)}`,
      cancelUrl: back,
      description: `${brand.name} — ${order.number}`,
    });
    await conn
      .update(schema.payments)
      .set({ providerRef: session.providerRef, checkoutUrl: session.checkoutUrl, status: "pending", updatedAt: new Date() })
      .where(eq(schema.payments.id, payment!.id));
    await conn.update(schema.orders).set({ paymentStatus: "pending", updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
    return session.checkoutUrl;
  } catch (e) {
    await reportError("payment", e, { path: "checkout: create payment session" });
    await conn
      .update(schema.payments)
      .set({ status: "failed", failureReason: "session_error", updatedAt: new Date() })
      .where(eq(schema.payments.id, payment!.id));
    await (conn as Tx).transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: "payment_failed", paymentStatus: "failed", updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
      await addOrderEvent(tx, { orderId: order.id, type: "payment", message: "تعذّر فتح صفحة الدفع لدى البوابة" });
    });
    throw new CheckoutError("payment_provider_error");
  }
}

/** Customer-initiated retry from the order page. */
export async function retryPayment(orderId: string, accessToken: string, now = new Date(), db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [order] = await conn.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order || !["pending_payment", "payment_failed"].includes(order.status)) throw new CheckoutError("invalid_input");
  if (order.stockReleased || (order.reservedUntil && order.reservedUntil < now)) {
    await (conn as Tx).transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: "cancelled", cancelledAt: now }).where(eq(schema.orders.id, order.id));
      await releaseOrderStock(tx, order.id, "انتهت مهلة الدفع");
    });
    throw new CheckoutError("invalid_input", "expired");
  }
  await conn.update(schema.orders).set({ status: "pending_payment", updatedAt: now }).where(eq(schema.orders.id, order.id));
  return startPaymentSession(order.id, accessToken, conn);
}

export function describeAddress(a: { city: string; district: string; street: string; nationalAddress?: string }, locale: "ar" | "en") {
  return [a.street, a.district, cityLabel(a.city, locale), a.nationalAddress].filter(Boolean).join(locale === "ar" ? "، " : ", ");
}
