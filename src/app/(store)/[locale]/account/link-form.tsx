"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { requestOrdersLinkAction } from "@/features/customer-actions";

export function OrdersLinkForm() {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState(requestOrdersLinkAction, null);
  const msg = state ? (state.key === "sent" ? t.account.sent : state.key === "limited" ? t.account.limited : t.checkout.errors.email) : null;
  return (
    <form action={action} className="mt-6 space-y-3" data-testid="orders-link-form">
      <input type="hidden" name="locale" value={locale} />
      <label htmlFor="acc-email" className="label">{t.account.email}</label>
      <div className="flex flex-wrap gap-2">
        <input id="acc-email" name="email" type="email" required autoComplete="email" dir="ltr" className="field min-w-0 flex-1 text-start" />
        <button className="btn btn-primary" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : null} {t.account.send}</button>
      </div>
      {msg ? <p role={state?.ok ? "status" : "alert"} className={state?.ok ? "rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok" : "rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"}>{msg}</p> : null}
    </form>
  );
}
