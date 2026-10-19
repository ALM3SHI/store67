import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { getSettings } from "@/services/settings";
import { customerOrderLink } from "@/services/order-links";
import { smsConfigured, telegramConfigured, transport, type SendResult } from "./transport";
import { renderAdminNewOrder, renderOrderEmail, renderOrderSms, type OrderEmailKind } from "./templates";

export { emailConfigured, telegramConfigured, smsConfigured } from "./transport";

type Channel = "email" | "telegram" | "sms";

/**
 * Sends one message at most once per (order, kind, channel, recipient). The row
 * is claimed before the network call, so a webhook and a browser redirect that
 * confirm the same payment at the same moment can't both send it.
 * `force` re-sends (admin "resend" button).
 */
async function deliver(
  conn: DbOrTx,
  key: { orderId: string | null; kind: string; channel: Channel; recipient: string },
  send: () => Promise<SendResult>,
  force = false,
): Promise<SendResult> {
  let rowId: string | undefined;
  if (key.orderId) {
    const [claimed] = await conn
      .insert(schema.notifications)
      .values({ ...key, status: "sending" })
      .onConflictDoNothing()
      .returning({ id: schema.notifications.id });
    if (claimed) rowId = claimed.id;
    else if (force) {
      const [row] = await conn
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.orderId, key.orderId),
            eq(schema.notifications.kind, key.kind),
            eq(schema.notifications.channel, key.channel),
            eq(schema.notifications.recipient, key.recipient),
          ),
        );
      rowId = row?.id;
    } else return { ok: false, error: "already_sent", skipped: true };
  } else {
    const [row] = await conn.insert(schema.notifications).values({ ...key, status: "sending" }).returning({ id: schema.notifications.id });
    rowId = row?.id;
  }

  let result: SendResult;
  try {
    result = await send();
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!result.ok && !result.skipped) {
    const { reportError } = await import("@/services/monitoring");
    await reportError("notify", new Error(`${key.channel} ${key.kind}: ${result.error}`), { alert: false });
  }
  if (rowId) {
    await conn
      .update(schema.notifications)
      .set({
        status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        error: result.ok ? null : result.error,
        providerId: result.ok ? (result.id ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.notifications.id, rowId));
  }
  return result;
}

export const adminRecipients = (csv: string) =>
  csv
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Admin alerts (email list + Telegram) without an order, e.g. errors or tests. */
export async function sendAdminAlert(kind: string, msg: { subject: string; text: string; html: string }, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const { notifications } = await getSettings(["notifications"], conn);
  const results: { channel: Channel; recipient: string; result: SendResult }[] = [];
  for (const to of adminRecipients(notifications.adminEmails)) {
    results.push({ channel: "email", recipient: to, result: await deliver(conn, { orderId: null, kind, channel: "email", recipient: to }, () => transport.email({ to, ...msg })) });
  }
  results.push({
    channel: "telegram",
    recipient: "chat",
    result: telegramConfigured()
      ? await deliver(conn, { orderId: null, kind, channel: "telegram", recipient: "chat" }, () => transport.telegram(msg.text))
      : await transport.telegram(msg.text),
  });
  return results;
}

const customerKinds: OrderEmailKind[] = ["order_confirmed", "order_shipped", "order_delivered", "order_cancelled"];

/**
 * Tells the customer (and, for a new order, the team) about an order change.
 * Never throws: a mail outage must not break checkout or the admin action
 * that triggered it. Failures are recorded on the order's notification log.
 */
