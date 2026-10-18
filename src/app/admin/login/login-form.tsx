"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { login } from "@/features/admin/auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4" data-testid="login-form">
      {state?.error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <div>
        <label htmlFor="email" className="label">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" required autoComplete="username" dir="ltr" className="field text-start" />
      </div>
      <div>
        <label htmlFor="password" className="label">كلمة المرور</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" className="field text-start" />
      </div>
      <button className="btn btn-ink w-full" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : null} دخول</button>
    </form>
  );
}
