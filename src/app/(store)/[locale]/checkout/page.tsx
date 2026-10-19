import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getShell } from "@/services/storefront";
import { SAUDI_CITIES } from "@/lib/saudi-cities";
import { CheckoutForm, type CheckoutAccount } from "@/components/checkout/checkout-form";
import { getCustomer } from "@/services/customer-auth";
import { cartRemindersAvailable } from "@/services/cart-reminders";
import { getDb, schema } from "@/lib/db";
import { asc, desc, eq } from "drizzle-orm";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const [shell, customer, reminders] = await Promise.all([getShell(locale), getCustomer(), cartRemindersAvailable()]);
  const addresses = customer
    ? await (await getDb())
        .select()
        .from(schema.customerAddresses)
        .where(eq(schema.customerAddresses.customerId, customer.id))
        .orderBy(desc(schema.customerAddresses.isDefault), asc(schema.customerAddresses.createdAt))
    : [];
  const local = (p: string | null) => (p ? p.replace("+966", "0") : "");
  const account: CheckoutAccount | null = customer
    ? {
        name: customer.name,
        phone: local(customer.phone),
        email: customer.email ?? "",
        addresses: addresses.map((a) => ({ id: a.id, label: a.label, recipientName: a.recipientName, phone: local(a.phone), city: a.city, district: a.district, street: a.street, nationalAddress: a.nationalAddress, postalCode: a.postalCode, isDefault: a.isDefault })),
      }
    : null;
  const allowed = shell.settings.shipping.cities;
  const cities = allowed.length ? SAUDI_CITIES.filter((c) => allowed.includes(c.en)) : SAUDI_CITIES;
  const sorted = [...cities].sort((a, b) => (locale === "ar" ? a.ar.localeCompare(b.ar, "ar") : a.en.localeCompare(b.en)));
  return (
    <div className="container-x py-8 md:py-12">
      <h1 className="mb-6 text-[1.9rem] font-semibold md:mb-8 md:text-[2.4rem]">{t.checkout.title}</h1>
      <CheckoutForm cities={sorted} paymentBadges={shell.paymentBadges} account={account} cartReminders={reminders} />
    </div>
  );
}
