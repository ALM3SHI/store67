import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DbOrTx, type Tx } from "@/lib/db";
import { orderNumber } from "@/lib/crypto";
import { getSetting } from "@/services/settings";
import { addOrderEvent } from "@/services/orders";
import { runAfterResponse } from "@/lib/after";

/* Return & exchange requests. The store decides every request by hand; nothing
   here promises a refund. Money goes back through the existing refund action on
   the order, so a request never moves money on its own. */

export const RETURN_REASONS = ["defective", "damaged", "wrong_item", "not_as_described", "size_fit", "changed_mind", "other"] as const;
export const RETURN_KINDS = ["return", "exchange"] as const;
export type ReturnStatus = "requested" | "approved" | "rejected" | "received" | "completed" | "cancelled";
export type ReturnReason = (typeof RETURN_REASONS)[number];
export type ReturnRequest = typeof schema.returnRequests.$inferSelect;
type OrderRow = typeof schema.orders.$inferSelect;

/** Requests that still hold their items (a new request can't claim them again). */
const HOLDING: ReturnStatus[] = ["requested", "approved", "received", "completed"];
export const RETURN_STATUS_AR: Record<ReturnStatus, string> = {
  requested: "قيد المراجعة",
  approved: "مقبول — بانتظار المنتج",
  rejected: "مرفوض",
  received: "استُلم المنتج",
  completed: "مكتمل",
  cancelled: "ألغاه العميل",
};
export const RETURN_REASON_AR: Record<ReturnReason, string> = {
  defective: "لا يعمل / به عيب",
  damaged: "وصل متضررًا",
  wrong_item: "منتج غير المطلوب",
  not_as_described: "لا يطابق الوصف",
  size_fit: "المقاس أو اللون",
  changed_mind: "غيّر رأيه",
  other: "سبب آخر",
};

export type ReturnWindow = { state: "open" | "closed" | "not_delivered" | "disabled"; deadline: Date | null; days: number };

export function returnWindow(order: Pick<OrderRow, "status" | "deliveredAt" | "updatedAt">, days: number, now = new Date()): ReturnWindow {
  if (days <= 0) return { state: "disabled", deadline: null, days };
  if (order.status !== "delivered") return { state: "not_delivered", deadline: null, days };
  const deadline = new Date((order.deliveredAt ?? order.updatedAt).getTime() + days * 86_400_000);
  return { state: now <= deadline ? "open" : "closed", deadline, days };
}

export async function listReturnsForOrder(orderId: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  return conn.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, orderId)).orderBy(desc(schema.returnRequests.createdAt));
}

/** How many of each order line are still free to request. */
export function remainingQuantities(items: { id: string; quantity: number }[], requests: Pick<ReturnRequest, "status" | "items">[]) {
  const left = new Map(items.map((i) => [i.id, i.quantity]));
  for (const r of requests) {
    if (!HOLDING.includes(r.status as ReturnStatus)) continue;
    for (const it of r.items) left.set(it.orderItemId, Math.max(0, (left.get(it.orderItemId) ?? 0) - it.quantity));
  }
  return left;
}

/** Everything the order page needs to show the returns section. */
export async function returnOverview(order: OrderRow, db?: DbOrTx, now = new Date()) {
  const conn = db ?? (await getDb());
  const [commerce, requests, items] = await Promise.all([
    getSetting("commerce", conn),
    listReturnsForOrder(order.id, conn),
    conn.select({ id: schema.orderItems.id, quantity: schema.orderItems.quantity }).from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
  ]);
  const window = returnWindow(order, commerce.returnsWindowDays, now);
  const remaining = remainingQuantities(items, requests);
  const anyLeft = [...remaining.values()].some((n) => n > 0);
  const pending = requests.some((r) => r.status === "requested");
  return { window, requests, remaining, anyLeft, pending, canRequest: window.state === "open" && anyLeft && !pending };
}

export const returnInputSchema = z
  .object({
    kind: z.enum(RETURN_KINDS),
    reason: z.enum(RETURN_REASONS),
    note: z.string().trim().max(1000).default(""),
    exchangeFor: z.string().trim().max(200).default(""),
    items: z.array(z.object({ orderItemId: z.uuid(), quantity: z.number().int().min(0).max(99) })).max(50),
  })
  .refine((v) => v.kind !== "exchange" || v.exchangeFor.length >= 2, { path: ["exchangeFor"], message: "exchangeFor" });
export type ReturnInput = z.input<typeof returnInputSchema>;
export type CreateReturnError = "window" | "items" | "pending" | "invalid" | "exchangeFor";

export async function createReturnRequest(
  orderId: string,
  raw: ReturnInput,
  opts: { customerId?: string | null; db?: DbOrTx; now?: Date } = {},
): Promise<{ ok: true; request: ReturnRequest } | { ok: false; error: CreateReturnError }> {
  const parsed = returnInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "exchangeFor") ? "exchangeFor" : "invalid" };
  const input = parsed.data;
  const conn = opts.db ?? (await getDb());
  const commerce = await getSetting("commerce", conn);

  const out = await (conn as Tx).transaction(async (tx) => {
    // Lock the order so two submissions can't both claim the same items.
    const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
    if (!order) return { ok: false as const, error: "invalid" as const };
    if (returnWindow(order, commerce.returnsWindowDays, opts.now).state !== "open") return { ok: false as const, error: "window" as const };
    const existing = await tx.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, orderId));
    if (existing.some((r) => r.status === "requested")) return { ok: false as const, error: "pending" as const };
    const lines = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    const left = remainingQuantities(lines, existing);
    const chosen = input.items.filter((i) => i.quantity > 0);
    const seen = new Set<string>();
    for (const c of chosen) {
      if (seen.has(c.orderItemId) || !left.has(c.orderItemId) || c.quantity > (left.get(c.orderItemId) ?? 0)) return { ok: false as const, error: "items" as const };
      seen.add(c.orderItemId);
    }
    if (!chosen.length) return { ok: false as const, error: "items" as const };

    const [request] = await tx
      .insert(schema.returnRequests)
      .values({
        number: orderNumber("R"),
        orderId,
        customerId: opts.customerId ?? order.customerId,
        kind: input.kind,
        reason: input.reason,
        note: input.note,
        exchangeFor: input.kind === "exchange" ? input.exchangeFor : "",
        items: chosen,
      })
      .returning();
    await addOrderEvent(tx, {
      orderId,
      type: "return",
      message: `${input.kind === "exchange" ? "طلب استبدال" : "طلب استرجاع"} ${request!.number} — قيد المراجعة`,
      internal: false,
    });
    return { ok: true as const, request: request! };
  });
  if (out.ok) {
    const id = out.request.id;
    await runAfterResponse(async () => (await import("@/services/notify")).notifyReturn(id, { db: opts.db }));
  }
  return out;
}