export async function notifyOrder(orderId: string, kind: OrderEmailKind, opts: { db?: DbOrTx; force?: boolean; only?: "customer" | "admin" } = {}) {
  try {
    const conn = opts.db ?? (await getDb());
    const [order] = await conn.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    if (!order) return;
    const { notifications, store } = await getSettings(["notifications", "store"], conn);
    const items = await conn.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    const L = order.locale === "en" ? "en" : "ar";
    const storeName = (L === "ar" ? store.nameAr : store.nameEn) || (L === "ar" ? brand.nameAr : brand.name);

    if (opts.only !== "admin" && notifications.customerEmails && order.email && customerKinds.includes(kind)) {
      const [shipment] = await conn.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(desc(schema.shipments.createdAt)).limit(1);
      const { shipping } = await getSettings(["shipping"], conn);
      const trackingUrl =
        shipment?.trackingUrl ||
        (shipment?.trackingNumber && shipping.trackingUrlTemplate ? shipping.trackingUrlTemplate.replace("{tracking}", encodeURIComponent(shipment.trackingNumber)) : null);
      const mail = renderOrderEmail(kind, {
        number: order.number,
        locale: L,
        customerName: order.customerName,
        createdAt: order.createdAt,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        items: items.map((i) => ({ name: L === "ar" ? i.nameAr : i.nameEn, variant: L === "ar" ? i.variantNameAr : i.variantNameEn, quantity: i.quantity, lineTotalHalalas: i.lineTotalHalalas })),
        subtotalHalalas: order.subtotalHalalas,
        discountHalalas: order.discountHalalas,
        shippingHalalas: order.shippingHalalas,
        codFeeHalalas: order.codFeeHalalas,
        taxHalalas: order.taxHalalas,
        totalHalalas: order.totalHalalas,
        pricesIncludeTax: order.pricesIncludeTax,
        address: order.shippingAddress,
        orderLink: customerOrderLink(order),
        tracking: shipment?.trackingNumber ? { number: shipment.trackingNumber, carrier: shipment.carrierName, url: trackingUrl } : null,
        store: { name: storeName, email: store.contactEmail, phone: store.contactPhone, whatsapp: store.whatsapp },
      });
      const to = order.email.toLowerCase();
      await deliver(conn, { orderId, kind, channel: "email", recipient: to }, () => transport.email({ to, ...mail }), opts.force);
    }

    // SMS only for the two messages that matter most, and only when switched on (each SMS costs money).
    if (opts.only !== "admin" && notifications.customerSms && smsConfigured() && (kind === "order_confirmed" || kind === "order_shipped")) {
      const [shipment] = kind === "order_shipped" ? await conn.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId)).orderBy(desc(schema.shipments.createdAt)).limit(1) : [];
      const text = renderOrderSms(kind, { locale: L, number: order.number, storeName, link: customerOrderLink(order), tracking: shipment?.trackingNumber ?? null });
      await deliver(conn, { orderId, kind, channel: "sms", recipient: order.phone }, () => transport.sms(order.phone, text), opts.force);
    }

    if (opts.only !== "customer" && kind === "order_confirmed" && notifications.newOrderAlerts) {
      const alert = renderAdminNewOrder({
        number: order.number,
        totalHalalas: order.totalHalalas,
        paymentMethod: order.paymentMethod,
        city: order.shippingAddress.city,
        customerName: order.customerName,
        items: items.map((i) => ({ name: i.nameAr, quantity: i.quantity })),
        adminLink: `${env.appUrl}/admin/orders/${order.id}`,
        storeName: store.nameAr || brand.nameAr,
      });
      for (const to of adminRecipients(notifications.adminEmails)) {
        await deliver(conn, { orderId, kind: "admin_new_order", channel: "email", recipient: to }, () => transport.email({ to, ...alert }), opts.force);
      }
      if (telegramConfigured()) {
        await deliver(conn, { orderId, kind: "admin_new_order", channel: "telegram", recipient: "chat" }, () => transport.telegram(alert.text), opts.force);
      } else await transport.telegram(alert.text); // logs to the console in development

    }
  } catch (e) {
    console.error("[notify] order notification failed:", kind, e instanceof Error ? e.message : e);
  }
}

export async function listOrderNotifications(orderId: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  return conn.select().from(schema.notifications).where(eq(schema.notifications.orderId, orderId)).orderBy(desc(schema.notifications.createdAt));
}

/** Direct email that is not tied to an order (password reset). */
export async function sendEmailLogged(kind: string, to: string, msg: { subject: string; text: string; html: string }, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  return deliver(conn, { orderId: null, kind, channel: "email", recipient: to.toLowerCase() }, () => transport.email({ to, ...msg }));
}
