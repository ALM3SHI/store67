import Link from "next/link";
import { desc, ilike, or, sql, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Empty, thClass, tdClass } from "@/components/admin/static";
import { Money } from "@/components/ui/price";
import { formatSaudiMobile, normalizeSaudiMobile } from "@/lib/phone";

export const metadata = { title: "العملاء" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin("customers.view");
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const db = await getDb();
  const phone = q ? normalizeSaudiMobile(q) : null;
  const rows = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      email: schema.customers.email,
      createdAt: schema.customers.createdAt,
      orders: sql<number>`count(${schema.orders.id})::int`,
      spent: sql<number>`coalesce(sum(case when ${schema.orders.paymentStatus} in ('paid','cod_collected','partially_refunded') then ${schema.orders.totalHalalas} else 0 end),0)::int`,
    })
    .from(schema.customers)
    .leftJoin(schema.orders, eq(schema.orders.customerId, schema.customers.id))
    .where(q ? or(ilike(schema.customers.name, `%${q}%`), ilike(schema.customers.email, `%${q}%`), phone ? eq(schema.customers.phone, phone) : sql`false`) : undefined)
    .groupBy(schema.customers.id)
    .orderBy(desc(schema.customers.createdAt))
    .limit(100);
  return (
    <>
      <PageHeader title="العملاء" description="بيانات العملاء لخدمة طلباتهم فقط. كل فتح لسجل عميل يُسجَّل في سجل العمليات." />
      <form className="mb-5 flex max-w-lg gap-2"><input name="q" defaultValue={q} placeholder="الاسم أو الجوال أو البريد" className="field" /><button className="btn btn-ink">بحث</button></form>
      {rows.length === 0 ? <Empty>لا يوجد عملاء بعد.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-paper-2 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-paper-2"><tr><th className={thClass}>العميل</th><th className={thClass}>الجوال</th><th className={thClass}>الطلبات</th><th className={thClass}>المدفوع</th></tr></thead>
            <tbody className="divide-y divide-paper-2">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-paper/50">
                  <td className={tdClass}><Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                  <td className={tdClass} dir="ltr">{formatSaudiMobile(c.phone)}</td>
                  <td className={tdClass}>{c.orders}</td>
                  <td className={tdClass}><Money halalas={c.spent} locale="ar" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
