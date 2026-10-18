import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { LogoMark } from "@/components/brand/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");
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
        <LoginForm />
      </div>
    </div>
  );
}
