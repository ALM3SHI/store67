import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Badge } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { savePage } from "@/features/admin/misc-actions";

export const metadata = { title: "الصفحات والسياسات" };

export default async function PagesAdmin() {
  await requireAdmin("pages.manage");
  const db = await getDb();
  const pages = await db.select().from(schema.pages).orderBy(asc(schema.pages.slug));
  return (
    <>
      <PageHeader title="الصفحات والسياسات" description="النصوص الحالية مسودات عامة. راجعها مع مستشارك القانوني، عدّلها لتطابق ممارستك الفعلية، ثم حدّد «تمت المراجعة». التنسيق: سطر فارغ لفقرة جديدة، ## للعناوين، - للنقاط." />
      <div className="space-y-3">
        {pages.map((p) => (
          <details key={p.slug} className="rounded-2xl border border-paper-2 bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4">
              <span className="font-medium">{p.titleAr}</span>
              <span className="text-xs text-metal-500" dir="ltr">/pages/{p.slug}</span>
              {p.reviewed ? <Badge tone="green">تمت المراجعة</Badge> : <Badge tone="amber">تحتاج مراجعة</Badge>}
              {!p.published ? <Badge tone="gray">مخفية</Badge> : null}
            </summary>
            <ActionForm action={savePage} className="grid gap-3 border-t border-paper-2 p-4 md:grid-cols-2">
              <input type="hidden" name="slug" value={p.slug} />
              <div><label className="label">العنوان</label><input name="titleAr" defaultValue={p.titleAr} className="field" /></div>
              <div><label className="label">Title</label><input name="titleEn" dir="ltr" defaultValue={p.titleEn} className="field" /></div>
              <div><label className="label">المحتوى</label><textarea name="bodyAr" rows={12} defaultValue={p.bodyAr} className="field" /></div>
              <div><label className="label">Content</label><textarea name="bodyEn" rows={12} dir="ltr" defaultValue={p.bodyEn} className="field" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={p.published} /> منشورة</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewed" defaultChecked={p.reviewed} /> تمت مراجعة النص ويطابق ممارسة المتجر</label>
              <div className="md:col-span-2"><SubmitButton>حفظ الصفحة</SubmitButton></div>
            </ActionForm>
          </details>
        ))}
      </div>
    </>
  );
}
