"use server";
import { revalidatePath } from "next/cache";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Tx } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { addOrderEvent, canTransition, releaseOrderStock, type OrderStatus } from "@/services/orders";
import { audit } from "@/services/audit";
import { getOnlineProvider } from "@/services/payments/registry";
import { applyPaymentState } from "@/services/payments/apply";
import { getShippingProvider } from "@/services/shipping/registry";
import { aramexShipping } from "@/services/shipping/aramex";
import { getSetting } from "@/services/settings";
import { parseSARToHalalas } from "@/lib/money";
import type { ActionState } from "@/components/admin/ui";
import ar from "@/i18n/ar";
import { notifyOrder } from "@/services/notify";
import { runAfterResponse } from "@/lib/after";
import { sendBackInStockAlerts } from "@/services/stock-alerts";
import { paymentProviderOnShipped } from "@/services/payments/shipped";
import type { OrderEmailKind } from "@/services/notify/templates";

const idSchema = z.uuid();
const done = (id: string, message: string): ActionState => {
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true, message };
};

export async function updateOrderStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const to = String(fd.get("status")) as OrderStatus;
  const notify = fd.get("public") === "on";
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) return { ok: false, message: "الطلب غير موجود." };
  if (!canTransition(o.status, to)) return { ok: false, message: `لا يمكن نقل الطلب من «${ar.status[o.status]}» إلى «${ar.status[to] ?? to}».` };
  if (to === "shipped" && o.paymentStatus !== "paid" && o.paymentStatus !== "cod_pending" && o.paymentStatus !== "cod_collected") {
    return { ok: false, message: "لا يمكن شحن طلب غير مدفوع." };
  }
  await (db as unknown as Tx).transaction(async (tx) => {
    await tx.update(schema.orders).set({ status: to, updatedAt: new Date(), ...(to === "cancelled" ? { cancelledAt: new Date() } : {}), ...(to === "delivered" ? { deliveredAt: new Date() } : {}) }).where(eq(schema.orders.id, id));
    if (to === "cancelled") await releaseOrderStock(tx, id, "إلغاء من الإدارة");
    if (to === "delivered") {
      await tx.update(schema.shipments).set({ status: "delivered", updatedAt: new Date() }).where(eq(schema.shipments.orderId, id));
    }
    await addOrderEvent(tx, { orderId: id, type: "status", message: `تغيّرت الحالة إلى: ${ar.status[to]}`, internal: !notify && to !== "shipped" && to !== "delivered" && to !== "cancelled", actorId: admin.userId, actorName: admin.name });
  });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.status", entity: "order", entityId: id, meta: { from: o.status, to } });
  const mailKind: OrderEmailKind | null =
    to === "shipped" ? "order_shipped" : to === "delivered" ? "order_delivered" : to === "cancelled" && !["pending_payment", "payment_failed"].includes(o.status) ? "order_cancelled" : null;
  const sendEmail = fd.has("emailToggle") ? fd.get("email") === "on" : true;
  if (mailKind && sendEmail) await runAfterResponse(() => notifyOrder(id, mailKind));
  if (to === "cancelled") await runAfterResponse(() => sendBackInStockAlerts());
  if (to === "shipped") await runAfterResponse(() => paymentProviderOnShipped(id));
  const warn = to === "cancelled" && o.paymentStatus === "paid" ? " الطلب مدفوع: نفّذ الاسترجاع من قسم الدفع." : "";
  return done(id, "حُدّثت حالة الطلب." + warn);
}

export async function addOrderNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 2000);
  if (note.length < 2) return { ok: false, message: "اكتب الملاحظة." };
  const db = await getDb();
  await addOrderEvent(db, { orderId: id, type: "note", message: note, internal: true, actorId: admin.userId, actorName: admin.name });
  return done(id, "أُضيفت الملاحظة الداخلية.");
}

