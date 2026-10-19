import { asc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Card, Empty } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { saveCategory, deleteCategory } from "@/features/admin/category-actions";

export const metadata = { title: "التصنيفات" };

type C = typeof schema.categories.$inferSelect;

function CategoryForm({ c }: { c?: C }) {
  return (
    <ActionForm action={saveCategory} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_6rem_auto] md:items-end" testId={c ? `category-form-${c.slug}` : "category-form"}>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div><label className="label">الاسم بالعربية</label><input name="nameAr" defaultValue={c?.nameAr} required className="field" /></div>
      <div><label className="label">Name (English)</label><input name="nameEn" dir="ltr" defaultValue={c?.nameEn} required className="field" /></div>
      <div><label className="label">المعرّف في الرابط</label><input name="slug" dir="ltr" defaultValue={c?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="personal-care" className="field" /></div>
      <div><label className="label">الترتيب</label><input name="sort" type="number" min={0} max={999} dir="ltr" defaultValue={c?.sort ?? 0} className="field" /></div>
      <SubmitButton>{c ? "حفظ" : "إضافة"}</SubmitButton>
    </ActionForm>
  );
}

export default async function Categories() {
  await requireAdmin("products.manage");
  const db = await getDb();
  const [cats, counts] = await Promise.all([
    db.select().from(schema.categories).orderBy(asc(schema.categories.sort), asc(schema.categories.nameAr)),
    db.select({ id: schema.products.categoryId, n: sql<number>`count(*)::int` }).from(schema.products).groupBy(schema.products.categoryId),
  ]);
  const count = (id: string) => counts.find((c) => c.id === id)?.n ?? 0;
  return (
    <>
      <PageHeader title="التصنيفات" description="تظهر التصنيفات كمرشّحات في صفحة المنتجات وفي بيانات المنتج لمحركات البحث. الترتيب الأصغر يظهر أولًا." />
      <Card title="تصنيف جديد" className="mb-6"><CategoryForm /></Card>
      {cats.length === 0 ? (
        <Empty>لا توجد تصنيفات بعد.</Empty>
      ) : (
        <div className="space-y-3" data-testid="category-list">
          {cats.map((c) => (
            <details key={c.id} className="rounded-2xl border border-paper-2 bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4">
                <span className="font-medium">{c.nameAr}</span>
                <span className="text-sm text-metal-500" dir="ltr">{c.nameEn} · /{c.slug}</span>
                <span className="ms-auto text-xs text-metal-500">{count(c.id)} منتج</span>
              </summary>
              <div className="space-y-4 border-t border-paper-2 p-4">
                <CategoryForm c={c} />
                <ActionForm action={deleteCategory} className="flex flex-wrap items-center gap-3 rounded-xl bg-paper p-3 text-sm">
                  <input type="hidden" name="id" value={c.id} />
                  {count(c.id) > 0 ? <label className="flex items-center gap-2"><input type="checkbox" name="confirm" /> أفهم أن {count(c.id)} منتج سيصبح بدون تصنيف</label> : null}
                  <SubmitButton variant="danger">حذف التصنيف</SubmitButton>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
