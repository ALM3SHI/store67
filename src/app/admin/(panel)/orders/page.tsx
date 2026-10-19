import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { orderWhere } from "@/services/order-export";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Badge, Empty, orderStatusTone, paymentStatusTone, thClass, tdClass } from "@/components/admin/static";
import { Money } from "@/components/ui/price";
import ar from "@/i18n/ar";

export const metadata = { title: "الطلبات" };
const PAGE = 25;

export default async function OrdersAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("orders.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const where = orderWhere({ q, status: sp.status, from: sp.from, to: sp.to });
  const db = await getDb();
  const [rows, [count]] = await Promise.all([
    db.select().from(schema.orders).where(where).orderBy(desc(schema.orders.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(where),
  ]);
  const pages = Math.max(1, Math.ceil((count?.n ?? 0) / PAGE));
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders?${u}`;
  };
  return (
    <>
      <PageHeader
        title="الطلبات"
        description={`${count?.n ?? 0} طلب`}
        actions={
          <>
          <Link href="/admin/print/packing?status=ready" className="btn btn-ghost btn-sm" data-testid="print-ready">طباعة أوراق تجهيز الطلبات المؤكدة</Link>
          <a href={`/api/admin/orders/export?${new URLSearchParams(Object.entries({ q, status: sp.status, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][])}`} className="btn btn-ghost btn-sm" data-testid="export-orders">
            تصدير إلى Excel
          </a>
          </>
        }
      />
      <form className="mb-5 grid gap-3 rounded-2xl border border-paper-2 bg-white p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
        <div><label className="label" htmlFor="q">بحث</label><input id="q" name="q" defaultValue={q} placeholder="رقم الطلب، اسم العميل أو الجوال" className="field" /></div>
        <div><label className="label" htmlFor="status">الحالة</label><select id="status" name="status" defaultValue={sp.status ?? ""} className="field"><option value="">الكل</option>{Object.entries(ar.status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="label" htmlFor="from">من تاريخ</label><input id="from" name="from" type="date" defaultValue={sp.from} className="field" /></div>
        <div><label className="label" htmlFor="to">إلى تاريخ</label><input id="to" name="to" type="date" defaultValue={sp.to} className="field" /></div>
        <button className="btn btn-ink">تصفية</button>
      </form>
      {rows.length === 0 ? (
        <Empty>لا توجد طلبات مطابقة.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-paper-2 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-paper-2"><tr><th className={thClass}>الطلب</th><th className={thClass}>التاريخ</th><th className={thClass}>العميل</th><th className={thClass}>الحالة</th><th className={thClass}>الدفع</th><th className={thClass}>الإجمالي</th></tr></thead>
            <tbody className="divide-y divide-paper-2">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-paper/50">
                  <td className={tdClass}><Link href={`/admin/orders/${o.id}`} className="font-display font-semibold text-volt hover:underline" dir="ltr" data-testid="admin-order-link">{o.number}</Link></td>
                  <td className={tdClass}>{date.format(o.createdAt)}</td>
                  <td className={tdClass}>{o.customerName}</td>
                  <td className={tdClass}><Badge tone={orderStatusTone[o.status]}>{ar.status[o.status]}</Badge></td>
                  <td className={tdClass}><Badge tone={paymentStatusTone[o.paymentStatus]}>{ar.paymentStatus[o.paymentStatus]}</Badge></td>
                  <td className={tdClass}><Money halalas={o.totalHalalas} locale="ar" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm" aria-label="الصفحات">
          {page > 1 ? <Link className="btn btn-ghost btn-sm" href={qs(page - 1)}>السابق</Link> : null}
          <span>{page} / {pages}</span>
          {page < pages ? <Link className="btn btn-ghost btn-sm" href={qs(page + 1)}>التالي</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
