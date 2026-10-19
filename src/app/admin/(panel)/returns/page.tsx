import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Empty } from "@/components/admin/static";
import { ReturnCard } from "@/components/admin/return-card";
import { RETURN_STATUS_AR, type ReturnStatus } from "@/services/returns";
import { getSetting } from "@/services/settings";
import { cn } from "@/lib/utils";

export const metadata = { title: "الاسترجاع والاستبدال" };

const FILTERS: { key: string; label: string; statuses: ReturnStatus[] }[] = [
  { key: "active", label: "بحاجة لإجراء", statuses: ["requested", "approved", "received"] },
  { key: "requested", label: RETURN_STATUS_AR.requested, statuses: ["requested"] },
  { key: "closed", label: "مغلقة", statuses: ["completed", "rejected", "cancelled"] },
];

export default async function Returns({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requireAdmin("orders.view");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0]!;
  const db = await getDb();
  const [rows, commerce] = await Promise.all([
    db
      .select({ r: schema.returnRequests, o: { id: schema.orders.id, number: schema.orders.number, customerName: schema.orders.customerName, paymentMethod: schema.orders.paymentMethod } })
      .from(schema.returnRequests)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.returnRequests.orderId))
      .where(inArray(schema.returnRequests.status, filter.statuses))
      .orderBy(desc(schema.returnRequests.createdAt))
      .limit(200),
    getSetting("commerce"),
  ]);
  const lines = rows.length
    ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, [...new Set(rows.map((x) => x.o.id))]))
    : [];
  return (
    <>
      <PageHeader
        title="الاسترجاع والاستبدال"
        description={`يقدّم العميل الطلب من صفحة طلبه خلال ${commerce.returnsWindowDays} أيام من التسليم (تُغيَّر من الإعدادات). كل طلب يُراجَع يدويًا؛ قبول الطلب لا يُرجع أي مبلغ تلقائيًا — الاسترجاع المالي يتم من قسم الدفع في صفحة الطلب.`}
      />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="تصفية">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/returns?status=${f.key}`} aria-current={f.key === filter.key ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-sm", f.key === filter.key ? "bg-ink text-white" : "bg-paper-2 text-metal-700")}>
            {f.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>لا توجد طلبات هنا.</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ r, o }) => (
            <ReturnCard key={r.id} r={r} order={o} lines={lines.filter((l) => l.orderId === o.id)} canUpdate={can(admin.role, "orders.update")} />
          ))}
        </ul>
      )}
    </>
  );
}
