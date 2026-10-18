import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getShell } from "@/services/storefront";
import { SAUDI_CITIES } from "@/lib/saudi-cities";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const shell = await getShell(locale);
  const allowed = shell.settings.shipping.cities;
  const cities = allowed.length ? SAUDI_CITIES.filter((c) => allowed.includes(c.en)) : SAUDI_CITIES;
  const sorted = [...cities].sort((a, b) => (locale === "ar" ? a.ar.localeCompare(b.ar, "ar") : a.en.localeCompare(b.en)));
  return (
    <div className="container-x py-8 md:py-12">
      <h1 className="mb-6 text-[1.9rem] font-semibold md:mb-8 md:text-[2.4rem]">{t.checkout.title}</h1>
      <CheckoutForm cities={sorted} paymentBadges={shell.paymentBadges} />
    </div>
  );
}
