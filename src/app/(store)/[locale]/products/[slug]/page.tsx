import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getPublishedProduct, listApprovedReviews } from "@/services/catalog";
import { getShell } from "@/services/storefront";
import { BenefitsSection, StepsSection, SpecsSection, PromiseStrip, FaqSection, ReviewsSection, FinalCta } from "@/components/product/sections";
import { Gallery } from "@/components/product/gallery";
import { BuyBox } from "@/components/product/buy-box";
import { ViewItem } from "@/components/product/view-item";
import { toBuyProduct } from "@/features/product/view";
import { JsonLd, breadcrumbJsonLd, productJsonLd, absUrl } from "@/lib/seo";
import { env } from "@/config/env";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  const p = await getPublishedProduct(slug);
  if (!p) return { title: "404" };
  const title = (locale === "ar" ? p.seoTitleAr : p.seoTitleEn) || (locale === "ar" ? p.nameAr : p.nameEn);
  const description = (locale === "ar" ? p.seoDescAr : p.seoDescEn) || (locale === "ar" ? p.shortAr : p.shortEn);
  const img = p.media.find((m) => m.kind === "image");
  return {
    title,
    description,
    alternates: { canonical: `/${locale}/products/${p.slug}`, languages: { ar: `/ar/products/${p.slug}`, en: `/en/products/${p.slug}` } },
    openGraph: { type: "website", title, description, url: absUrl(`/${locale}/products/${p.slug}`), images: img ? [{ url: img.url, width: img.width ?? 1600, height: img.height ?? 1600, alt: locale === "ar" ? img.altAr : img.altEn }] : [] },
    keywords: p.keywords || undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  const t = getDictionary(locale);
  const product = await getPublishedProduct(slug);
  if (!product) notFound();
  const [shell, reviews] = await Promise.all([getShell(locale), listApprovedReviews(product.id)]);
  const buy = toBuyProduct(product, shell.settings, t);
  const name = locale === "ar" ? product.nameAr : product.nameEn;
  const showDrafts = env.appEnv !== "production";
  const v = product.variants[0]!;

  return (
    <>
      <JsonLd data={productJsonLd(product, locale, shell.settings, shell.storeName)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t.nav.home, path: `/${locale}` },
          { name: t.nav.shop, path: `/${locale}/products` },
          { name, path: `/${locale}/products/${product.slug}` },
        ])}
      />
      <ViewItem id={v.id} name={product.nameEn} value={v.priceHalalas / 100} />

      <div className="container-x pt-6">
        <nav aria-label="breadcrumb" className="text-sm text-metal-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href={`/${locale}`} className="hover:text-ink">{t.nav.home}</Link></li>
            <li aria-hidden>/</li>
            <li><Link href={`/${locale}/products`} className="hover:text-ink">{t.nav.shop}</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">{name}</li>
          </ol>
        </nav>
      </div>

      <section className="container-x grid gap-10 pb-16 pt-6 md:grid-cols-[1.1fr_1fr] md:gap-14 md:pb-20" aria-labelledby="product-title">
        <div className="md:sticky md:top-24 md:self-start">
          <Gallery media={product.media} productName={name} showPlaceholderNote />
        </div>
        <div className="space-y-6">
          <div>
            {product.category ? <p className="text-sm text-metal-500">{locale === "ar" ? product.category.nameAr : product.category.nameEn}</p> : null}
            <h1 id="product-title" className="mt-1 text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-tight">
              {name}
            </h1>
            <p className="mt-2 text-xl text-metal-700">{locale === "ar" ? product.taglineAr : product.taglineEn}</p>
          </div>
          <p className="max-w-[56ch] leading-8 text-metal-700">{locale === "ar" ? product.shortAr : product.shortEn}</p>
          <BuyBox product={buy} tone="light" showShare />
          {product.highlights.length ? (
            <div className="border-t border-paper-2 pt-6">
              <h2 className="text-base font-semibold">{t.product.highlights}</h2>
              <ul className="mt-3 space-y-2 text-metal-700">
                {product.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-volt" aria-hidden />
                    {locale === "ar" ? h.ar : h.en}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <PromiseStrip settings={shell.settings} t={t} locale={locale} onlinePaymentsLive={shell.onlinePaymentsLive} codEnabled={shell.codEnabled} />
      <BenefitsSection product={product} t={t} locale={locale} />
      <StepsSection product={product} t={t} locale={locale} />
      <SpecsSection product={product} t={t} locale={locale} showDrafts={showDrafts} />
      <FaqSection faqs={product.faqs} t={t} locale={locale} />
      <ReviewsSection reviews={reviews} product={product} t={t} locale={locale} />
      <FinalCta product={product} buy={buy} t={t} locale={locale} />
    </>
  );
}
