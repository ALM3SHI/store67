"use client";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  const { t, locale } = useI18n();
  return (
    <div className="container-x flex flex-col items-center py-24 text-center">
      <LogoMark size={64} />
      <p className="mt-8 font-display text-6xl font-light text-metal-300" style={{ fontFamily: "var(--font-display)" }}>404</p>
      <h1 className="mt-4 text-2xl font-semibold">{t.common.notFoundTitle}</h1>
      <p className="mt-2 text-metal-700">{t.common.notFoundBody}</p>
      <Link href={`/${locale}`} className="btn btn-ink mt-8">{t.common.goHome}</Link>
    </div>
  );
}
