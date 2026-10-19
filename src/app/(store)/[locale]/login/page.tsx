import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getCustomer, loginChannels } from "@/services/customer-auth";
import { env } from "@/config/env";
import { LoginForm } from "@/components/account/login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.account.loginTitle, robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const { next } = await searchParams;
  if (await getCustomer()) redirect(next && next.startsWith(`/${locale}/`) ? next : `/${locale}/account`);
  const ch = loginChannels();
  return (
    <section className="container-x grid min-h-[60vh] max-w-md place-items-center py-12">
      <div className="w-full">
        <h1 className="text-[1.9rem] font-semibold">{t.account.loginTitle}</h1>
        <p className="mt-2 leading-7 text-metal-700">{t.account.loginIntro}</p>
        <LoginForm next={next ?? ""} dev={env.appEnv !== "production"} channels={ch} />
      </div>
    </section>
  );
}
