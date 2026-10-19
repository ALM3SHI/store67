import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSettings } from "@/services/settings";
import { brand } from "@/config/brand";
import { formatSaudiMobile } from "@/lib/phone";
import { formatSAR } from "@/lib/money";
import { cityLabel } from "@/lib/saudi-cities";
import { audit } from "@/services/audit";
import { PrintButton } from "./print-button";

export const metadata = { title: "أوراق التجهيز" };

const MAX = 60;

/**
 * Packing slips, one per page: what to put in the box, where it goes, and how
 * much the courier collects for cash-on-delivery orders. No prices of items
 * are printed (the slip travels inside the parcel).
 *   ?ids=a,b,c           specific orders
 *   ?status=confirmed    every order waiting to be prepared (max 60)
 */
export default async function PackingSlips({ searchParams }: { searchParams: Promise<{ ids?: string; status?: string }> }) {
  const admin = await requireAdmin("orders.view");
  const sp = await searchParams;
  const db = await getDb();
  const ids = (sp.ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, MAX);
  const statuses = sp.status === "processing" ? (["processing"] as const) : sp.status ? (["confirmed", "processing"] as const) : null;
  const orders = ids.length
    ? await db.select().from(schema.orders).where(inArray(schema.orders.id, ids)).orderBy(asc(schema.orders.createdAt))
    : statuses
      ? await db.select().from(schema.orders).where(inArray(schema.orders.status, [...statuses])).orderBy(asc(schema.orders.createdAt)).limit(MAX)
      : [];
  const items = orders.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orders.map((o) => o.id))) : [];
  const shipments = orders.length ? await db.select().from(schema.shipments).where(inArray(schema.shipments.orderId, orders.map((o) => o.id))).orderBy(desc(schema.shipments.createdAt)) : [];
  const { store, shipping } = await getSettings(["store", "shipping"]);
  const storeName = store.nameAr || brand.nameAr;
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "orders.print_packing", entity: "order", meta: { count: orders.length } });

  return (
    <div className="min-h-dvh bg-paper p-4 print:bg-white print:p-0" dir="rtl">
      <div data-noprint className="mx-auto mb-4 flex max-w-[190mm] flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-metal-700">{orders.length ? `${orders.length} ورقة تجهيز — كل طلب في صفحة مستقلة.` : "لا توجد طلبات للطباعة."}</p>
        <div className="flex gap-2">
          <Link href="/admin/orders" className="btn btn-ghost btn-sm">رجوع للطلبات</Link>
          {orders.length ? <PrintButton /> : null}
        </div>
      </div>
      {orders.map((o, idx) => {
        const its = items.filter((i) => i.orderId === o.id);
        const ship = shipments.find((s) => s.orderId === o.id);
        const a = o.shippingAddress;
        return (
          <article key={o.id} className={`mx-auto mb-6 max-w-[190mm] rounded-xl bg-white p-8 text-[15px] leading-7 text-ink shadow-sm print:mb-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none ${idx < orders.length - 1 ? "print-break" : ""}`} data-testid="packing-slip">
            <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
              <div>
                <p className="text-xl font-bold">{storeName}</p>
                <p className="text-sm">{[store.contactPhone, store.contactEmail].filter(Boolean).join(" · ")}</p>
                {shipping.originLine1 ? <p className="text-sm">المرسل من: {[shipping.originLine1, cityLabel(shipping.originCity, "ar")].filter(Boolean).join("، ")}</p> : null}
              </div>
              <div className="text-end">
                <p className="text-sm">ورقة تجهيز</p>
                <p className="font-mono text-2xl font-bold tracking-wider" dir="ltr">{o.number}</p>
                <p className="text-sm">{date.format(o.createdAt)}</p>
              </div>
            </header>

            <section className="mt-5 grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-metal-700">إلى</p>
                <p className="text-lg font-semibold">{o.customerName}</p>
                <p dir="ltr" className="text-end">{formatSaudiMobile(o.phone)}</p>
                <p>{a.street}، {a.district}</p>
                <p className="font-semibold">{cityLabel(a.city, "ar")}{a.postalCode ? ` — ${a.postalCode}` : ""}</p>
                {a.nationalAddress ? <p>العنوان الوطني: <span dir="ltr">{a.nationalAddress}</span></p> : null}
              </div>
              <div className="space-y-2">
                {o.paymentStatus === "cod_pending" ? (
                  <p className="rounded-lg border-2 border-ink p-3 text-center">
                    <span className="block text-sm">يُحصّل عند التسليم</span>
                    <span className="text-2xl font-bold">{formatSAR(o.totalHalalas, "ar")}</span>
                  </p>
                ) : (
                  <p className="rounded-lg border border-paper-2 p-3 text-center text-sm">مدفوع مسبقًا — لا يُحصّل شيء</p>
                )}
                {ship?.trackingNumber ? <p className="text-sm">الشحن: {ship.carrierName ?? ""} <span dir="ltr" className="font-mono">{ship.trackingNumber}</span></p> : null}
              </div>
            </section>

            <table className="mt-6 w-full border-collapse text-[15px]">
              <thead>
                <tr className="border-b-2 border-ink text-start">
                  <th className="w-10 py-2 text-start">✓</th>
                  <th className="py-2 text-start">المنتج</th>
                  <th className="py-2 text-start">SKU</th>
                  <th className="w-16 py-2 text-center">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {its.map((i) => (
                  <tr key={i.id} className="border-b border-paper-2">
                    <td className="py-2.5"><span className="inline-block h-5 w-5 rounded border-2 border-ink" aria-hidden /></td>
                    <td className="py-2.5">{i.nameAr}{i.variantNameAr ? ` — ${i.variantNameAr}` : ""}</td>
                    <td className="py-2.5 font-mono text-sm" dir="ltr">{i.sku}</td>
                    <td className="py-2.5 text-center text-lg font-bold">{i.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">عدد القطع: {its.reduce((n, i) => n + i.quantity, 0)}</p>
            {o.customerNote ? <p className="mt-4 rounded-lg bg-paper p-3 print:border print:border-paper-2">ملاحظة العميل: {o.customerNote}</p> : null}
            <footer className="mt-8 border-t border-paper-2 pt-3 text-xs text-metal-700">شكرًا لطلبك من {storeName}. لمتابعة الطلب: صفحة «تتبع الطلب» برقم الطلب ورقم الجوال.</footer>
          </article>
        );
      })}
    </div>
  );
}
