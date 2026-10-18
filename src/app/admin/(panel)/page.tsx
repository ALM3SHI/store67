import Link from "next/link";
import { CircleCheck, CircleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { dashboardStats, launchReadiness } from "@/services/admin-stats";
import { PageHeader, Card, Badge, orderStatusTone, Empty } from "@/components/admin/static";
import { Money } from "@/components/ui/price";
import { SalesChart } from "@/components/admin/sales-chart";
import ar from "@/i18n/ar";

export const metadata = { title: "نظرة عامة" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireAdmin("dashboard.view");
  const sp = await searchParams;
  const [s, ready] = await Promise.all([dashboardStats(), launchReadiness()]);
  const notReady = ready.filter((r) => !r.ok);
  const maxStatus = Math.max(1, ...s.byStatus.map((b) => b.n));
  const kpis = [
    { label: "إجمالي الطلبات", value: <bdi>{s.orders}</bdi> },
    { label: "المبيعات المؤكدة", value: <Money halalas={s.revenue} locale="ar" />, sub: `${s.paidOrders} طلبًا مدفوعًا أو محصّلًا` },
    { label: "طلبات اليوم", value: <bdi>{s.today}</bdi> },
    { label: "تحتاج تجهيزًا", value: <bdi>{s.needsAction}</bdi>, href: "/admin/orders?status=confirmed" },
  ];
  return (
    <>
      <PageHeader title="نظرة عامة" description="كل الأرقام هنا محسوبة مباشرة من قاعدة البيانات." />
      {sp.denied ? <p className="mb-4 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">ليست لديك صلاحية لفتح تلك الصفحة.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const inner = (
            <>
              <p className="text-sm text-metal-500">{k.label}</p>
              <p className="mt-2 font-display text-[1.7rem] font-semibold">{k.value}</p>
              {k.sub ? <p className="mt-1 text-xs text-metal-500">{k.sub}</p> : null}
            </>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} className="rounded-2xl border border-paper-2 bg-white p-5 transition hover:border-metal-300">{inner}</Link>
          ) : (
            <div key={k.label} className="rounded-2xl border border-paper-2 bg-white p-5">{inner}</div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="المبيعات — آخر ٣٠ يومًا">
          {s.days.some((d) => d.revenue > 0) ? <SalesChart days={s.days} /> : <Empty>لا توجد مبيعات مؤكدة في آخر ٣٠ يومًا بعد. سيظهر الرسم فور وصول أول طلب.</Empty>}
        </Card>
        <Card title="جاهزية الإطلاق" actions={notReady.length ? <Badge tone="amber">{notReady.length} متبقية</Badge> : <Badge tone="green">جاهز</Badge>}>
          <ul className="space-y-3" data-testid="readiness">
            {ready.map((r) => (
              <li key={r.key} className="flex gap-2.5 text-sm">
                {r.ok ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-ok" aria-label="مكتمل" /> : <CircleAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-label="غير مكتمل" />}
                <span>
                  <Link href={r.href} className="font-medium hover:underline">{r.label}</Link>
                  {!r.ok ? <span className="block text-xs text-metal-500">{r.hint}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="أحدث الطلبات" className="xl:col-span-2" actions={<Link href="/admin/orders" className="text-sm text-volt">كل الطلبات</Link>}>
          {s.recent.length === 0 ? (
            <Empty>لا توجد طلبات بعد.</Empty>
          ) : (
            <ul className="divide-y divide-paper-2">
              {s.recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-paper/60">
                    <span className="font-display font-medium" dir="ltr">{o.number}</span>
                    <span className="flex-1 text-sm text-metal-700">{o.customerName}</span>
                    <Badge tone={orderStatusTone[o.status]}>{ar.status[o.status]}</Badge>
                    <Money halalas={o.totalHalalas} locale="ar" className="text-sm" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="توزيع حالات الطلبات">
            {s.byStatus.length === 0 ? (
              <Empty>لا بيانات بعد.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {s.byStatus.map((b) => (
                  <li key={b.status} className="text-sm">
                    <div className="flex justify-between"><span>{ar.status[b.status]}</span><bdi>{b.n}</bdi></div>
                    <div className="mt-1 h-1.5 rounded-full bg-paper-2"><div className="h-full rounded-full bg-metal-700" style={{ width: `${(b.n / maxStatus) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="مخزون منخفض">
            {s.lowStock.length === 0 ? (
              <p className="text-sm text-metal-500">كل المنتجات فوق حد التنبيه.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.lowStock.map((v) => (
                  <li key={v.id} className="flex justify-between gap-3">
                    <Link href={`/admin/products/${v.productId}`} className="hover:underline">{v.name} <span className="text-metal-500" dir="ltr">({v.sku})</span></Link>
                    <Badge tone={v.stock === 0 ? "red" : "amber"}>{v.stock === 0 ? "نفد" : `${v.stock} متبقٍ`}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
