import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { listPublishedProducts } from "@/services/catalog";
import { getShell } from "@/services/storefront";
import { HeroStage, BenefitsSection, StepsSection, PromiseStrip, FaqSection, FinalCta } from "@/components/product/sections";
import { GalleryMosaic } from "@/components/product/gallery";
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
  const name = locale === "ar" ? product.nameAr : product.nameEn;

  return (
    <>
      <JsonLd data={organizationJsonLd(shell.settings, shell.storeName)} />
      <JsonLd data={productJsonLd(product, locale, shell.settings, shell.storeName)} />
      <HeroStage product={product} buy={buy} locale={locale} heroImage={heroImage} />
      <PromiseStrip settings={shell.settings} t={t} locale={locale} onlinePaymentsLive={shell.onlinePaymentsLive} codEnabled={shell.codEnabled} />

      <section className="container-x pt-16 md:pt-24" aria-labelledby="gallery">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="gallery" className="text-[1.65rem] font-semibold md:text-[2.1rem]">
            {name}
          </h2>
          <Link href={`/${locale}/products/${product.slug}`} className="text-[0.95rem] font-medium text-volt underline-offset-4 hover:underline">
            {locale === "ar" ? "المواصفات والتفاصيل الكاملة" : "Full specifications and details"}
          </Link>
        </div>
        <div className="mt-8">
          <GalleryMosaic media={product.media} productName={name} skipFirst={false} />
        </div>
      </section>

      <BenefitsSection product={product} t={t} locale={locale} />
      <StepsSection product={product} t={t} locale={locale} />
      <FaqSection faqs={product.faqs} t={t} locale={locale} />
      <FinalCta product={product} buy={buy} t={t} locale={locale} />

      {products.length > 1 ? (
        <section className="container-x py-16" aria-labelledby="more">
          <h2 id="more" className="text-2xl font-semibold">
            {t.nav.shop}
          </h2>
          <Link href={`/${locale}/products`} className="btn btn-ink mt-6">
            {t.search.viewAll}
          </Link>
        </section>
      ) : null}
    </>
  );
}
