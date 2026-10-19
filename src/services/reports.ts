import "server-only";
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";

/* Sales report for a date range (Riyadh time). Definitions are shown on the
   page so the numbers can be checked by hand:
   - an order "counts" once it is confirmed: paid online, or COD accepted, and
     not cancelled / failed / still waiting for payment;
   - gross = the totals customers were charged (incl. shipping and VAT);
   - refunds = successful refunds recorded in the range;
   - net = gross − refunds. */

const COUNTED = ["confirmed", "processing", "shipped", "delivered", "refunded"] as const;
const DAY = 86_400_000;

export type Range = { from: Date; to: Date; days: string[] };

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
const startOf = (key: string) => new Date(`${key}T00:00:00+03:00`);

/** Resolves presets (7, 30, 90, month, last_month) or explicit YYYY-MM-DD dates. */
export function resolveRange(p: { preset?: string; from?: string; to?: string }, now = new Date()): Range & { preset: string } {
  const today = ymd(now);
  let fromKey: string;
  let toKey = today;
  let preset = p.preset ?? "30";
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(startOf(s).getTime()) ? s : null);
  if (valid(p.from) && valid(p.to) && p.from! <= p.to!) {
    fromKey = p.from!;
    toKey = p.to! > today ? today : p.to!;
    preset = "custom";
  } else if (preset === "month") {
    fromKey = `${today.slice(0, 8)}01`;
  } else if (preset === "last_month") {
    const first = startOf(`${today.slice(0, 8)}01`);
    const prev = ymd(new Date(first.getTime() - DAY));
    fromKey = `${prev.slice(0, 8)}01`;
    toKey = prev;
  } else {
    const n = preset === "7" ? 7 : preset === "90" ? 90 : 30;
    preset = String(n);
    fromKey = ymd(new Date(startOf(today).getTime() - (n - 1) * DAY));
  }
  const from = startOf(fromKey);
  const to = new Date(startOf(toKey).getTime() + DAY);
  const span = Math.min(366, Math.round((to.getTime() - from.getTime()) / DAY));
  const days = Array.from({ length: span }, (_, i) => ymd(new Date(from.getTime() + i * DAY + 12 * 3600_000)));
  return { from, to, days, preset };
}

export async function salesReport(range: Range, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const o = schema.orders;
  const inRange = and(gte(o.createdAt, range.from), lt(o.createdAt, range.to));
  const counted = and(inRange, inArray(o.status, [...COUNTED]));
  const day = sql<string>`to_char(${o.createdAt} at time zone 'Asia/Riyadh', 'YYYY-MM-DD')`;

  const [[k], daily, [units], top, byCity, byPayment, coupons, offers, [refunds], [cancelled], [returns], [newCustomers]] = await Promise.all([
    conn
      .select({
        orders: sql<number>`count(*)::int`,
        gross: sql<number>`coalesce(sum(${o.totalHalalas}),0)::int`,
        discounts: sql<number>`coalesce(sum(${o.discountHalalas}),0)::int`,
        shipping: sql<number>`coalesce(sum(${o.shippingHalalas}),0)::int`,
        tax: sql<number>`coalesce(sum(${o.taxHalalas}),0)::int`,
        codPending: sql<number>`coalesce(sum(${o.totalHalalas}) filter (where ${o.paymentStatus} = 'cod_pending'),0)::int`,
      })
      .from(o)
      .where(counted),
    conn.select({ day, revenue: sql<number>`coalesce(sum(${o.totalHalalas}),0)::int`, n: sql<number>`count(*)::int` }).from(o).where(counted).groupBy(sql`1`),
    conn
      .select({ n: sql<number>`coalesce(sum(${schema.orderItems.quantity}),0)::int` })
      .from(schema.orderItems)
      .innerJoin(o, sql`${o.id} = ${schema.orderItems.orderId}`)
      .where(counted),
    conn
      .select({
        name: schema.orderItems.nameAr,
        units: sql<number>`sum(${schema.orderItems.quantity})::int`,
        revenue: sql<number>`sum(${schema.orderItems.lineTotalHalalas})::int`,
        orders: sql<number>`count(distinct ${schema.orderItems.orderId})::int`,
      })
      .from(schema.orderItems)
      .innerJoin(o, sql`${o.id} = ${schema.orderItems.orderId}`)
      .where(counted)
      .groupBy(schema.orderItems.nameAr)
      .orderBy(sql`3 desc`)
      .limit(10),
    conn
      .select({ city: sql<string>`${o.shippingAddress}->>'city'`, n: sql<number>`count(*)::int`, revenue: sql<number>`sum(${o.totalHalalas})::int` })
      .from(o)
      .where(counted)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
    conn.select({ method: o.paymentMethod, n: sql<number>`count(*)::int`, revenue: sql<number>`sum(${o.totalHalalas})::int` }).from(o).where(counted).groupBy(o.paymentMethod).orderBy(sql`2 desc`),
    conn
      .select({ code: o.couponCode, n: sql<number>`count(*)::int` })
      .from(o)
      .where(and(counted, sql`${o.couponCode} is not null`))
      .groupBy(o.couponCode)
      .orderBy(sql`2 desc`),
    conn
      .select({ name: sql<string>`x->>'nameAr'`, n: sql<number>`count(*)::int`, amount: sql<number>`sum((x->>'amountHalalas')::int)::int` })
      .from(sql`${o}, jsonb_array_elements(${o.offers}) as x`)
      .where(counted)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    conn
      .select({ amount: sql<number>`coalesce(sum(${schema.refunds.amountHalalas}),0)::int`, n: sql<number>`count(*)::int` })
      .from(schema.refunds)
      .where(and(sql`${schema.refunds.status} = 'succeeded'`, gte(schema.refunds.createdAt, range.from), lt(schema.refunds.createdAt, range.to))),
    conn.select({ n: sql<number>`count(*)::int` }).from(o).where(and(inRange, sql`${o.status} = 'cancelled'`)),
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.returnRequests)
      .where(and(gte(schema.returnRequests.createdAt, range.from), lt(schema.returnRequests.createdAt, range.to), sql`${schema.returnRequests.status} <> 'cancelled'`)),
    // Phones whose first counted order falls in the range.
    conn.execute(sql`
      select count(*)::int as n from (
        select phone, min(created_at) as first from orders
        where status in ('confirmed','processing','shipped','delivered','refunded')
        group by phone
      ) f where f.first >= ${range.from.toISOString()} and f.first < ${range.to.toISOString()}`).then((r) => (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as { n: number }[]),
  ]);

  const orders = k?.orders ?? 0;
  const gross = k?.gross ?? 0;
  const refunded = refunds?.amount ?? 0;
  return {
    orders,
    gross,
    refunds: refunded,
    refundCount: refunds?.n ?? 0,
    net: gross - refunded,
    aov: orders ? Math.round(gross / orders) : 0,
    units: units?.n ?? 0,
    discounts: k?.discounts ?? 0,
    shipping: k?.shipping ?? 0,
    tax: k?.tax ?? 0,
    codPending: k?.codPending ?? 0,
    cancelled: cancelled?.n ?? 0,
    returns: returns?.n ?? 0,
    newCustomers: newCustomers?.n ?? 0,
    days: range.days.map((d) => {
      const row = daily.find((x) => x.day === d);
      return { day: d, revenue: row?.revenue ?? 0, n: row?.n ?? 0 };
    }),
    top,
    byCity,
    byPayment,
    coupons,
    offers,
  };
}