export async function cancelReturnByCustomer(orderId: string, requestId: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [r] = await conn
    .update(schema.returnRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(schema.returnRequests.id, requestId), eq(schema.returnRequests.orderId, orderId), eq(schema.returnRequests.status, "requested")))
    .returning();
  if (r) await addOrderEvent(conn, { orderId, type: "return", message: `ألغى العميل الطلب ${r.number}`, internal: false });
  return Boolean(r);
}

/** Allowed staff moves; anything else is refused. */
const MOVES = {
  approve: { from: ["requested"], to: "approved" },
  reject: { from: ["requested"], to: "rejected" },
  receive: { from: ["approved"], to: "received" },
  complete: { from: ["received", "approved"], to: "completed" },
} satisfies Record<string, { from: ReturnStatus[]; to: ReturnStatus }>;
export type ReturnMove = keyof typeof MOVES;

export async function moveReturn(
  requestId: string,
  move: ReturnMove,
  opts: { message?: string; restock?: boolean; actor: { id: string | null; name: string }; db?: DbOrTx },
): Promise<{ ok: true; request: ReturnRequest; restockedUnits: number } | { ok: false; error: "not_found" | "state" | "message" }> {
  const rule: { from: ReturnStatus[]; to: ReturnStatus } | undefined = MOVES[move];
  if (!rule) return { ok: false, error: "state" };
  const message = (opts.message ?? "").trim().slice(0, 1000);
  if (move === "reject" && message.length < 3) return { ok: false, error: "message" };
  const conn = opts.db ?? (await getDb());

  const out = await (conn as Tx).transaction(async (tx) => {
    const [r] = await tx.select().from(schema.returnRequests).where(eq(schema.returnRequests.id, requestId)).for("update");
    if (!r) return { ok: false as const, error: "not_found" as const };
    if (!rule.from.includes(r.status as ReturnStatus)) return { ok: false as const, error: "state" as const };

    let restockedUnits = 0;
    if (move === "receive" && opts.restock && !r.restocked) {
      const lines = await tx.select().from(schema.orderItems).where(inArray(schema.orderItems.id, r.items.map((i) => i.orderItemId)));
      for (const it of r.items) {
        const variantId = lines.find((l) => l.id === it.orderItemId)?.variantId;
        if (!variantId) continue;
        await tx.update(schema.productVariants).set({ stock: sql`${schema.productVariants.stock} + ${it.quantity}`, updatedAt: new Date() }).where(eq(schema.productVariants.id, variantId));
        restockedUnits += it.quantity;
      }
    }
    const [u] = await tx
      .update(schema.returnRequests)
      .set({
        status: rule.to,
        ...(message ? { staffMessage: message } : {}),
        ...(move === "approve" || move === "reject" ? { decidedAt: new Date(), decidedBy: opts.actor.name } : {}),
        ...(restockedUnits ? { restocked: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.returnRequests.id, requestId))
      .returning();
    const label = r.kind === "exchange" ? "طلب الاستبدال" : "طلب الاسترجاع";
    const text: string = ({ approve: `قُبل ${label} ${r.number}`, reject: `رُفض ${label} ${r.number}`, receive: `استلمنا المنتج المرتجع (${r.number})`, complete: `اكتمل ${label} ${r.number}` } as Record<ReturnMove, string>)[move];
    await addOrderEvent(tx, { orderId: r.orderId, type: "return", message: text, internal: false, actorId: opts.actor.id, actorName: opts.actor.name });
    if (restockedUnits) await addOrderEvent(tx, { orderId: r.orderId, type: "return", message: `أُعيدت ${restockedUnits} قطعة للمخزون (${r.number})`, actorId: opts.actor.id, actorName: opts.actor.name });
    return { ok: true as const, request: u!, restockedUnits };
  });
  if (out.ok && move !== "receive") {
    const id = out.request.id;
    await runAfterResponse(async () => (await import("@/services/notify")).notifyReturn(id, { db: opts.db }));
  }
  return out;
}

/** Value of the returned items at the price paid (before shipping), as a refund suggestion. */
export function returnValueHalalas(request: Pick<ReturnRequest, "items">, lines: { id: string; unitPriceHalalas: number; quantity: number; lineTotalHalalas: number }[]) {
  return request.items.reduce((sum, it) => {
    const l = lines.find((x) => x.id === it.orderItemId);
    return l ? sum + Math.round((l.lineTotalHalalas / l.quantity) * it.quantity) : sum;
  }, 0);
}

export async function openReturnsCount(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [row] = await conn.select({ n: sql<number>`count(*)::int` }).from(schema.returnRequests).where(eq(schema.returnRequests.status, "requested"));
  return row?.n ?? 0;
}