export async function saveManualShipment(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const tracking = String(fd.get("trackingNumber") ?? "").trim().slice(0, 60);
  const carrier = String(fd.get("carrierName") ?? "").trim().slice(0, 60);
  const url = String(fd.get("trackingUrl") ?? "").trim().slice(0, 400);
  if (!tracking) return { ok: false, message: "أدخل رقم التتبع كما أصدرته شركة الشحن." };
  if (url && !/^https:\/\//.test(url)) return { ok: false, message: "رابط التتبع يجب أن يبدأ بـ https://" };
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) return { ok: false, message: "الطلب غير موجود." };
  if (!["confirmed", "processing", "shipped"].includes(o.status)) return { ok: false, message: "يمكن إضافة الشحنة للطلبات المؤكدة فقط." };
  await (db as unknown as Tx).transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.shipments).where(eq(schema.shipments.orderId, id)).orderBy(desc(schema.shipments.createdAt)).limit(1);
    if (existing && existing.provider === "manual") {
      await tx.update(schema.shipments).set({ trackingNumber: tracking, carrierName: carrier || null, trackingUrl: url || null, status: "in_transit", updatedAt: new Date() }).where(eq(schema.shipments.id, existing.id));
    } else {
      await tx.insert(schema.shipments).values({ orderId: id, provider: "manual", trackingNumber: tracking, carrierName: carrier || null, trackingUrl: url || null, status: "in_transit" });
    }
    if (o.status !== "shipped") await tx.update(schema.orders).set({ status: "shipped", updatedAt: new Date() }).where(eq(schema.orders.id, id));
    await addOrderEvent(tx, { orderId: id, type: "shipment", message: `شُحن الطلب${carrier ? ` عبر ${carrier}` : ""} — رقم التتبع ${tracking}`, internal: false, actorId: admin.userId, actorName: admin.name });
  });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.shipment_manual", entity: "order", entityId: id, meta: { tracking } });
  if (o.status !== "shipped") {
    await runAfterResponse(() => notifyOrder(id, "order_shipped"));
    await runAfterResponse(() => paymentProviderOnShipped(id));
  }
  return done(id, "حُفظت بيانات الشحنة وأصبح الطلب «تم الشحن».");
}

