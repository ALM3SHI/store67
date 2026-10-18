import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { audit } from "@/services/audit";
import { PageHeader, Card, Badge, orderStatusTone } from "@/components/admin/static";
import { Money } from "@/components/ui/price";
import { formatSaudiMobile } from "@/lib/phone";
import ar from "@/i18n/ar";

export const metadata = { title: "سجل العميل" };

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("customers.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  if (!c) notFound();
  const orders = await db.select().from(schema.orders).where(eq(schema.orders.customerId, id)).orderBy(desc(schema.orders.createdAt));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "customer.view", entity: "customer", entityId: id });
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
  return (
    <>
      <PageHeader title={c.name} description={`عميل منذ ${date.format(c.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card title="التواصل">
          <p dir="ltr" className="text-start">{formatSaudiMobile(c.phone)}</p>
          {c.email ? <p dir="ltr" className="text-start">{c.email}</p> : null}
          <a href={`https://wa.me/${c.phone.replace("+", "")}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-ok underline">مراسلة عبر واتساب</a>
        </Card>
        <Card title={`الطلبات (${orders.length})`}>
          <ul className="divide-y divide-paper-2">
            {orders.map((o) => (
              <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm hover:bg-paper/60"><span className="font-display font-semibold" dir="ltr">{o.number}</span><span className="flex-1 text-metal-500">{date.format(o.createdAt)}</span><Badge tone={orderStatusTone[o.status]}>{ar.status[o.status]}</Badge><Money halalas={o.totalHalalas} locale="ar" /></Link></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
