"use client";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveSettingsGroup } from "@/features/admin/misc-actions";
import { SubmitButton, FormMessage, type ActionState } from "./ui";
import type { Settings } from "@/services/settings";
import { halalasToInput, parseSARToHalalas } from "@/lib/money";
import { SAUDI_CITIES } from "@/lib/saudi-cities";

type G<K extends keyof Settings> = { group: K; title: string; description?: string; initial: Settings[K]; children: (v: Settings[K], set: (patch: Partial<Settings[K]>) => void) => React.ReactNode };

function Group<K extends keyof Settings>({ group, title, description, initial, children }: G<K>) {
  const [v, setV] = useState(initial);
  const [state, action] = useActionState<ActionState, FormData>(saveSettingsGroup, null);
  return (
    <section id={group} className="scroll-mt-20 rounded-2xl border border-paper-2 bg-white p-5">
      <form action={action} className="space-y-4" data-testid={`settings-${group}`}>
        <input type="hidden" name="group" value={group} />
        <input type="hidden" name="payload" value={JSON.stringify(v)} />
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-metal-500">{description}</p> : null}
        </div>
        {children(v, (patch) => setV((x) => ({ ...x, ...patch })))}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>حفظ</SubmitButton>
          <FormMessage state={state} />
        </div>
      </form>
    </section>
  );
}

const Text = ({ label, value, onChange, dir, hint, type = "text" }: { label: string; value: string; onChange: (v: string) => void; dir?: "ltr"; hint?: string; type?: string }) => (
  <div>
    <label className="label">{label}</label>
    <input type={type} dir={dir} value={value} onChange={(e) => onChange(e.target.value)} className="field" />
    {hint ? <p className="mt-1 text-xs text-metal-500">{hint}</p> : null}
  </div>
);
const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
);
const Money = ({ label, value, onChange, nullable, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; nullable?: boolean; hint?: string }) => {
  const [raw, setRaw] = useState(halalasToInput(value));
  return (
    <div>
      <label className="label">{label}</label>
      <input
        dir="ltr"
        inputMode="decimal"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          if (e.target.value.trim() === "" && nullable) onChange(null);
          else {
            const h = parseSARToHalalas(e.target.value);
            if (h !== null) onChange(h);
          }
        }}
        className="field"
        placeholder={nullable ? "اتركه فارغًا للتعطيل" : "0"}
      />
      {hint ? <p className="mt-1 text-xs text-metal-500">{hint}</p> : null}
    </div>
  );
};

