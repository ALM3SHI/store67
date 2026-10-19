import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { normalizeSaudiMobile, formatSaudiMobile } from "@/lib/phone";
import { cityLabel } from "@/lib/saudi-cities";
import ar from "@/i18n/ar";

export type OrderFilters = { q?: string; status?: string; from?: string; to?: string };

/** The same filters the admin orders list uses, shared with the export. */
export function orderWhere(f: OrderFilters): SQL | undefined {
  const conds: SQL[] = [];
  const q = (f.q ?? "").trim().slice(0, 80);
  if (q) {
    const phone = normalizeSaudiMobile(q);
    conds.push(or(ilike(schema.orders.number, `%${q}%`), ilike(schema.orders.customerName, `%${q}%`), phone ? eq(schema.orders.phone, phone) : sql`false`)!);
  }
  if (f.status && f.status in ar.status) conds.push(eq(schema.orders.status, f.status as never));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conds.push(gte(schema.orders.createdAt, new Date(`${f.from}T00:00:00+03:00`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conds.push(lte(schema.orders.createdAt, new Date(`${f.to}T23:59:59+03:00`)));
  return conds.length ? and(...conds) : undefined;
}

/** CSV cell: quoted, and spreadsheet formulas neutralised (=, +, -, @ at the start). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const sar = (h: number) => (h / 100).toFixed(2);

export const EXPORT_LIMIT = 10000;

/** UTF-8 CSV with BOM so Excel shows Arabic correctly. */
export async function exportOrdersCsv(f: OrderFilters): Promise<{ csv: string; count: number }> {
  const db = await getDb();
  const orders = await db.select().from(schema.orders).where(orderWhere(f)).orderBy(desc(schema.orders.createdAt)).limit(EXPORT_LIMIT);
  const ids = orders.map((o) => o.id);
  const [items, shipments] = ids.length
    ? await Promise.all([
        db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids)),
        db.select().from(schema.shipments).where(inArray(schema.shipments.orderId, ids)).orderBy(asc(schema.shipments.createdAt)),
      ])
    : [[], []];
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const header = [
    "رقم الطلب", "التاريخ", "حالة الطلب", "حالة الدفع", "طريقة الدفع", "العميل", "الجوال", "البريد",
    "المدينة", "الحي", "العنوان", "العنوان الوطني", "الرمز البريدي", "المنتجات", "عدد القطع",
    "المجموع الفرعي", "الخصم", "الشحن", "رسوم الاستلام", "الضريبة", "الإجمالي", "الكوبون", "شركة الشحن", "رقم التتبع", "ملاحظة العميل",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const o of orders) {
    const its = items.filter((i) => i.orderId === o.id);
    const ship = shipments.filter((s) => s.orderId === o.id).at(-1);
    lines.push(
      [
        o.number,
        date.format(o.createdAt).replace(",", ""),
        ar.status[o.status],
        ar.paymentStatus[o.paymentStatus],
        o.paymentMethod === "cod" ? "عند الاستلام" : o.paymentMethod === "moyasar" ? "إلكتروني" : o.paymentMethod,
        o.customerName,
        formatSaudiMobile(o.phone),
        o.email ?? "",
        cityLabel(o.shippingAddress.city, "ar"),
        o.shippingAddress.district,
        o.shippingAddress.street,
        o.shippingAddress.nationalAddress ?? "",
        o.shippingAddress.postalCode ?? "",
        its.map((i) => `${i.nameAr}${i.variantNameAr ? ` (${i.variantNameAr})` : ""} × ${i.quantity}`).join(" | "),
        its.reduce((n, i) => n + i.quantity, 0),
        sar(o.subtotalHalalas),
        sar(o.discountHalalas),
        sar(o.shippingHalalas),
        sar(o.codFeeHalalas),
        sar(o.taxHalalas),
        sar(o.totalHalalas),
        o.couponCode ?? "",
        ship?.carrierName ?? "",
        ship?.trackingNumber ?? "",
        o.customerNote ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return { csv: "﻿" + lines.join("\r\n") + "\r\n", count: orders.length };
}
