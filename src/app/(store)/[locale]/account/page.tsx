import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { Package, MapPin, UserRound, Heart, LogOut } from "lucide-react";
import { getDictionary, fmt } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getDb, schema } from "@/lib/db";
import { accountOrders, getCustomer, loginChannels, type Customer } from "@/services/customer-auth";
import { Money } from "@/components/ui/price";
import { logout } from "@/features/account-actions";
import { SAUDI_CITIES } from "@/lib/saudi-cities";
import { AddressBook } from "@/components/account/address-book";
import { ProfilePanel } from "@/components/account/profile-panel";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.account.title, robots: { index: false, follow: false } };
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; welcome?: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const customer = await getCustomer();
  if (!customer) redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account`)}`);
  const tab = sp.tab === "addresses" || sp.tab === "profile" ? sp.tab : "orders";

  const nav = [
    { key: "orders", href: `/${locale}/account`, label: t.account.nav.orders, icon: Package },
    { key: "addresses", href: `/${locale}/account?tab=addresses`, label: t.account.nav.addresses, icon: MapPin },
    { key: "profile", href: `/${locale}/account?tab=profile`, label: t.account.nav.profile, icon: UserRound },
    { key: "wishlist", href: `/${locale}/wishlist`, label: t.account.nav.wishlist, icon: Heart },
  ];

  return (
    <section className="container-x py-10 md:py-14" data-testid="account-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] font-semibold">{customer.name ? fmt(t.account.hello, { name: customer.name.split(" ")[0]! }) : t.account.title}</h1>
          <p className="mt-1 text-sm text-metal-500" dir="ltr">{[customer.phone?.replace("+966", "0"), customer.email].filter(Boolean).join(" · ")}</p>
        </div>
        <form action={logout}>
          <input type="hidden" name="locale" value={locale} />
          <button className="btn btn-ghost btn-sm" data-testid="customer-logout"><LogOut size={15} /> {t.account.nav.logout}</button>
        </form>
      </div>
      {sp.welcome ? <p className="mt-6 rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">{t.account.welcome}</p> : null}

      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        <nav aria-label={t.account.title} className="flex gap-2 overflow-x-auto md:flex-col">
          {nav.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              aria-current={n.key === tab ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[0.95rem]", n.key === tab ? "bg-ink text-white" : "text-metal-700 hover:bg-paper-2")}
            >
              <n.icon size={17} aria-hidden /> {n.label}
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === "orders" ? <OrdersTab customer={customer} t={t} locale={locale} /> : null}
          {tab === "addresses" ? <AddressesTab customer={customer} locale={locale} /> : null}
          {tab === "profile" ? (
            <ProfilePanel
              name={customer.name}
              phone={customer.phone ? customer.phone.replace("+966", "0") : null}
              phoneVerified={Boolean(customer.phoneVerifiedAt)}
              email={customer.email}
              emailVerified={Boolean(customer.emailVerifiedAt)}
              marketing={customer.marketingOptIn}
              channels={loginChannels()}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

async function OrdersTab({ customer, t, locale }: { customer: Customer; t: Dictionary; locale: Locale }) {
  const orders = await accountOrders(customer);
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
  if (!orders.length) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-dashed border-metal-300 px-6 py-12 text-center">
        <p className="text-metal-700">{t.account.ordersEmpty}</p>
        <Link href={`/${locale}/products`} className="btn btn-primary mt-4">{t.wishlist.browse}</Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-paper-2 rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain" data-testid="account-orders">
      {orders.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <span className="min-w-32">
            <span className="block font-display font-semibold" dir="ltr">{o.number}</span>
            <span className="text-sm text-metal-500">{date.format(o.createdAt)} · {fmt(t.account.items, { n: o.items })}</span>
          </span>
          <span className="rounded-full bg-paper-2 px-3 py-1 text-sm">{t.status[o.status]}</span>
          <Money halalas={o.totalHalalas} locale={locale} />
          <a href={o.link} className="ms-auto text-sm font-medium text-volt underline-offset-4 hover:underline">{t.account.view}</a>
        </li>
      ))}
    </ul>
  );
}

async function AddressesTab({ customer, locale }: { customer: Customer; locale: Locale }) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.customerAddresses)
    .where(eq(schema.customerAddresses.customerId, customer.id))
    .orderBy(desc(schema.customerAddresses.isDefault), asc(schema.customerAddresses.createdAt));
  const cities = [...SAUDI_CITIES].sort((a, b) => (locale === "ar" ? a.ar.localeCompare(b.ar, "ar") : a.en.localeCompare(b.en)));
  return (
    <AddressBook
      addresses={rows.map((r) => ({
        id: r.id,
        label: r.label,
        recipientName: r.recipientName,
        phone: r.phone.replace("+966", "0"),
        city: r.city,
        district: r.district,
        street: r.street,
        nationalAddress: r.nationalAddress,
        postalCode: r.postalCode,
        isDefault: r.isDefault,
      }))}
      cities={cities}
      defaultName={customer.name}
      defaultPhone={customer.phone?.replace("+966", "0") ?? ""}
    />
  );
}
