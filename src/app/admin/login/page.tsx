import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { LogoMark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await getAdminSession()) redirect("/admin");
  const { reset } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-panel)] bg-porcelain p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 className="text-lg font-semibold">لوحة تحكم المتجر</h1>
            <p className="text-sm text-metal-500">للمصرّح لهم فقط</p>
          </div>
        </div>
        {reset ? <p role="status" className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">تغيّرت كلمة المرور. سجّل الدخول بها الآن.</p> : null}
        <LoginForm />
        <Link href="/admin/forgot" className="mt-4 inline-block text-sm text-volt">نسيت كلمة المرور؟</Link>
      </div>
    </div>
  );
}
