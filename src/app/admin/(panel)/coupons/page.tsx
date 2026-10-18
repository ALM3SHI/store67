import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Card, Badge, Empty } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { saveCoupon, toggleCoupon } from "@/features/admin/misc-actions";
import { formatSAR, halalasToInput } from "@/lib/money";

export const metadata = { title: "العروض والكوبونات" };

type C = typeof schema.coupons.$inferSelect;

function CouponForm({ c }: { c?: C }) {
  const d = (x: Date | null | undefined) => (x ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(x) : "");
  return (
    <ActionForm action={saveCoupon} className="grid gap-3 md:grid-cols-4" testId="coupon-form">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div><label className="label">الكود</label><input name="code" dir="ltr" defaultValue={c?.code} required className="field uppercase" /></div>
      <div><label className="label">النوع</label><select name="type" defaultValue={c?.type ?? "percent"} className="field"><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت (ر.س)</option><option value="free_shipping">شحن مجاني</option></select></div>
      <div><label className="label">القيمة</label><input name="value" dir="ltr" defaultValue={c ? (c.type === "fixed" ? halalasToInput(c.value) : String(c.value)) : ""} className="field" placeholder="10" /></div>
      <div><label className="label">الحد الأدنى للطلب (ر.س)</label><input name="minSubtotal" dir="ltr" defaultValue={c ? halalasToInput(c.minSubtotalHalalas) : "0"} className="field" /></div>
      <div><label className="label">أقصى خصم (ر.س، للنسبة)</label><input name="maxDiscount" dir="ltr" defaultValue={halalasToInput(c?.maxDiscountHalalas)} className="field" /></div>
      <div><label className="label">حد الاستخدام الكلي</label><input name="usageLimit" type="number" min={1} dir="ltr" defaultValue={c?.usageLimit ?? ""} className="field" /></div>
      <div><label className="label">لكل عميل</label><input name="perCustomerLimit" type="number" min={1} dir="ltr" defaultValue={c?.perCustomerLimit ?? ""} className="field" /></div>
      <div className="grid grid-cols-2 gap-2"><div><label className="label">يبدأ</label><input name="startsAt" type="date" defaultValue={d(c?.startsAt)} className="field" /></div><div><label className="label">ينتهي</label><input name="endsAt" type="date" defaultValue={d(c?.endsAt)} className="field" /></div></div>
      <div className="md:col-span-2"><label className="label">وصف للشريط العلوي (عربي)</label><input name="descriptionAr" defaultValue={c?.descriptionAr ?? ""} className="field" /></div>
      <div className="md:col-span-2"><label className="label">Banner text (English)</label><input name="descriptionEn" dir="ltr" defaultValue={c?.descriptionEn ?? ""} className="field" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> مفعّل</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showInBanner" defaultChecked={c?.showInBanner ?? false} /> إظهاره في شريط العروض</label>
      <div className="md:col-span-2 md:text-end"><SubmitButton>{c ? "حفظ التعديلات" : "إنشاء الكوبون"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function Coupons() {
  await requireAdmin("coupons.manage");
  const db = await getDb();
  const rows = await db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
  const now = new Date();
  const label = (c: C) => (c.type === "percent" ? `${c.value}٪` : c.type === "fixed" ? formatSAR(c.value, "ar") : "شحن مجاني");
  return (
    <>
      <PageHeader title="العروض والكوبونات" description="الخصم يُتحقق منه ويُحسب على الخادم عند كل طلب. الكوبونات المنتهية أو المستنفدة تُرفض تلقائيًا." />
      <Card title="كوبون جديد" className="mb-6"><CouponForm /></Card>
      {rows.length === 0 ? <Empty>لا توجد كوبونات.</Empty> : (
        <div className="space-y-3">
          {rows.map((c) => {
            const state = !c.active ? ["gray", "موقوف"] : c.endsAt && c.endsAt < now ? ["red", "منتهي"] : c.usageLimit !== null && c.usedCount >= c.usageLimit ? ["amber", "مستنفد"] : ["green", "فعّال"];
            return (
              <details key={c.id} className="rounded-2xl border border-paper-2 bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4">
                  <span className="font-display font-semibold" dir="ltr">{c.code}</span>
                  <span className="text-sm">{label(c)}</span>
                  <Badge tone={state[0] as "gray"}>{state[1]}</Badge>
                  <span className="text-xs text-metal-500">استُخدم {c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</span>
                  <form action={toggleCoupon} className="ms-auto"><input type="hidden" name="id" value={c.id} /><button className="btn btn-ghost btn-sm">{c.active ? "إيقاف" : "تفعيل"}</button></form>
                </summary>
                <div className="border-t border-paper-2 p-4"><CouponForm c={c} /></div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
