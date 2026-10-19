import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/components/brand/logo";
import { isResetTokenValid } from "@/services/password-reset";
import { ResetForm } from "./reset-form";

// The token is in the URL: never send it to another site as a referrer.
export const metadata: Metadata = { title: "كلمة مرور جديدة", referrer: "no-referrer" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = await isResetTokenValid(token);
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-panel)] bg-porcelain p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <h1 className="text-lg font-semibold">تعيين كلمة مرور جديدة</h1>
        </div>
        {valid ? (
          <ResetForm token={token} />
        ) : (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">الرابط غير صالح أو انتهت صلاحيته أو استُخدم من قبل.</p>
        )}
        <Link href={valid ? "/admin/login" : "/admin/forgot"} className="mt-4 inline-block text-sm text-volt">{valid ? "العودة لتسجيل الدخول" : "اطلب رابطًا جديدًا"}</Link>
      </div>
    </div>
  );
}
