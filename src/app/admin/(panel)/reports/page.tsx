import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, Card, Empty, thClass, tdClass } from "@/components/admin/static";
import { Money } from "@/components/ui/price";
import { SalesChart } from "@/components/admin/sales-chart";
import { resolveRange, salesReport } from "@/services/reports";
import { cityLabel } from "@/lib/saudi-cities";
import { cn } from "@/lib/utils";

export const metadata = { title: "التقارير" };

const PRESETS = [
  { key: "7", label: "آخر 7 أيام" },
  { key: "30", label: "آخر 30 يومًا" },
  { key: "90", label: "آخر 90 يومًا" },
  { key: "month", label: "هذا الشهر" },
  { key: "last_month", label: "الشهر الماضي" },
];
const PAY: Record<string, string> = { moyasar: "بطاقة / Apple Pay (Moyasar)", tabby: "تابي", tamara: "تمارا", cod: "الدفع عند الاستلام", test: "بوابة اختبار" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  await requireAdmin("dashboard.view");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const r = await salesReport(range);
  const fromKey = range.days[0]!;
  const toKey = range.days[range.days.length - 1]!;
  const kpis = [
    { label: "صافي المبيعات", value: <Money halalas={r.net} locale="ar" />, sub: r.refunds ? <>الإجمالي <Money halalas={r.gross} locale="ar" /> − استرجاع <Money halalas={r.refunds} locale="ar" /></> : "لا استرجاعات في الفترة" },
    { label: "الطلبات المؤكدة", value: <bdi>{r.orders}</bdi>, sub: r.cancelled ? `${r.cancelled} طلبًا ملغى (غير محسوب)` : undefined },
    { label: "متوسط قيمة الطلب", value: <Money halalas={r.aov} locale="ar" /> },
    { label: "القطع المباعة", value: <bdi>{r.units}</bdi> },
    { label: "عملاء جدد", value: <bdi>{r.newCustomers}</bdi>, sub: "أول طلب مؤكد لهم في الفترة (حسب رقم الجوال)" },
    { label: "الخصومات الممنوحة", value: <Money halalas={r.discounts} locale="ar" /> },
    { label: "بانتظار التحصيل (عند الاستلام)", value: <Money halalas={r.codPending} locale="ar" /> },
    { label: "طلبات استرجاع/استبدال", value: <bdi>{r.returns}</bdi>, href: "/admin/returns" },
  ];
  const share = (n: number) => (r.gross ? `${Math.round((n / r.gross) * 100)}٪` : "—");

  return (
    <>
      <PageHeader
        title="التقارير"
        description="الطلب يُحسب عند تأكيده (مدفوع إلكترونيًا أو دفع عند الاستلام مقبول) ولا تُحسب الطلبات الملغاة أو غير المدفوعة. المبالغ تشمل الشحن والضريبة. التواريخ بتوقيت الرياض."
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="الفترة">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/admin/reports?preset=${p.key}`} aria-current={range.preset === p.key ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-sm", range.preset === p.key ? "bg-ink text-white" : "bg-paper-2 text-metal-700")}>
              {p.label}
            </Link>
          ))}
        </nav>
        <form className="ms-auto flex flex-wrap items-end gap-2" data-testid="report-range">
          <div><label className="label" htmlFor="rf">من</label><input id="rf" name="from" type="date" defaultValue={fromKey} className="field" /></div>
          <div><label className="label" htmlFor="rt">إلى</label><input id="rt" name="to" type="date" defaultValue={toKey} className="field" /></div>
          <button className="btn btn-ink btn-sm">عرض</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="report-kpis">
        {kpis.map((k) => {
          const inner = (
            <>
              <p className="text-sm text-metal-500">{k.label}</p>
              <p className="mt-2 font-display text-[1.5rem] font-semibold">{k.value}</p>
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

      <Card title={`المبيعات اليومية — من \u2066${fromKey}\u2069 إلى \u2066${toKey}\u2069`} className="mt-6">
        {r.orders ? <SalesChart days={r.days} label={`المبيعات اليومية من ${fromKey} إلى ${toKey}`} /> : <Empty>لا توجد طلبات مؤكدة في هذه الفترة.</Empty>}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="المنتجات الأكثر مبيعًا">
          {r.top.length ? (
            <table className="w-full text-sm" data-testid="report-top">
              <thead><tr><th className={thClass}>المنتج</th><th className={thClass}>القطع</th><th className={thClass}>الطلبات</th><th className={thClass}>المبيعات</th></tr></thead>
              <tbody className="divide-y divide-paper-2">
                {r.top.map((p) => <tr key={p.name}><td className={tdClass}>{p.name}</td><td className={tdClass}><bdi>{p.units}</bdi></td><td className={tdClass}><bdi>{p.orders}</bdi></td><td className={tdClass}><Money halalas={p.revenue} locale="ar" /></td></tr>)}
              </tbody>
            </table>
          ) : <Empty>لا بيانات.</Empty>}
          <p className="mt-2 text-xs text-metal-500">مبيعات المنتج = سعر القطع قبل الخصم والشحن.</p>
        </Card>
        <Card title="حسب المدينة">
          {r.byCity.length ? (
            <table className="w-full text-sm">
              <thead><tr><th className={thClass}>المدينة</th><th className={thClass}>الطلبات</th><th className={thClass}>المبيعات</th><th className={thClass}>النسبة</th></tr></thead>
              <tbody className="divide-y divide-paper-2">
                {r.byCity.map((c) => <tr key={c.city}><td className={tdClass}>{cityLabel(c.city, "ar")}</td><td className={tdClass}><bdi>{c.n}</bdi></td><td className={tdClass}><Money halalas={c.revenue} locale="ar" /></td><td className={tdClass}>{share(c.revenue)}</td></tr>)}
              </tbody>
            </table>
          ) : <Empty>لا بيانات.</Empty>}
        </Card>
        <Card title="حسب طريقة الدفع">
          {r.byPayment.length ? (
            <table className="w-full text-sm">
              <thead><tr><th className={thClass}>الطريقة</th><th className={thClass}>الطلبات</th><th className={thClass}>المبيعات</th><th className={thClass}>النسبة</th></tr></thead>
              <tbody className="divide-y divide-paper-2">
                {r.byPayment.map((p) => <tr key={p.method}><td className={tdClass}>{PAY[p.method] ?? p.method}</td><td className={tdClass}><bdi>{p.n}</bdi></td><td className={tdClass}><Money halalas={p.revenue} locale="ar" /></td><td className={tdClass}>{share(p.revenue)}</td></tr>)}
              </tbody>
            </table>
          ) : <Empty>لا بيانات.</Empty>}
        </Card>
        <Card title="العروض والكوبونات">
          {r.offers.length || r.coupons.length ? (
            <ul className="space-y-2 text-sm">
              {r.offers.map((x) => <li key={`o-${x.name}`} className="flex justify-between gap-3"><span>عرض: {x.name}</span><span><bdi>{x.n}</bdi> طلب — <Money halalas={x.amount} locale="ar" /></span></li>)}
              {r.coupons.map((x) => <li key={`c-${x.code}`} className="flex justify-between gap-3"><span>كوبون: <bdi dir="ltr">{x.code}</bdi></span><span><bdi>{x.n}</bdi> طلب</span></li>)}
            </ul>
          ) : <Empty>لم يُستخدم أي عرض أو كوبون في هذه الفترة.</Empty>}
          <dl className="mt-4 space-y-1 border-t border-paper-2 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-metal-500">الشحن المحصّل</dt><dd><Money halalas={r.shipping} locale="ar" /></dd></div>
            <div className="flex justify-between"><dt className="text-metal-500">ضريبة القيمة المضافة في الطلبات</dt><dd><Money halalas={r.tax} locale="ar" /></dd></div>
            <div className="flex justify-between"><dt className="text-metal-500">عمليات الاسترجاع المالي</dt><dd><bdi>{r.refundCount}</bdi></dd></div>
          </dl>
        </Card>
      </div>
      <p className="mt-6 text-xs text-metal-500">هذه أرقام تشغيلية من طلبات المتجر وليست تقريرًا محاسبيًا أو ضريبيًا. لتفاصيل كل طلب استخدم «تصدير CSV» من صفحة الطلبات.</p>
    </>
  );
}
