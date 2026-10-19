import { requireAdmin } from "@/lib/auth/session";
import { roleLabels } from "@/lib/auth/permissions";
import { PageHeader, Card, Badge } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { changeOwnPassword } from "@/features/admin/misc-actions";
import { twoFactorStatus } from "@/services/two-factor";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata = { title: "حسابي" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const me = await requireAdmin("dashboard.view");
  const sp = await searchParams;
  const tf = await twoFactorStatus(me.userId);
  return (
    <>
      <PageHeader title="حسابي" description={`${me.name} — ${me.email} — ${roleLabels[me.role]}`} />
      {sp.recovery ? (
        <p className="mb-4 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">دخلت برمز استرداد، وقد أصبح غير صالح الآن. بقي لديك {tf.recoveryLeft} رمز. إن فقدت جوالك فأعد إعداد التحقق بخطوتين أو أنشئ رموزًا جديدة.</p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="التحقق بخطوتين" actions={tf.enabled ? <Badge tone="green">مفعّل</Badge> : <Badge tone="amber">غير مفعّل</Badge>}>
          <p className="mb-4 text-sm leading-7 text-metal-700">
            بعد كلمة المرور يُطلب رمز من تطبيق مصادقة على جوالك (Google Authenticator أو Microsoft Authenticator أو غيرهما). حتى لو سُرقت كلمة المرور لا يستطيع أحد الدخول بدون جوالك.
          </p>
          <TwoFactorPanel enabled={tf.enabled} recoveryLeft={tf.recoveryLeft} />
        </Card>
        <Card title="تغيير كلمة المرور">
          <ActionForm action={changeOwnPassword} className="grid gap-3">
            <input name="password" type="password" minLength={12} autoComplete="new-password" placeholder="كلمة مرور جديدة (12 حرفًا على الأقل)" dir="ltr" className="field" required />
            <p className="text-xs text-metal-500">سيُسجَّل خروجك من الأجهزة الأخرى.</p>
            <SubmitButton variant="ink">تغيير</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
