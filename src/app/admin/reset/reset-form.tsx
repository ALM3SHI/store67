"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { completePasswordReset } from "@/features/admin/auth-actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completePasswordReset, null);
  return (
    <form action={action} className="space-y-4" data-testid="reset-form">
      {state && !state.ok ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.message}</p> : null}
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="label">كلمة المرور الجديدة</label>
        <input id="password" name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" dir="ltr" className="field text-start" />
        <p className="mt-1 text-xs text-metal-500">12 حرفًا على الأقل. سيُسجَّل خروجك من كل الأجهزة.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">تأكيد كلمة المرور</label>
        <input id="confirm" name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" dir="ltr" className="field text-start" />
      </div>
      <button className="btn btn-ink w-full" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : null} حفظ كلمة المرور</button>
    </form>
  );
}
