import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { listPublishedProducts } from "@/services/catalog";
import { getShell } from "@/services/storefront";
import { HeroStage, BenefitsSection, StepsSection, PromiseStrip, FaqSection, FinalCta, CollectionSection } from "@/components/product/sections";
import { toBuyProduct } from "@/features/product/view";
import { JsonLd, organizationJsonLd, productJsonLd } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  return { alternates: { canonical: `/${locale}`, languages: { ar: "/ar", en: "/en", "x-default": "/ar" } } };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const [products, shell] = await Promise.all([listPublishedProducts(), getShell(locale)]);
  const product = products[0];

  if (!product) {
    return (
      <section className="container-x py-24 text-center">
        <h1 className="text-3xl font-semibold">{shell.storeName}</h1>
        <p className="mt-3 text-metal-700">{t.product.unavailable}</p>
      </section>
    );
  }

  const buy = toBuyProduct(product, shell.settings, t);
  const heroImage = shell.settings.theme.heroImageUrl || product.media[0]?.url || "";

  return (
    <>
      <JsonLd data={organizationJsonLd(shell.settings, shell.storeName)} />
      <JsonLd data={productJsonLd(product, locale, shell.settings, shell.storeName)} />
      <HeroStage product={product} buy={buy} locale={locale} heroImage={heroImage} />
      <PromiseStrip settings={shell.settings} t={t} locale={locale} onlinePaymentsLive={shell.onlinePaymentsLive} codEnabled={shell.codEnabled} />

      <CollectionSection products={products} buys={products.map((p) => toBuyProduct(p, shell.settings, t))} t={t} locale={locale} />

      <BenefitsSection product={product} t={t} locale={locale} />
      <StepsSection product={product} t={t} locale={locale} />
      <FaqSection faqs={product.faqs} t={t} locale={locale} />
      <FinalCta product={product} buy={buy} t={t} locale={locale} />

    </>
  );
}