export async function createAramexShipment(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  if (!aramexShipping.isConfigured()) return { ok: false, message: "حساب أرامكس غير مربوط. أضف متغيرات ARAMEX_* أو أدخل الشحنة يدويًا." };
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) return { ok: false, message: "الطلب غير موجود." };
  if (!["confirmed", "processing"].includes(o.status)) return { ok: false, message: "أنشئ الشحنة بعد تأكيد الطلب (مدفوع أو دفع عند الاستلام)." };
  const [existing] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id));
  if (existing?.trackingNumber) return { ok: false, message: "توجد شحنة لهذا الطلب بالفعل." };
  const ship = await getSetting("shipping");
  const store = await getSetting("store");
  if (!ship.originLine1 || !ship.originPhone) return { ok: false, message: "أكمل عنوان وهاتف المستودع في إعدادات الشحن أولًا." };
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
  const variantIds = items.map((i) => i.variantId).filter(Boolean) as string[];
  const variants = variantIds.length ? await db.select().from(schema.productVariants) : [];
  const weight = items.reduce((w, i) => w + (variants.find((v) => v.id === i.variantId)?.weightGrams ?? 300) * i.quantity, 0);
  try {
    const res = await aramexShipping.createShipment!({
      reference: o.number,
      shipper: { name: ship.originContactName || store.nameEn || "Store", phone: ship.originPhone, email: store.contactEmail, city: ship.originCity, line1: ship.originLine1 },
      consignee: {
        name: o.customerName,
        phone: o.phone,
        email: o.email,
        city: o.shippingAddress.city,
        line1: `${o.shippingAddress.street}, ${o.shippingAddress.district}`,
        line2: o.shippingAddress.nationalAddress ?? "",
        postalCode: o.shippingAddress.postalCode,
      },
      weightGrams: weight,
      pieces: 1,
      description: items.map((i) => `${i.nameEn} x${i.quantity}`).join(", "),
      codAmountHalalas: o.paymentStatus === "cod_pending" ? o.totalHalalas : null,
    });
    await (db as unknown as Tx).transaction(async (tx) => {
      await tx.insert(schema.shipments).values({ orderId: id, provider: "aramex", carrierName: "Aramex", trackingNumber: res.trackingNumber, labelUrl: res.labelUrl, status: "created" });
      await tx.update(schema.orders).set({ status: "shipped", shippingMethod: "aramex", updatedAt: new Date() }).where(eq(schema.orders.id, id));
      await addOrderEvent(tx, { orderId: id, type: "shipment", message: `أُنشئت شحنة أرامكس — رقم التتبع ${res.trackingNumber}`, internal: false, actorId: admin.userId, actorName: admin.name });
    });
    await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.shipment_aramex", entity: "order", entityId: id, meta: { tracking: res.trackingNumber } });
    await runAfterResponse(() => notifyOrder(id, "order_shipped"));
    await runAfterResponse(() => paymentProviderOnShipped(id));
    return done(id, `أُنشئت الشحنة: ${res.trackingNumber}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ غير معروف";
    await addOrderEvent(db, { orderId: id, type: "shipment", message: `فشل إنشاء شحنة أرامكس: ${msg.slice(0, 300)}`, internal: true, actorId: admin.userId, actorName: admin.name });
    return { ok: false, message: `رفضت أرامكس الطلب: ${msg.slice(0, 200)}` };
  }
}

export async function syncShipment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const db = await getDb();
  const [s] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id)).orderBy(desc(schema.shipments.createdAt)).limit(1);
  if (!s?.trackingNumber) return { ok: false, message: "لا توجد شحنة برقم تتبع." };
  const provider = getShippingProvider(s.provider);
  if (!provider.track) return { ok: false, message: "التحديث التلقائي متاح لشحنات أرامكس المربوطة فقط. حدّث الحالة يدويًا." };
  try {
    const r = await provider.track(s.trackingNumber);
    await db.update(schema.shipments).set({ status: r.status, events: r.events, lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(schema.shipments.id, s.id));
    if (r.status === "delivered") {
      const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
      if (o && o.status === "shipped") {
        await db.update(schema.orders).set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, id));
        await addOrderEvent(db, { orderId: id, type: "status", message: "تم تسليم الطلب", internal: false });
        await runAfterResponse(() => notifyOrder(id, "order_delivered"));
      }
    }
    return done(id, `حُدّثت حالة الشحنة (${r.events.length} تحديث).`);
  } catch (e) {
    return { ok: false, message: `تعذّر جلب التتبع: ${(e instanceof Error ? e.message : "").slice(0, 160)}` };
  }
}

export async function markCodCollected(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o || o.paymentStatus !== "cod_pending") return { ok: false, message: "هذا الطلب ليس دفعًا عند الاستلام معلقًا." };
  await db.update(schema.orders).set({ paymentStatus: "cod_collected", paidAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, id));
  await db.update(schema.payments).set({ status: "cod_collected", updatedAt: new Date() }).where(eq(schema.payments.orderId, id));
  await addOrderEvent(db, { orderId: id, type: "payment", message: "تم تحصيل المبلغ عند الاستلام", internal: true, actorId: admin.userId, actorName: admin.name });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.cod_collected", entity: "order", entityId: id });
  return done(id, "سُجّل تحصيل المبلغ.");
}

export async function refundOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.refund");
  const id = idSchema.parse(fd.get("orderId"));
  const amount = parseSARToHalalas(String(fd.get("amount") ?? ""));
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  if (!amount || amount <= 0) return { ok: false, message: "أدخل مبلغ الاسترجاع." };
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  const paid = (await db.select().from(schema.payments).where(eq(schema.payments.orderId, id))).find((p) => p.status === "paid" || p.status === "partially_refunded") ?? null;
  if (!o || !paid) return { ok: false, message: "لا توجد دفعة إلكترونية مؤكدة لهذا الطلب." };
  const refundable = paid.amountHalalas - paid.refundedHalalas;
  if (amount > refundable) return { ok: false, message: `أقصى مبلغ قابل للاسترجاع ${refundable / 100} ر.س.` };
  const provider = getOnlineProvider(paid.provider);
  if (!provider?.refund || !paid.providerPaymentId) return { ok: false, message: "بوابة الدفع لا تدعم الاسترجاع الآلي لهذه الدفعة. نفّذه من لوحة البوابة ثم سجّله يدويًا." };
  const r = await provider.refund({ providerPaymentId: paid.providerPaymentId, amountHalalas: amount });
  await db.insert(schema.refunds).values({ paymentId: paid.id, amountHalalas: amount, reason, status: r.ok ? "succeeded" : "failed", actorId: admin.userId });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.refund", entity: "order", entityId: id, meta: { amount, ok: r.ok } });
  if (!r.ok) return { ok: false, message: `رفضت البوابة الاسترجاع: ${r.message?.slice(0, 160) ?? ""}` };
  const total = paid.refundedHalalas + amount;
  await applyPaymentState({
    paymentId: paid.id,
    state: { status: total >= paid.amountHalalas ? "refunded" : "partially_refunded", amountHalalas: paid.amountHalalas, currency: paid.currency, refundedHalalas: total },
    source: "admin",
  });
  if (total >= paid.amountHalalas) {
    await (db as unknown as Tx).transaction(async (tx) => {
      if (["confirmed", "processing"].includes(o.status)) await releaseOrderStock(tx, id, "استرجاع كامل قبل الشحن");
    });
  }
  return done(id, "تم الاسترجاع بنجاح.");
}

export async function refreshPaymentStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const db = await getDb();
  const ps = await db.select().from(schema.payments).where(eq(schema.payments.orderId, id)).orderBy(desc(schema.payments.createdAt));
  const p = ps.find((x) => x.providerRef && x.provider !== "cod");
  if (!p) return { ok: false, message: "لا توجد دفعة إلكترونية للتحقق منها." };
  const provider = getOnlineProvider(p.provider);
  if (!provider?.isConfigured()) return { ok: false, message: "بوابة الدفع غير مهيأة." };
  try {
    const state = await provider.fetchState(p.providerRef!, p.providerPaymentId);
    const r = await applyPaymentState({ paymentId: p.id, state, source: "sync" });
    return done(id, r === "applied" ? "حُدّثت حالة الدفع من البوابة." : r === "amount_mismatch" ? "المبلغ لدى البوابة لا يطابق الطلب — راجع السجل." : "لا تغيير في حالة الدفع.");
  } catch (e) {
    return { ok: false, message: `تعذّر الاتصال بالبوابة: ${(e instanceof Error ? e.message : "").slice(0, 160)}` };
  }
}

const resendKinds = ["order_confirmed", "order_shipped", "order_delivered", "order_cancelled"] as const;

/** Re-sends a customer email (e.g. after fixing email settings or a typo in the address). */
export async function resendOrderEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = idSchema.parse(fd.get("orderId"));
  const kind = z.enum(resendKinds).parse(fd.get("kind"));
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) return { ok: false, message: "الطلب غير موجود." };
  if (!o.email) return { ok: false, message: "لم يُدخل العميل بريدًا إلكترونيًا لهذا الطلب." };
  await notifyOrder(id, kind, { force: true, only: "customer" });
  const [last] = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.orderId, id))
    .orderBy(desc(schema.notifications.updatedAt))
    .limit(1);
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.email_resend", entity: "order", entityId: id, meta: { kind } });
  revalidatePath(`/admin/orders/${id}`);
  if (last?.status === "sent") return { ok: true, message: "أُرسل البريد للعميل." };
  if (last?.error === "not_configured") return { ok: false, message: "البريد غير مهيأ: أضف RESEND_API_KEY و EMAIL_FROM في متغيرات البيئة." };
  return { ok: false, message: `تعذّر الإرسال: ${last?.error ?? "غير معروف"}` };
}
