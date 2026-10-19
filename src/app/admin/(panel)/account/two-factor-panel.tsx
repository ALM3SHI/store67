"use client";
import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { twoFactorAction, type TwoFactorState } from "@/features/admin/account-actions";
import { SubmitButton } from "@/components/admin/ui";

export function TwoFactorPanel({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const [state, action] = useActionState<TwoFactorState, FormData>(twoFactorAction, null);
  const [copied, setCopied] = useState(false);

  if (state?.step === "codes") {
    return (
      <div className="space-y-3" data-testid="recovery-codes">
        <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">احفظ رموز الاسترداد هذه في مكان آمن (تظهر مرة واحدة فقط). كل رمز يُستخدم مرة واحدة إذا فقدت جوالك.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-3 font-mono text-sm" dir="ltr">
          {state.codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(state.codes.join("\n")).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} نسخ الرموز
        </button>
      </div>
    );
  }

  if (state?.step === "scan") {
    return (
      <form action={action} className="space-y-3" data-testid="2fa-scan">
        <input type="hidden" name="intent" value="confirm" />
        <p className="text-sm">١. امسح الرمز بتطبيق المصادقة:</p>
        <div className="mx-auto w-48 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: state.qrSvg }} />
        <p className="text-xs text-metal-500">لا تستطيع المسح؟ أدخل هذا المفتاح يدويًا: <span className="select-all font-mono" dir="ltr" data-testid="2fa-secret">{state.secret}</span></p>
        <label className="block text-sm" htmlFor="tf-code">٢. أدخل الرمز المكوّن من 6 أرقام:</label>
        <input id="tf-code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} dir="ltr" className="field text-center font-mono text-lg tracking-[0.3em]" />
        {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
        <SubmitButton variant="ink">تفعيل</SubmitButton>
      </form>
    );
  }

  if (!enabled || state?.step === "done") {
    return (
      <form action={action} className="space-y-3">
        {state?.step === "done" ? <p role="status" className="text-sm text-ok">{state.message}</p> : null}
        <input type="hidden" name="intent" value="start" />
        <SubmitButton variant="ink" data-testid="2fa-start">إعداد التحقق بخطوتين</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-metal-700">رموز الاسترداد المتبقية: <strong>{recoveryLeft}</strong></p>
      {state?.step === "error" ? <p role="alert" className="text-sm text-danger">{state.message}</p> : null}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="tf-manage">رمز حالي للتأكيد</label>
          <input id="tf-manage" name="code" required dir="ltr" maxLength={20} className="field font-mono" />
        </div>
        <button name="intent" value="regenerate" className="btn btn-ghost btn-sm">رموز استرداد جديدة</button>
        <button name="intent" value="disable" className="btn btn-sm bg-danger text-white hover:opacity-90">إيقاف</button>
      </form>
    </div>
  );
}
