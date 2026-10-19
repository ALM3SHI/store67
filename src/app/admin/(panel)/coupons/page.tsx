import { asc, desc, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PageHeader, Card, Badge, Empty } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { saveCoupon, toggleCoupon } from "@/features/admin/misc-actions";
import { formatSAR, halalasToInput } from "@/lib/money";
import { savePromotion, togglePromotion, deletePromotion } from "@/features/admin/promotion-actions";

export const metadata = { title: "العروض والكوبونات" };

type C = typeof schema.coupons.$inferSelect;
type P = typeof schema.promotions.$inferSelect;
type ProductOpt = { id: string; nameAr: string };

const day = (x: Date | null | undefined) => (x ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(x) : "");

function PromotionForm({ p, products }: { p?: P; products: ProductOpt[] }) {
  return (
    <ActionForm action={savePromotion} className="grid gap-3 md:grid-cols-4" testId="promotion-form">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="md:col-span-2"><label className="label">اسم العرض (يظهر للعميل)</label><input name="nameAr" defaultValue={p?.nameAr} required className="field" placeholder="خصم 10% عند شراء قطعتين" /></div>
      <div className="md:col-span-2"><label className="label">Offer name (English)</label><input name="nameEn" dir="ltr" defaultValue={p?.nameEn} className="field" placeholder="10% off when you buy 2" /></div>
      <div><label className="label">النوع</label><select name="type" defaultValue={p?.type ?? "quantity"} className="field"><option value="quantity">خصم على الكمية</option><option value="bundle">باقة: اشترِها معًا</option></select></div>
      <div><label className="label">نسبة الخصم %</label><input name="percentOff" type="number" min={1} max={90} dir="ltr" defaultValue={p?.percentOff ?? 10} className="field" required /></div>
      <div><label className="label">أقل كمية (للكمية فقط)</label><input name="minQuantity" type="number" min={2} max={50} dir="ltr" defaultValue={p?.minQuantity ?? 2} className="field" /></div>
      <div className="grid grid-cols-2 gap-2"><div><label className="label">يبدأ</label><input name="startsAt" type="date" defaultValue={day(p?.startsAt)} className="field" /></div><div><label className="label">ينتهي</label><input name="endsAt" type="date" defaultValue={day(p?.endsAt)} className="field" /></div></div>
      <fieldset className="md:col-span-4">
        <legend className="label">المنتجات — للكمية: اتركها فارغة ليشمل كل المنتجات. للباقة: اختر منتجين أو أكثر.</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {products.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="productIds" value={x.id} defaultChecked={p?.productIds.includes(x.id)} /> {x.nameAr}</label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> مفعّل</label>
      <div className="md:col-span-3 md:text-end"><SubmitButton>{p ? "حفظ التعديلات" : "إنشاء العرض"}</SubmitButton></div>
    </ActionForm>
  );
}

function CouponForm({ c }: { c?: C }) {
  const d = day;
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
  const [rows, promos, products] = await Promise.all([
    db.select().from(schema.coupons).orderBy(desc(schema.coupons.createdAt)),
    db.select().from(schema.promotions).orderBy(desc(schema.promotions.createdAt)),
    db.select({ id: schema.products.id, nameAr: schema.products.nameAr }).from(schema.products).where(ne(schema.products.status, "archived")).orderBy(asc(schema.products.nameAr)),
  ]);
  const productName = (id: string) => products.find((x) => x.id === id)?.nameAr ?? "منتج محذوف";
  const now = new Date();
  const label = (c: C) => (c.type === "percent" ? `${c.value}٪` : c.type === "fixed" ? formatSAR(c.value, "ar") : "شحن مجاني");
  return (
    <>
      <PageHeader title="العروض والكوبونات" description="الخصم يُتحقق منه ويُحسب على الخادم عند كل طلب. الكوبونات المنتهية أو المستنفدة تُرفض تلقائيًا." />
      <section className="mb-10" aria-labelledby="auto-offers">
        <h2 id="auto-offers" className="mb-1 text-lg font-semibold">العروض التلقائية</h2>
        <p className="mb-4 max-w-[75ch] text-sm text-metal-500">تُطبَّق في السلة دون كود: خصم عند شراء كمية، أو خصم على باقة منتجات تُشترى معًا. كل منتج في السلة يأخذ عرضًا واحدًا (الأوفر للعميل)، والكوبون يُحسب على ما تبقى بعد العرض.</p>
        <Card title="عرض جديد" className="mb-4"><PromotionForm products={products} /></Card>
        {promos.length === 0 ? <Empty>لا توجد عروض تلقائية.</Empty> : (
          <div className="space-y-3" data-testid="promotions">
            {promos.map((p) => {
              const state = !p.active ? ["gray", "موقوف"] : p.endsAt && p.endsAt < now ? ["red", "منتهي"] : p.startsAt && p.startsAt > now ? ["amber", "مجدول"] : ["green", "فعّال"];
              return (
                <details key={p.id} className="rounded-2xl border border-paper-2 bg-white">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4">
                    <span className="font-medium">{p.nameAr}</span>
                    <span className="text-sm">{p.percentOff}٪ — {p.type === "bundle" ? `باقة: ${p.productIds.map(productName).join(" + ")}` : `${p.minQuantity}+ قطع${p.productIds.length ? ` من: ${p.productIds.map(productName).join("، ")}` : " من أي منتج"}`}</span>
                    <Badge tone={state[0] as "gray"}>{state[1]}</Badge>
                    <span className="ms-auto flex gap-2">
                      <form action={togglePromotion}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm">{p.active ? "إيقاف" : "تفعيل"}</button></form>
                      <form action={deletePromotion}><input type="hidden" name="id" value={p.id} /><button className="btn btn-ghost btn-sm text-danger">حذف</button></form>
                    </span>
                  </summary>
                  <div className="border-t border-paper-2 p-4"><PromotionForm p={p} products={products} /></div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <h2 className="mb-4 text-lg font-semibold">الكوبونات</h2>
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
