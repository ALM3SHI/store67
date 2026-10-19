import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { listPublishedProducts } from "@/services/catalog";
import { getShell } from "@/services/storefront";
import { PromiseStrip, CollectionSection } from "@/components/product/sections";
import { HeroShowcase, type ShowcaseItem } from "@/components/home/hero-showcase";
import { StoreFaq, StoreCta } from "@/components/home/store-sections";
import { posterFor, toBuyProduct } from "@/features/product/view";
import { JsonLd, itemListJsonLd, organizationJsonLd } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  return { alternates: { canonical: `/${locale}`, languages: { ar: "/ar", en: "/en", "x-default": "/ar" } } };
}

/**
 * The home page speaks for the whole store: a hero that shows one product at a
 * time (switchable), every product in the collection, then store-wide answers
 * (shipping, returns, payment, tracking) taken from the settings. Each
 * product's own story, steps and FAQ live on its product page.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const [products, shell] = await Promise.all([listPublishedProducts(), getShell(locale)]);
  const L = (ar: string, en: string) => (locale === "ar" ? ar || en : en || ar);

  if (products.length === 0) {
    return (
      <section className="container-x py-24 text-center">
        <h1 className="text-3xl font-semibold">{shell.storeName}</h1>
        <p className="mt-3 text-metal-700">{t.product.unavailable}</p>
      </section>
    );
  }

  // Featured products lead the hero; otherwise the admin's sort order is kept.
  const ordered = [...products].sort((a, b) => Number(b.featured) - Number(a.featured));
  const buys = new Map(products.map((p) => [p.id, toBuyProduct(p, shell.settings, t)]));
  const names = ordered.map((p) => L(p.nameAr, p.nameEn));
  const heroImage = shell.settings.theme.heroImageUrl;

  const items: ShowcaseItem[] = ordered.map((p, i) => ({
    slug: p.slug,
    name: L(p.nameAr, p.nameEn),
    tagline: L(p.taglineAr, p.taglineEn),
    short: L(p.shortAr, p.shortEn),
    highlights: p.highlights.map((h) => L(h.ar, h.en)),
    model3d: p.model3d,
    // A custom hero image (settings → theme) replaces the first product's poster.
    poster: i === 0 && heroImage && !p.model3d ? heroImage : posterFor(p),
    imageAlt: L(p.media[0]?.altAr ?? "", p.media[0]?.altEn ?? ""),
    buy: buys.get(p.id)!,
  }));

  const listFormat = new Intl.ListFormat(locale === "ar" ? "ar" : "en", { style: "long", type: "conjunction" });
  const intro =
    products.length > 1
      ? t.home.intro.replace("{n}", String(products.length)).replace("{list}", listFormat.format(names))
      : L(ordered[0]!.shortAr, ordered[0]!.shortEn);

  return (
    <>
      <JsonLd data={organizationJsonLd(shell.settings, shell.storeName)} />
      <JsonLd data={itemListJsonLd(ordered.map((p) => ({ name: L(p.nameAr, p.nameEn), path: `/${locale}/products/${p.slug}` })))} />
      <HeroShowcase
        locale={locale}
        storeName={shell.storeName}
        title={t.home.title}
        intro={intro}
        items={items}
        detailsLabel={t.home.details}
        chooseLabel={t.home.choose}
      />
      <PromiseStrip settings={shell.settings} t={t} locale={locale} onlinePaymentsLive={shell.onlinePaymentsLive} codEnabled={shell.codEnabled} />
      <CollectionSection products={ordered} buys={ordered.map((p) => buys.get(p.id)!)} t={t} locale={locale} />
      <StoreFaq settings={shell.settings} t={t} locale={locale} onlinePaymentsLive={shell.onlinePaymentsLive} codEnabled={shell.codEnabled} paymentBadges={shell.paymentBadges} />
      <StoreCta t={t} locale={locale} productNames={ordered.map((p) => ({ slug: p.slug, name: L(p.nameAr, p.nameEn) }))} />
    </>
  );
}
