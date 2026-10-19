"use client";
import { useActionState, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { saveProfile, requestLinkCode, confirmLinkCode, deleteMyAccount, type SimpleState, type LinkStep } from "@/features/account-actions";

type Err = keyof ReturnType<typeof useI18n>["t"]["account"]["errors"];

function LinkField({ kind, value, verified, available }: { kind: "mobile" | "email"; value: string | null; verified: boolean; available: boolean }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [sendState, send] = useActionState<LinkStep | null, FormData>(requestLinkCode, null);
  const [confirmState, confirm] = useActionState<LinkStep | null, FormData>(confirmLinkCode, null);
  const err = (e?: string) => (e ? t.account.errors[e as Err] ?? t.common.error : null);
  const step = confirmState?.step === "done" ? confirmState : sendState?.step === "code" ? (confirmState?.step === "code" && confirmState.otpId === sendState.otpId ? confirmState : sendState) : sendState;
  const label = kind === "mobile" ? t.account.mobile : t.account.email;

  return (
    <div className="rounded-xl border border-paper-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-metal-500">{label}</p>
          <p className="font-medium" dir="ltr">{value || <span className="text-metal-500">{t.account.notSet}</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          {value && verified ? <span className="inline-flex items-center gap-1 text-xs text-ok"><BadgeCheck size={14} /> {t.account.verified}</span> : null}
          {available && !open && step?.step !== "done" ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>{value ? t.account.change : t.account.add}</button>
          ) : null}
        </div>
      </div>
      {step?.step === "done" ? <p role="status" className="mt-2 text-sm text-ok">{t.account.saved}</p> : null}
      {open && step?.step !== "done" ? (
        step?.step === "code" ? (
          <form action={confirm} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="otpId" value={step.otpId} />
            <div className="min-w-40 flex-1">
              <label className="label" htmlFor={`lc-${kind}`}>{t.account.codeSentTo.split("{target}")[0]}<bdi dir="ltr">{step.masked}</bdi>{t.account.codeSentTo.split("{target}")[1]}</label>
              <input id={`lc-${kind}`} name="code" required inputMode="numeric" maxLength={6} dir="ltr" autoComplete="one-time-code" className="field font-mono tracking-[0.3em]" />
            </div>
            <button className="btn btn-primary btn-sm">{t.account.save}</button>
            {sendState?.step === "code" && sendState.devCode ? <p className="w-full text-xs text-warn" data-testid="dev-code">DEV: <span className="font-mono" dir="ltr">{sendState.devCode}</span></p> : null}
            {step.error ? <p role="alert" className="w-full text-sm text-danger">{err(step.error)}</p> : null}
          </form>
        ) : (
          <form action={send} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor={`li-${kind}`}>{label} — {t.account.linkIntro}</label>
              <input id={`li-${kind}`} name="identifier" required dir="ltr" type={kind === "email" ? "email" : "tel"} placeholder={kind === "email" ? "name@example.com" : "05XXXXXXXX"} className="field text-start" />
            </div>
            <button className="btn btn-primary btn-sm">{t.account.sendCode}</button>
            {step?.step === "identify" && step.error ? <p role="alert" className="w-full text-sm text-danger">{err(step.error)}</p> : null}
          </form>
        )
      ) : null}
    </div>
  );
}

export function ProfilePanel(p: { name: string; phone: string | null; phoneVerified: boolean; email: string | null; emailVerified: boolean; marketing: boolean; channels: { sms: boolean; email: boolean } }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<SimpleState, FormData>(saveProfile, null);
  const [delState, del] = useActionState<SimpleState, FormData>(deleteMyAccount, null);
  return (
    <div className="space-y-6" data-testid="profile-panel">
      <form action={action} className="space-y-3 rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-5">
        <input type="hidden" name="locale" value={locale} />
        <label className="label" htmlFor="pf-name">{t.account.name}</label>
        <input id="pf-name" name="name" required minLength={2} maxLength={80} defaultValue={p.name} autoComplete="name" className="field" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="marketing" defaultChecked={p.marketing} /> {t.account.marketing}</label>
        {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-ok" : "text-sm text-danger"}>{state.ok ? t.account.saved : t.checkout.errors.name}</p> : null}
        <button className="btn btn-primary btn-sm" disabled={pending}>{t.account.save}</button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        <LinkField kind="mobile" value={p.phone} verified={p.phoneVerified} available={p.channels.sms} />
        <LinkField kind="email" value={p.email} verified={p.emailVerified} available={p.channels.email} />
      </div>

      <details className="rounded-[var(--radius-panel)] border border-danger/30 p-5">
        <summary className="cursor-pointer font-medium text-danger">{t.account.deleteTitle}</summary>
        <form action={del} className="mt-3 space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <p className="text-sm text-metal-700">{t.account.deleteBody}</p>
          <input name="confirm" required placeholder={t.account.deleteConfirmWord} className="field max-w-60" aria-label={t.account.deleteTitle} />
          {delState && !delState.ok ? <p role="alert" className="text-sm text-danger">{t.account.deleteBody}</p> : null}
          <button className="btn btn-sm bg-danger text-white hover:opacity-90">{t.account.deleteButton}</button>
        </form>
      </details>
    </div>
  );
}
