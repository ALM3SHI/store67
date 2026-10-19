import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "استعادة كلمة المرور" };

export default function ForgotPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-panel)] bg-porcelain p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="text-lg font-semibold">استعادة كلمة المرور</h1>
            <p className="text-sm text-metal-500">نرسل رابطًا لبريد حسابك في لوحة التحكم</p>
          </div>
        </div>
        <ForgotForm />
        <Link href="/admin/login" className="mt-4 inline-block text-sm text-volt">العودة لتسجيل الدخول</Link>
      </div>
    </div>
  );
}
