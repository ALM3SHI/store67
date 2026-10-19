import { CircleCheck, CircleSlash } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getAllSettings } from "@/services/settings";
import { paymentIntegrationStatus } from "@/services/payments/registry";
import { shippingIntegrationStatus } from "@/services/shipping/registry";
import { aiConfigured } from "@/services/assistant";
import { env } from "@/config/env";
import { PageHeader, Card } from "@/components/admin/static";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { emailConfigured, telegramConfigured, smsConfigured } from "@/services/notify";
import { sendTestNotification } from "@/features/admin/misc-actions";

export const metadata = { title: "إعدادات المتجر" };

export default async function SettingsPage() {
  await requireAdmin("settings.manage");
  const s = await getAllSettings();
  const pay = paymentIntegrationStatus();
  const ship = shippingIntegrationStatus();
  const rows = [
    { label: "قاعدة البيانات", ok: Boolean(env.databaseUrl), on: "PostgreSQL (DATABASE_URL)", off: "قاعدة محلية مدمجة (PGlite) — للتطوير فقط" },
    { label: "Moyasar — الدفع الإلكتروني", ok: pay.moyasar, on: env.moyasar.secretKey?.startsWith("sk_live") ? "مفاتيح حية" : "مفاتيح اختبار", off: "غير مربوط: MOYASAR_SECRET_KEY + MOYASAR_WEBHOOK_SECRET" },
    { label: "بوابة الاختبار", ok: !pay.test, on: "مغلقة", off: "مفعّلة (PAYMENTS_TEST_GATEWAY) — أغلقها في الإنتاج" },
    { label: "أرامكس", ok: ship.aramex, on: `مربوط (${env.aramex.baseUrl})`, off: "غير مربوط — الشحن يدوي بسعر ثابت" },
    { label: "تخزين الملفات", ok: env.storage.driver === "supabase", on: "Supabase Storage", off: "قرص محلي (./storage) — غير مناسب للاستضافة السحابية بدون قرص دائم" },
    { label: "مساعد الشراء الذكي", ok: aiConfigured(), on: "مفعّل (ANTHROPIC_API_KEY)", off: "إجابات من الأسئلة المتكررة فقط" },
    { label: "البريد الإلكتروني (Resend)", ok: emailConfigured(), on: `مفعّل — المرسل ${env.email.from}`, off: "غير مهيأ: RESEND_API_KEY + EMAIL_FROM — لن تصل رسائل للعملاء" },
    { label: "الرسائل النصية (تقنيات)", ok: smsConfigured(), on: `مربوطة — اسم المرسل ${env.sms.sender}`, off: "غير مربوطة: TAQNYAT_API_KEY + SMS_SENDER" },
    { label: "تنبيهات تيليجرام", ok: telegramConfigured(), on: "مفعّلة", off: "غير مهيأة: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID" },
    { label: "بيئة التشغيل", ok: env.appEnv === "production", on: "production", off: `${env.appEnv} — الفهرسة متوقفة` },
  ];
  return (
    <>
      <PageHeader title="إعدادات المتجر" description="كل الأسعار والسياسات والبيانات التجارية تُدار من هنا. المفاتيح السرية لا تُحفظ في قاعدة البيانات بل في متغيرات البيئة." />
      <Card title="حالة التكاملات" className="mb-6">
        <ul id="integrations" className="grid gap-2 text-sm md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-2">
              {r.ok ? <CircleCheck size={17} className="mt-0.5 shrink-0 text-ok" /> : <CircleSlash size={17} className="mt-0.5 shrink-0 text-metal-500" />}
              <span><span className="font-medium">{r.label}: </span>{r.ok ? r.on : r.off}</span>
            </li>
          ))}
        </ul>
      </Card>
      <SettingsEditor
        s={s}
        webhookUrl={`${env.appUrl}/api/payments/moyasar/webhook`}
        notificationTest={
          <ActionForm action={sendTestNotification} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-paper-2 bg-white p-4 text-sm" testId="notification-test">
            <span className="flex-1">احفظ الإعدادات أعلاه ثم أرسل رسالة تجريبية لبريد الفريق وتيليجرام للتأكد من وصولها.</span>
            <SubmitButton variant="ghost">إرسال تنبيه تجريبي</SubmitButton>
          </ActionForm>
        }
      />
    </>
  );
}
