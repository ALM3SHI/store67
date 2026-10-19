import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Badge, Empty } from "@/components/admin/static";
import { resolveAppError } from "@/features/admin/error-actions";

export const metadata = { title: "سجل الأخطاء" };

const sourceLabel: Record<string, string> = {
  request: "صفحة أو واجهة",
  action: "إجراء في لوحة التحكم أو المتجر",
  payment: "الدفع",
  shipping: "الشحن",
  cron: "المهام المجدولة",
  notify: "إرسال الرسائل",
  checkout: "إتمام الطلب",
};

export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  await requireAdmin("audit.view");
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db.select().from(schema.appErrors).orderBy(desc(schema.appErrors.lastSeenAt)).limit(200);
  const list = sp.all ? rows : rows.filter((r) => !r.resolved);
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  return (
    <>
      <PageHeader
        title="سجل الأخطاء"
        description="أخطاء الخادم مجمّعة حسب النوع. يصلك تنبيه (بريد/تيليجرام) عند أول ظهور لكل خطأ، ثم مرة كل ساعة على الأكثر إن تكرر. «تمت المعالجة» يخفيه حتى يتكرر."
        actions={
          <>
            <a href={sp.all ? "/admin/errors" : "/admin/errors?all=1"} className="btn btn-ghost btn-sm">{sp.all ? "غير المعالجة فقط" : "عرض الكل"}</a>
            {list.some((r) => !r.resolved) ? (
              <form action={resolveAppError}><input type="hidden" name="all" value="1" /><button className="btn btn-ghost btn-sm">تعليم الكل كمعالج</button></form>
            ) : null}
          </>
        }
      />
      {list.length === 0 ? (
        <Empty>لا توجد أخطاء غير معالجة. 👌</Empty>
      ) : (
        <div className="space-y-3" data-testid="error-list">
          {list.map((e) => (
            <details key={e.fingerprint} className="rounded-2xl border border-paper-2 bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 text-sm">
                <Badge tone={e.resolved ? "gray" : e.source === "payment" || e.source === "checkout" ? "red" : "amber"}>{sourceLabel[e.source] ?? e.source}</Badge>
                <span className="min-w-0 flex-1 truncate font-medium" dir="ltr">{e.message}</span>
                <span className="text-xs text-metal-500">×{e.count} · آخر مرة {date.format(e.lastSeenAt)}</span>
              </summary>
              <div className="space-y-2 border-t border-paper-2 p-4 text-sm">
                {e.path ? <p><span className="text-metal-500">المكان: </span><span dir="ltr">{e.path}</span></p> : null}
                <p className="text-xs text-metal-500">أول ظهور {date.format(e.firstSeenAt)}{e.alertedAt ? ` · آخر تنبيه ${date.format(e.alertedAt)}` : ""}</p>
                {e.detail ? <pre className="max-h-64 overflow-auto rounded-lg bg-ink p-3 text-xs text-metal-300" dir="ltr">{e.detail}</pre> : null}
                {!e.resolved ? (
                  <form action={resolveAppError}><input type="hidden" name="fingerprint" value={e.fingerprint} /><button className="btn btn-ghost btn-sm">تمت المعالجة</button></form>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
