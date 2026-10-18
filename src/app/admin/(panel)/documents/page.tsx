import { asc } from "drizzle-orm";
import { FileText } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { saveDocument } from "@/features/admin/misc-actions";

export const metadata = { title: "التراخيص والوثائق" };
type D = typeof schema.businessDocuments.$inferSelect;

/** The status shown never claims more than the owner entered — and an expired date always wins. */
function displayStatus(d: D, now: Date): { tone: "gray" | "amber" | "green" | "red"; label: string } {
  if (d.expiresAt && d.expiresAt <= now) return { tone: "red", label: "منتهية الصلاحية" };
  if (d.status === "valid_per_admin") {
    const soon = d.expiresAt && d.expiresAt.getTime() - now.getTime() < 30 * 86400000;
    return { tone: soon ? "amber" : "green", label: soon ? "سارية — تنتهي قريبًا" : "سارية بحسب بيانات المدير" };
  }
  if (d.status === "needs_review") return { tone: "amber", label: "تحتاج مراجعة" };
  return { tone: "gray", label: "غير مدخلة" };
}

function DocForm({ d }: { d?: D }) {
  const day = (x: Date | null | undefined) => (x ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(x) : "");
  return (
    <ActionForm action={saveDocument} className="grid gap-3 md:grid-cols-3">
      {d ? <input type="hidden" name="id" value={d.id} /> : null}
      <div><label className="label">النوع</label><select name="kind" defaultValue={d?.kind ?? "other"} className="field"><option value="cr">سجل تجاري</option><option value="ecommerce_auth">توثيق متجر إلكتروني</option><option value="vat">ضريبة القيمة المضافة</option><option value="municipal">رخصة بلدية</option><option value="other">أخرى</option></select></div>
      <div><label className="label">الاسم</label><input name="titleAr" defaultValue={d?.titleAr} className="field" /></div>
      <div><label className="label">Name (English)</label><input name="titleEn" dir="ltr" defaultValue={d?.titleEn} className="field" /></div>
      <div><label className="label">رقم الوثيقة</label><input name="number" dir="ltr" defaultValue={d?.number ?? ""} className="field" /></div>
      <div><label className="label">تاريخ الإصدار</label><input name="issuedAt" type="date" defaultValue={day(d?.issuedAt)} className="field" /></div>
      <div><label className="label">تاريخ الانتهاء</label><input name="expiresAt" type="date" defaultValue={day(d?.expiresAt)} className="field" /></div>
      <div><label className="label">الحالة</label><select name="status" defaultValue={d?.status ?? "missing"} className="field"><option value="missing">غير مدخلة</option><option value="needs_review">تحتاج مراجعة</option><option value="valid_per_admin">سارية (بحسب بياناتي)</option></select></div>
      <div className="md:col-span-2"><label className="label">الملف (PDF أو صورة، حتى 10MB — يُحفظ بشكل خاص)</label><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="field py-2" /></div>
      <div className="md:col-span-3"><label className="label">ملاحظات</label><input name="notes" defaultValue={d?.notes ?? ""} className="field" /></div>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="showPublicly" defaultChecked={d?.showPublicly} /> إظهار الرقم في صفحة المعلومات التجارية وتذييل المتجر (فقط ما دامت سارية)</label>
      <div className="md:text-end"><SubmitButton>حفظ</SubmitButton></div>
    </ActionForm>
  );
}

export default async function Documents() {
  await requireAdmin("documents.manage");
  const db = await getDb();
  const docs = await db.select().from(schema.businessDocuments).orderBy(asc(schema.businessDocuments.createdAt));
  const now = new Date();
  return (
    <>
      <PageHeader title="التراخيص والوثائق" description="المتجر لا يتحقق من هذه الوثائق لدى أي جهة حكومية؛ الحالة هنا بحسب ما تدخله أنت. الملفات خاصة ولا تُعرض للزوار." />
      <div className="space-y-3">
        {docs.map((d) => {
          const st = displayStatus(d, now);
          return (
            <details key={d.id} className="rounded-2xl border border-paper-2 bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4">
                <span className="font-medium">{d.titleAr}</span>
                {d.number ? <span className="text-sm" dir="ltr">{d.number}</span> : null}
                <Badge tone={st.tone}>{st.label}</Badge>
                {d.showPublicly ? <Badge tone="blue">ظاهرة للعملاء</Badge> : null}
                {d.fileKey ? <a href={`/admin/documents/${d.id}/file`} target="_blank" className="ms-auto inline-flex items-center gap-1 text-sm text-volt"><FileText size={15} /> {d.fileName ?? "الملف"}</a> : null}
              </summary>
              <div className="border-t border-paper-2 p-4"><DocForm d={d} /></div>
            </details>
          );
        })}
      </div>
      <Card title="إضافة وثيقة" className="mt-6"><DocForm /></Card>
    </>
  );
}
