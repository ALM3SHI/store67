"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { forgotPassword } from "@/features/admin/auth-actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPassword, null);
  return (
    <form action={action} className="space-y-4" data-testid="forgot-form">
      {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok" : "rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"}>{state.message}</p> : null}
      <div>
        <label htmlFor="email" className="label">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" required autoComplete="username" dir="ltr" className="field text-start" />
      </div>
      <button className="btn btn-ink w-full" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : null} إرسال رابط الاستعادة</button>
    </form>
  );
}
