import { env } from "@/config/env";
import { brand } from "@/config/brand";
import type { ProductView } from "@/services/catalog";
import type { Settings } from "@/services/settings";
import type { Locale } from "@/i18n/config";

export const absUrl = (path: string) => (path.startsWith("http") ? path : `${env.appUrl}${path.startsWith("/") ? "" : "/"}${path}`);

/**
 * Product structured data. Every value mirrors what the customer sees on the
 * page: the live price, live availability, shipping and returns from settings,
 * and ratings only when real approved reviews exist.
 */
export function productJsonLd(p: ProductView, locale: Locale, settings: Settings, storeName: string) {
  const name = locale === "ar" ? p.nameAr : p.nameEn;
  const url = absUrl(`/${locale}/products/${p.slug}`);
  const ship = settings.shipping;
  const offers = p.variants.map((v) => {
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      sku: v.sku,
      url,
      priceCurrency: "SAR",
      price: (v.priceHalalas / 100).toFixed(2),
      availability: v.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: storeName },
    };
    if (ship.rateSource === "flat") {
      offer.shippingDetails = {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: (ship.freeOverHalalas !== null && v.priceHalalas >= ship.freeOverHalalas ? 0 : ship.flatRateHalalas / 100).toFixed(2), currency: "SAR" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "SA" },
      };
    }
    offer.hasMerchantReturnPolicy = {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "SA",
      returnPolicyCategory: settings.commerce.returnsWindowDays > 0 ? "https://schema.org/MerchantReturnFiniteReturnWindow" : "https://schema.org/MerchantReturnNotPermitted",
      ...(settings.commerce.returnsWindowDays > 0 ? { merchantReturnDays: settings.commerce.returnsWindowDays } : {}),
    };
    return offer;
  });

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: locale === "ar" ? p.shortAr : p.shortEn,
    image: p.media.filter((m) => m.kind === "image").map((m) => absUrl(m.url)),
    sku: p.variants[0]?.sku,
    ...(p.gtin ? { gtin: p.gtin } : {}),
    ...(p.mpn ? { mpn: p.mpn } : {}),
    brand: { "@type": "Brand", name: p.brand || brand.name },
    ...(p.category ? { category: locale === "ar" ? p.category.nameAr : p.category.nameEn } : {}),
    offers: offers.length === 1 ? offers[0] : { "@type": "AggregateOffer", priceCurrency: "SAR", lowPrice: (Math.min(...p.variants.map((v) => v.priceHalalas)) / 100).toFixed(2), highPrice: (Math.max(...p.variants.map((v) => v.priceHalalas)) / 100).toFixed(2), offerCount: offers.length, offers },
    ...(p.reviewCount > 0 && p.ratingAverage !== null ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.ratingAverage, reviewCount: p.reviewCount } } : {}),
  };
}

export function organizationJsonLd(settings: Settings, storeName: string) {
  const s = settings.store;
  const sameAs = Object.values(s.socials).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: storeName,
    url: absUrl("/"),
    logo: absUrl("/brand/logo.png"),
    ...(s.contactEmail ? { email: s.contactEmail } : {}),
    ...(s.contactPhone || s.contactEmail
      ? { contactPoint: { "@type": "ContactPoint", contactType: "customer service", areaServed: "SA", availableLanguage: ["ar", "en"], ...(s.contactPhone ? { telephone: s.contactPhone } : {}), ...(s.contactEmail ? { email: s.contactEmail } : {}) } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

/** The home page lists several products: point search engines at each product page. */
export function itemListJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: absUrl(it.path) })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absUrl(it.path) })),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  // Escape "<" so the JSON can never close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