export function SettingsEditor({ s, webhookUrl, notificationTest }: { s: Settings; webhookUrl: string; notificationTest?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Group group="store" title="بيانات المتجر والتواصل" initial={s.store}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="اسم المتجر (عربي) — اتركه فارغًا لاستخدام الاسم الافتراضي" value={v.nameAr} onChange={(x) => set({ nameAr: x })} />
            <Text label="Store name (English)" dir="ltr" value={v.nameEn} onChange={(x) => set({ nameEn: x })} />
            <Text label="البريد الإلكتروني" dir="ltr" type="email" value={v.contactEmail} onChange={(x) => set({ contactEmail: x })} />
            <Text label="الهاتف" dir="ltr" value={v.contactPhone} onChange={(x) => set({ contactPhone: x })} />
            <Text label="واتساب" dir="ltr" value={v.whatsapp} onChange={(x) => set({ whatsapp: x.replace(/\D/g, "") })} hint="بالصيغة الدولية بدون + مثل 9665XXXXXXXX. فارغ = إخفاء زر واتساب." />
            <Text label="ساعات العمل" value={v.supportHoursAr} onChange={(x) => set({ supportHoursAr: x })} />
            <Text label="العنوان (عربي)" value={v.addressAr} onChange={(x) => set({ addressAr: x })} />
            <Text label="Address (English)" dir="ltr" value={v.addressEn} onChange={(x) => set({ addressEn: x })} />
            {(["instagram", "x", "tiktok", "snapchat", "youtube"] as const).map((k) => (
              <Text key={k} label={k} dir="ltr" value={v.socials[k]} onChange={(x) => set({ socials: { ...v.socials, [k]: x } })} hint="رابط كامل https://" />
            ))}
          </div>
        )}
      </Group>

      <Group group="theme" title="الألوان والصور" description="الشعار والاسم الافتراضي في src/config/brand.ts. هنا تتحكم بلون الأزرار ولون المجال المغناطيسي وصور البانر." initial={s.theme}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">لون الأزرار</label><input type="color" value={v.volt} onChange={(e) => set({ volt: e.target.value })} className="h-11 w-24 rounded-lg" /></div>
            <div><label className="label">لون التوهج</label><input type="color" value={v.field} onChange={(e) => set({ field: e.target.value })} className="h-11 w-24 rounded-lg" /></div>
            <Text label="صورة البانر الرئيسي (رابط)" dir="ltr" value={v.heroImageUrl} onChange={(x) => set({ heroImageUrl: x })} hint="ارفعها في صفحة المنتج ثم انسخ رابطها، أو اتركه فارغًا لاستخدام أول صورة للمنتج." />
            <Text label="صورة المشاركة الاجتماعية (رابط)" dir="ltr" value={v.ogImageUrl} onChange={(x) => set({ ogImageUrl: x })} />
          </div>
        )}
      </Group>

      <Group group="commerce" title="الأسعار والضريبة والطلبات" description="فعّل ضريبة القيمة المضافة فقط إذا كان المتجر مسجلًا فيها لدى هيئة الزكاة والضريبة والجمارك." initial={s.commerce}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <Check label="تطبيق ضريبة القيمة المضافة" checked={v.taxEnabled} onChange={(x) => set({ taxEnabled: x })} />
            <Check label="الأسعار المعروضة شاملة الضريبة" checked={v.pricesIncludeTax} onChange={(x) => set({ pricesIncludeTax: x })} />
            <Text label="نسبة الضريبة (%)" dir="ltr" value={String(v.taxRateBps / 100)} onChange={(x) => set({ taxRateBps: Math.round(Number(x || 0) * 100) })} />
            <Text label="مدة حجز المخزون للطلبات غير المدفوعة (دقيقة)" dir="ltr" value={String(v.reservationMinutes)} onChange={(x) => set({ reservationMinutes: Number(x || 0) })} />
            <Text label="مدة الاسترجاع (أيام)" dir="ltr" value={String(v.returnsWindowDays)} onChange={(x) => set({ returnsWindowDays: Number(x || 0) })} />
            <Text label="أقصى كمية من المنتج في الطلب" dir="ltr" value={String(v.maxQtyPerItem)} onChange={(x) => set({ maxQtyPerItem: Number(x || 1) })} />
          </div>
        )}
      </Group>

      <Group group="shipping" title="الشحن والتوصيل" description="السعر الثابت يُستخدم دائمًا، ويُستخدم كبديل إذا فشل حساب أرامكس. لا تكتب مدة توصيل غير مؤكدة." initial={s.shipping}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">مصدر السعر</label>
              <select value={v.rateSource} onChange={(e) => set({ rateSource: e.target.value as "flat" | "aramex" })} className="field">
                <option value="flat">سعر ثابت</option>
                <option value="aramex">حساب مباشر من أرامكس (يتطلب ربط الحساب)</option>
              </select>
            </div>
            <Money label="سعر الشحن الثابت (ر.س)" value={v.flatRateHalalas} onChange={(x) => set({ flatRateHalalas: x ?? 0 })} />
            <Money label="شحن مجاني للطلبات من (ر.س)" value={v.freeOverHalalas} nullable onChange={(x) => set({ freeOverHalalas: x })} />
            <Text label="مدة التوصيل التقديرية (عربي)" value={v.etaAr} onChange={(x) => set({ etaAr: x })} hint="مثال: ٢–٤ أيام عمل. فارغ = لا تُعرض." />
            <Text label="Estimated delivery (English)" dir="ltr" value={v.etaEn} onChange={(x) => set({ etaEn: x })} />
            <Text label="اسم شركة الشحن (للإدخال اليدوي)" value={v.carrierName} onChange={(x) => set({ carrierName: x })} />
            <Text label="رابط التتبع" dir="ltr" value={v.trackingUrlTemplate} onChange={(x) => set({ trackingUrlTemplate: x })} hint="استخدم {tracking} مكان رقم الشحنة." />
            <div>
              <label className="label">مدينة المستودع</label>
              <select value={v.originCity} onChange={(e) => set({ originCity: e.target.value })} className="field">{SAUDI_CITIES.map((c) => <option key={c.en} value={c.en}>{c.ar}</option>)}</select>
            </div>
            <Text label="عنوان المستودع (لأرامكس)" value={v.originLine1} onChange={(x) => set({ originLine1: x })} />
            <Text label="اسم المسؤول" value={v.originContactName} onChange={(x) => set({ originContactName: x })} />
            <Text label="هاتف المستودع" dir="ltr" value={v.originPhone} onChange={(x) => set({ originPhone: x })} />
            <div className="md:col-span-2" data-testid="city-rates">
              <label className="label">أسعار خاصة لبعض المدن (اختياري)</label>
              <p className="mb-2 text-xs text-metal-500">المدن غير المضافة هنا تستخدم السعر الثابت. يُطبّق حد الشحن المجاني على الجميع.</p>
              <div className="space-y-2">
                {v.cityRates.map((r, i) => (
                  <div key={r.city} className="grid items-end gap-2 rounded-xl border border-paper-2 p-2 sm:grid-cols-[1.2fr_0.8fr_1fr_1fr_auto]">
                    <select
                      aria-label="المدينة"
                      value={r.city}
                      onChange={(e) => set({ cityRates: v.cityRates.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)) })}
                      className="field"
                    >
                      {SAUDI_CITIES.filter((c) => c.en === r.city || !v.cityRates.some((x) => x.city === c.en)).map((c) => <option key={c.en} value={c.en}>{c.ar}</option>)}
                    </select>
                    <Money label="السعر (ر.س)" value={r.rateHalalas} onChange={(x) => set({ cityRates: v.cityRates.map((y, j) => (j === i ? { ...y, rateHalalas: x ?? 0 } : y)) })} />
                    <Text label="المدة (عربي)" value={r.etaAr} onChange={(x) => set({ cityRates: v.cityRates.map((y, j) => (j === i ? { ...y, etaAr: x } : y)) })} />
                    <Text label="ETA (English)" dir="ltr" value={r.etaEn} onChange={(x) => set({ cityRates: v.cityRates.map((y, j) => (j === i ? { ...y, etaEn: x } : y)) })} />
                    <button type="button" className="btn btn-ghost btn-sm text-danger" aria-label="حذف المدينة" onClick={() => set({ cityRates: v.cityRates.filter((_, j) => j !== i) })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {v.cityRates.length < SAUDI_CITIES.length ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2"
                  onClick={() => {
                    const free = SAUDI_CITIES.find((c) => !v.cityRates.some((x) => x.city === c.en));
                    if (free) set({ cityRates: [...v.cityRates, { city: free.en, rateHalalas: v.flatRateHalalas, etaAr: "", etaEn: "" }] });
                  }}
                >
                  <Plus size={15} /> إضافة سعر لمدينة
                </button>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <label className="label">مدن التوصيل (بدون تحديد = كل المدن)</label>
              <div className="flex flex-wrap gap-2">
                {SAUDI_CITIES.map((c) => (
                  <label key={c.en} className="flex items-center gap-1.5 rounded-full border border-paper-2 px-3 py-1 text-sm">
                    <input type="checkbox" checked={v.cities.includes(c.en)} onChange={(e) => set({ cities: e.target.checked ? [...v.cities, c.en] : v.cities.filter((x) => x !== c.en) })} />
                    {c.ar}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Group>

      <Group group="payments" title="طرق الدفع" description={`تظهر للعميل فقط الطرق المهيأة فعليًا. عنوان إشعارات Moyasar (Webhook): ${webhookUrl}`} initial={s.payments}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <Check label="تفعيل الدفع الإلكتروني (عند ربط Moyasar)" checked={v.onlineEnabled} onChange={(x) => set({ onlineEnabled: x })} />
            <Check label="تفعيل الدفع عند الاستلام" checked={v.codEnabled} onChange={(x) => set({ codEnabled: x })} />
            <Money label="رسوم الدفع عند الاستلام (ر.س)" value={v.codFeeHalalas} onChange={(x) => set({ codFeeHalalas: x ?? 0 })} />
            <Money label="أقصى قيمة طلب للدفع عند الاستلام" value={v.codMaxHalalas} nullable onChange={(x) => set({ codMaxHalalas: x })} />
            <div className="md:col-span-2">
              <label className="label">شعارات طرق الدفع المعروضة (فعّل ما هو مفعّل في حسابك لدى Moyasar فقط)</label>
              <div className="flex flex-wrap gap-3">
                {(["mada", "visa", "mastercard", "applepay", "stcpay"] as const).map((m) => (
                  <Check key={m} label={m} checked={v.advertisedMethods.includes(m)} onChange={(x) => set({ advertisedMethods: x ? [...v.advertisedMethods, m] : v.advertisedMethods.filter((y) => y !== m) })} />
                ))}
              </div>
            </div>
          </div>
        )}
      </Group>

      <Group group="announcements" title="شريط العروض" description="يعرض تلقائيًا معلومات حقيقية من إعداداتك (الشحن، طرق الدفع المفعّلة، الكوبونات المحددة للعرض)، إضافة إلى الرسائل التي تكتبها هنا." initial={s.announcements}>
        {(v, set) => (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4">
              <Check label="معلومات الشحن" checked={v.showShippingInfo} onChange={(x) => set({ showShippingInfo: x })} />
              <Check label="طرق الدفع" checked={v.showPaymentMethods} onChange={(x) => set({ showPaymentMethods: x })} />
              <Check label="الكوبونات" checked={v.showCoupons} onChange={(x) => set({ showCoupons: x })} />
            </div>
            {v.items.map((it, i) => (
              <div key={it.id} className="grid gap-2 rounded-xl bg-paper/60 p-2 md:grid-cols-[1fr_1fr_auto_auto]">
                <input value={it.textAr} maxLength={160} onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, textAr: e.target.value } : x)) })} placeholder="النص بالعربية" className="field" />
                <input dir="ltr" value={it.textEn} maxLength={160} onChange={(e) => set({ items: v.items.map((x, k) => (k === i ? { ...x, textEn: e.target.value } : x)) })} placeholder="English text" className="field" />
                <Check label="ظاهر" checked={it.active} onChange={(x) => set({ items: v.items.map((y, k) => (k === i ? { ...y, active: x } : y)) })} />
                <button type="button" onClick={() => set({ items: v.items.filter((_, k) => k !== i) })} className="p-2 text-danger" aria-label="حذف"><Trash2 size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={() => set({ items: [...v.items, { id: crypto.randomUUID(), textAr: "", textEn: "", active: true }] })} className="inline-flex items-center gap-1.5 text-sm font-medium text-volt"><Plus size={15} /> رسالة جديدة</button>
          </div>
        )}
      </Group>

      <Group group="seo" title="محركات البحث" initial={s.seo}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="عنوان الموقع (عربي)" value={v.titleAr} onChange={(x) => set({ titleAr: x })} />
            <Text label="Site title (English)" dir="ltr" value={v.titleEn} onChange={(x) => set({ titleEn: x })} />
            <Text label="وصف الموقع (عربي)" value={v.descriptionAr} onChange={(x) => set({ descriptionAr: x })} />
            <Text label="Site description (English)" dir="ltr" value={v.descriptionEn} onChange={(x) => set({ descriptionEn: x })} />
            <Text label="رمز تحقق Google Search Console" dir="ltr" value={v.googleSiteVerification} onChange={(x) => set({ googleSiteVerification: x })} hint="القيمة content فقط من وسم التحقق (HTML tag)." />
            <Check label="تفعيل خلاصة Google Merchant (/feeds/google-merchant.xml)" checked={v.merchantFeedEnabled} onChange={(x) => set({ merchantFeedEnabled: x })} />
          </div>
        )}
      </Group>

      <Group group="analytics" title="أدوات القياس" description="لا تُحمّل أي أداة إلا بعد موافقة الزائر في شريط الموافقة. اترك الحقل فارغًا لتعطيل الأداة." initial={s.analytics}>
        {(v, set) => (
          <div className="grid gap-4 md:grid-cols-3">
            <Text label="Google Analytics 4 (G-XXXX)" dir="ltr" value={v.ga4Id} onChange={(x) => set({ ga4Id: x.trim() })} />
            <Text label="Meta Pixel ID" dir="ltr" value={v.metaPixelId} onChange={(x) => set({ metaPixelId: x.trim() })} />
            <Text label="TikTok Pixel ID" dir="ltr" value={v.tiktokPixelId} onChange={(x) => set({ tiktokPixelId: x.trim() })} />
          </div>
        )}
      </Group>

      <Group
        group="notifications"
        title="الإشعارات والتنبيهات"
        description="البريد عبر Resend (RESEND_API_KEY و EMAIL_FROM)، والرسائل النصية عبر تقنيات (TAQNYAT_API_KEY و SMS_SENDER)، وتنبيهات تيليجرام عبر TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID."
        initial={s.notifications}
      >
        {(v, set) => (
          <div className="space-y-3">
            <Check label="إرسال بريد للعميل عند تأكيد الطلب وشحنه وتسليمه وإلغائه (إن أدخل بريده)" checked={v.customerEmails} onChange={(x) => set({ customerEmails: x })} />
            <Check label="رسالة SMS للعميل عند تأكيد الطلب وشحنه (تقنيات — كل رسالة بتكلفة)" checked={v.customerSms} onChange={(x) => set({ customerSms: x })} />
            <Check label="تنبيهي بكل طلب جديد مؤكد (مدفوع أو دفع عند الاستلام)" checked={v.newOrderAlerts} onChange={(x) => set({ newOrderAlerts: x })} />
            <Check label="تنبيهي عند حدوث أخطاء في الخادم (مرة واحدة لكل خطأ كل ساعة)" checked={v.errorAlerts} onChange={(x) => set({ errorAlerts: x })} />
            <Text label="بريد الفريق للتنبيهات" dir="ltr" value={v.adminEmails} onChange={(x) => set({ adminEmails: x })} hint="عنوان أو أكثر مفصولة بفاصلة. يُستخدم مع تيليجرام إن كان مهيأ." />
          </div>
        )}
      </Group>
      {notificationTest}

      <Group group="launch" title="تأكيدات ما قبل الإطلاق" description="حدّدها فقط بعد مراجعتها فعلًا. تظهر في قائمة جاهزية الإطلاق." initial={s.launch}>
        {(v, set) => (
          <div className="space-y-2">
            <Check label="راجعت أسعار المنتجات وهي نهائية" checked={v.pricesReviewed} onChange={(x) => set({ pricesReviewed: x })} />
            <Check label="راجعت أسعار الشحن ومدة التوصيل" checked={v.shippingReviewed} onChange={(x) => set({ shippingReviewed: x })} />
            <Check label="راجعت وصف المنتج ومواصفاته مع المصنّع" checked={v.productDataReviewed} onChange={(x) => set({ productDataReviewed: x })} />
          </div>
        )}
      </Group>
    </div>
  );
}
