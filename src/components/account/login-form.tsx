"use client";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { requestLoginCode, verifyLoginCode, type CodeStep } from "@/features/account-actions";

type Err = keyof ReturnType<typeof useI18n>["t"]["account"]["errors"];

export function LoginForm({ next, dev, channels }: { next: string; dev: boolean; channels: { sms: boolean; email: boolean } }) {
  const { t, locale } = useI18n();
  const [sendState, send, sending] = useActionState<CodeStep | null, FormData>(requestLoginCode, null);
  const [verifyState, verify, verifying] = useActionState<CodeStep | null, FormData>(verifyLoginCode, null);
  const [restart, setRestart] = useState(0);
  // The code form follows the latest code that was sent; a verify error only applies to that code.
  const codeStep =
    restart === 0 && sendState?.step === "code"
      ? verifyState?.step === "code" && verifyState.otpId === sendState.otpId
        ? verifyState
        : sendState
      : null;
  const err = (e?: string) => (e ? t.account.errors[e as Err] ?? t.common.error : null);

  const placeholder = channels.sms && channels.email ? t.account.identifierHint : channels.sms ? "05XXXXXXXX" : "name@example.com";

  if (codeStep) {
    return (
      <form action={verify} className="mt-6 space-y-3" data-testid="login-code-form">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="otpId" value={codeStep.otpId} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm text-metal-700">{t.account.codeSentTo.split("{target}")[0]}<bdi dir="ltr">{codeStep.masked}</bdi>{t.account.codeSentTo.split("{target}")[1]}</p>
        <label htmlFor="login-code" className="label">{t.account.code}</label>
        <input id="login-code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} dir="ltr" autoFocus className="field text-center font-mono text-2xl tracking-[0.5em]" />
        {codeStep.error ? <p role="alert" className="text-sm text-danger">{err(codeStep.error)}</p> : null}
        <button className="btn btn-primary w-full" disabled={verifying}>{verifying ? <LoaderCircle size={16} className="animate-spin" /> : null} {t.account.verify}</button>
        {sendState?.step === "code" && sendState.devCode ? (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn" data-testid="dev-code">
            {locale === "ar" ? "بيئة تطوير (لا يوجد مزود رسائل): الرمز هو " : "Development (no message provider): the code is "}
            <span className="font-mono font-bold" dir="ltr">{sendState.devCode}</span>
          </p>
        ) : dev ? (
          <p className="text-xs text-metal-500">{t.account.devHint}</p>
        ) : null}
        <button type="button" className="text-sm text-volt underline-offset-4 hover:underline" onClick={() => setRestart((n) => n + 1)}>{t.account.resend}</button>
      </form>
    );
  }

  return (
    <form
      action={(fd) => {
        setRestart(0);
        return send(fd);
      }}
      className="mt-6 space-y-3"
      data-testid="login-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <label htmlFor="login-id" className="label">{t.account.identifier}</label>
      <input id="login-id" name="identifier" required autoComplete="username" dir="ltr" placeholder={placeholder} className="field text-start" />
      {sendState?.step === "identify" && sendState.error ? <p role="alert" className="text-sm text-danger">{err(sendState.error)}</p> : null}
      <button className="btn btn-primary w-full" disabled={sending}>{sending ? <LoaderCircle size={16} className="animate-spin" /> : null} {t.account.sendCode}</button>
    </form>
  );
}
