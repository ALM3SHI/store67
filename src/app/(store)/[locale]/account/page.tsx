import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDictionary, fmt } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { CUSTOMER_COOKIE, ordersForEmail, readToken } from "@/services/customer-access";
import { Money } from "@/components/ui/price";
import { customerSignOut } from "@/features/customer-actions";
import { OrdersLinkForm } from "./link-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.account.title, robots: { index: false, follow: false } };
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ invalid?: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const email = readToken("session", (await cookies()).get(CUSTOMER_COOKIE)?.value);
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  if (!email) {
    return (
      <section className="container-x max-w-xl py-12 md:py-16">
        <h1 className="text-[1.9rem] font-semibold">{t.account.title}</h1>
        <p className="mt-2 leading-8 text-metal-700">{t.account.intro}</p>
        {sp.invalid ? <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{t.account.invalidLink}</p> : null}
        <OrdersLinkForm />
        <p className="mt-6 text-sm text-metal-500">
          {t.account.noEmailHint} <Link href={`/${locale}/track`} className="text-volt underline-offset-4 hover:underline">{t.nav.track}</Link>
        </p>
      </section>
    );
  }

  const orders = await ordersForEmail(email);
  return (
    <section className="container-x max-w-3xl py-12 md:py-16" data-testid="my-orders">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] font-semibold">{t.account.title}</h1>
          <p className="mt-1 text-sm text-metal-500">{t.account.signedInAs} <bdi dir="ltr">{email}</bdi></p>
        </div>
        <form action={customerSignOut}>
          <input type="hidden" name="locale" value={locale} />
          <button className="btn btn-ghost btn-sm">{t.account.signOut}</button>
        </form>
      </div>
      {orders.length === 0 ? (
        <p className="mt-8 text-metal-700">{t.account.empty}</p>
      ) : (
        <ul className="mt-8 divide-y divide-paper-2 rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain">
          {orders.map((o) => (
            <li key={o.number} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
              <span className="min-w-32">
                <span className="block font-display font-semibold" dir="ltr">{o.number}</span>
                <span className="text-sm text-metal-500">{date.format(o.createdAt)} · {fmt(t.account.items, { n: o.items })}</span>
              </span>
              <span className="rounded-full bg-paper-2 px-3 py-1 text-sm">{t.status[o.status]}</span>
              <Money halalas={o.totalHalalas} locale={locale} />
              <a href={o.link} className="ms-auto text-sm font-medium text-volt underline-offset-4 hover:underline" data-testid="my-order-link">{t.account.view}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
