import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { PENDING_COOKIE, readPendingLogin } from "@/services/two-factor";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "رمز التحقق" };

export default async function VerifyPage() {
  if (!readPendingLogin((await cookies()).get(PENDING_COOKIE)?.value)) redirect("/admin/login?expired=1");
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-panel)] bg-porcelain p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="text-lg font-semibold">التحقق بخطوتين</h1>
            <p className="text-sm text-metal-500">أدخل الرمز من تطبيق المصادقة على جوالك</p>
          </div>
        </div>
        <VerifyForm />
        <Link href="/admin/login" className="mt-4 inline-block text-sm text-volt">رجوع</Link>
      </div>
    </div>
  );
}
