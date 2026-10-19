"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { verifyLoginCode } from "@/features/admin/auth-actions";

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyLoginCode, null);
  return (
    <form action={action} className="space-y-4" data-testid="verify-form">
      {state && !state.ok ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.message}</p> : null}
      <div>
        <label htmlFor="code" className="label">الرمز (6 أرقام) أو رمز استرداد</label>
        <input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="text" dir="ltr" maxLength={20} className="field text-center font-mono text-xl tracking-[0.3em]" />
        <p className="mt-1 text-xs text-metal-500">فقدت جوالك؟ استخدم أحد رموز الاسترداد التي حفظتها عند التفعيل.</p>
      </div>
      <button className="btn btn-ink w-full" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : null} تحقق</button>
    </form>
  );
}
