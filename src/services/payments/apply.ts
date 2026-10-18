import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx, type Tx } from "@/lib/db";
import { addOrderEvent, reReserveStock } from "@/services/orders";
import type { ProviderPaymentState } from "./types";

export type ApplyResult = "applied" | "duplicate_event" | "no_change" | "amount_mismatch" | "not_found";

/**
 * The single place where a gateway result changes an order. Idempotent:
 *  - an event id is recorded once (primary key on provider+event_id);
 *  - the payment row is locked and terminal states are never re-applied;
 *  - "paid" is accepted only when amount and currency match what we charged.
 */
export async function applyPaymentState(args: {
  paymentId: string;
  state: ProviderPaymentState;
  eventId?: string;
  eventType?: string;
  source: "webhook" | "return" | "admin" | "sync";
  payload?: unknown;
  db?: DbOrTx;
}): Promise<ApplyResult> {
  const conn = args.db ?? (await getDb());
  return (conn as Tx).transaction(async (tx) => {
    const [payment] = await tx.select().from(schema.payments).where(eq(schema.payments.id, args.paymentId)).for("update");
    if (!payment) return "not_found";

    if (args.eventId) {
      const inserted = await tx
        .insert(schema.paymentEvents)
        .values({
          provider: payment.provider,
          eventId: args.eventId,
          type: args.eventType ?? args.state.status,
          paymentId: payment.id,
          payload: (args.payload ?? null) as never,
        })
        .onConflictDoNothing()
        .returning({ id: schema.paymentEvents.eventId });
      if (inserted.length === 0) return "duplicate_event";
    }

    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, payment.orderId)).for("update");
    if (!order) return "not_found";
    const now = new Date();
    const s = args.state;

    if (s.status === "paid") {
      if (payment.status === "paid" || payment.status === "refunded" || payment.status === "partially_refunded") return "no_change";
      if (s.amountHalalas !== payment.amountHalalas || s.currency.toUpperCase() !== payment.currency) {
        await addOrderEvent(tx, {
          orderId: order.id,
          type: "payment",
          message: `تنبيه: وصل إشعار دفع بمبلغ ${s.amountHalalas / 100} ${s.currency} لا يطابق مبلغ الطلب ${payment.amountHalalas / 100} — لم يُعتمد. راجع بوابة الدفع.`,
        });
        return "amount_mismatch";
      }
      await tx
        .update(schema.payments)
        .set({
          status: "paid",
          providerPaymentId: s.providerPaymentId ?? payment.providerPaymentId,
          method: s.method ?? payment.method,
          live: s.live ?? payment.live,
          failureReason: null,
          updatedAt: now,
        })
        .where(eq(schema.payments.id, payment.id));

      let stockOk = true;
      if (order.stockReleased) stockOk = await reReserveStock(tx, order.id);

      const wasCancelled = order.status === "cancelled";
      await tx
        .update(schema.orders)
        .set({
          paymentStatus: "paid",
          status: ["pending_payment", "payment_failed", "cancelled"].includes(order.status) ? "confirmed" : order.status,
          paidAt: now,
          cancelledAt: null,
          reservedUntil: null,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, order.id));
      await addOrderEvent(tx, { orderId: order.id, type: "payment", message: "تم تأكيد الدفع", internal: false });
      if (wasCancelled || !stockOk) {
        await addOrderEvent(tx, {
          orderId: order.id,
          type: "system",
          message: stockOk
            ? "وصل الدفع بعد إلغاء الطلب تلقائيًا؛ أُعيد تفعيله وحُجز المخزون مجددًا."
            : "وصل الدفع بعد انتهاء المهلة ولم يعد المخزون كافيًا — يلزم تواصل مع العميل أو استرجاع المبلغ.",
        });
      }
      return "applied";
    }

    if (s.status === "failed" || s.status === "cancelled") {
      if (payment.status === "paid" || payment.status === "refunded") return "no_change";
      const newStatus = s.status === "failed" ? "failed" : "cancelled";
      if (payment.status === newStatus) return "no_change";
      await tx
        .update(schema.payments)
        .set({ status: newStatus, failureReason: s.failureReason ?? null, providerPaymentId: s.providerPaymentId ?? payment.providerPaymentId, updatedAt: now })
        .where(eq(schema.payments.id, payment.id));
      if (order.status === "pending_payment") {
        // Stock stays reserved until `reservedUntil` so the customer can retry.
        await tx
          .update(schema.orders)
          .set({ status: "payment_failed", paymentStatus: newStatus, updatedAt: now })
          .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "pending_payment")));
      }
      await addOrderEvent(tx, {
        orderId: order.id,
        type: "payment",
        message: s.status === "failed" ? `فشلت محاولة الدفع${s.failureReason ? `: ${s.failureReason}` : ""}` : "أُلغيت محاولة الدفع",
        internal: false,
      });
      return "applied";
    }

    if (s.status === "refunded" || s.status === "partially_refunded") {
      const refunded = s.refundedHalalas ?? (s.status === "refunded" ? payment.amountHalalas : payment.refundedHalalas);
      if (payment.status === s.status && payment.refundedHalalas === refunded) return "no_change";
      await tx
        .update(schema.payments)
        .set({ status: s.status, refundedHalalas: refunded, updatedAt: now })
        .where(eq(schema.payments.id, payment.id));
      await tx
        .update(schema.orders)
        .set({ paymentStatus: s.status, status: s.status === "refunded" ? "refunded" : order.status, updatedAt: now })
        .where(eq(schema.orders.id, order.id));
      await addOrderEvent(tx, { orderId: order.id, type: "payment", message: `استرجاع مبلغ ${refunded / 100} ر.س`, internal: false });
      return "applied";
    }

    // pending: just remember gateway identifiers
    if (s.providerPaymentId && s.providerPaymentId !== payment.providerPaymentId) {
      await tx
        .update(schema.payments)
        .set({ providerPaymentId: s.providerPaymentId, status: "pending", updatedAt: now })
        .where(eq(schema.payments.id, payment.id));
      return "applied";
    }
    return "no_change";
  });
}

export async function findPaymentByRef(provider: string, providerRef: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [p] = await conn
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.provider, provider), eq(schema.payments.providerRef, providerRef)))
    .limit(1);
  return p ?? null;
}

export async function countPaymentEvents(provider: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [r] = await conn.select({ n: sql<number>`count(*)::int` }).from(schema.paymentEvents).where(eq(schema.paymentEvents.provider, provider));
  return r?.n ?? 0;
}
