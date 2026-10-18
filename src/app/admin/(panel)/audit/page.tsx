import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Empty, thClass, tdClass } from "@/components/admin/static";

export const metadata = { title: "سجل العمليات" };

export default async function Audit() {
  await requireAdmin("audit.view");
  const db = await getDb();
  const rows = await db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(300);
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Riyadh" });
  return (
    <>
      <PageHeader title="سجل العمليات" description="آخر 300 عملية حساسة: الدخول، تعديل الأسعار، الاسترجاع، فتح بيانات العملاء والوثائق." />
      {rows.length === 0 ? <Empty>لا عمليات بعد.</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-paper-2 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-paper-2"><tr><th className={thClass}>الوقت</th><th className={thClass}>المستخدم</th><th className={thClass}>العملية</th><th className={thClass}>العنصر</th><th className={thClass}>تفاصيل</th></tr></thead>
            <tbody className="divide-y divide-paper-2">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={tdClass}>{date.format(r.createdAt)}</td>
                  <td className={tdClass} dir="ltr">{r.actorEmail ?? "—"}</td>
                  <td className={tdClass} dir="ltr"><code>{r.action}</code></td>
                  <td className={tdClass} dir="ltr">{r.entity}{r.entityId ? `:${r.entityId.slice(0, 18)}` : ""}</td>
                  <td className={`${tdClass} max-w-xs truncate text-xs text-metal-500`} dir="ltr">{r.meta ? JSON.stringify(r.meta) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
