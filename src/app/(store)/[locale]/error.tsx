"use client";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, locale } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-x flex flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-semibold">{t.common.error}</h1>
      <p className="mt-2 text-metal-700">{locale === "ar" ? "حدّث الصفحة أو أعد المحاولة بعد لحظات." : "Refresh the page or try again in a moment."}</p>
      {error.digest ? <p className="mt-2 text-xs text-metal-500" dir="ltr">ref: {error.digest}</p> : null}
      <button className="btn btn-ink mt-8" onClick={reset}>{t.common.retry}</button>
    </div>
  );
}
