import { getCustomer } from "@/services/customer-auth";
import { WishlistSync } from "@/components/wishlist/wishlist";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { getDictionary } from "@/i18n";
import { dirOf, isLocale, type Locale } from "@/i18n/config";
import { getShell } from "@/services/storefront";
import { listPublishedProducts } from "@/services/catalog";
import { aiConfigured } from "@/services/assistant";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/ui/toast";
import { CartProvider } from "@/components/cart/cart-provider";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";
import { Intro, INTRO_BOOT_SCRIPT } from "@/components/layout/intro";
import { HelpWidget } from "@/components/assistant/help-widget";
import { Analytics } from "@/components/analytics/analytics";
import { NetworkStatus } from "@/components/layout/network-status";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: brand.colors.ink,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "ar";
  const shell = await getShell(locale);
  const seo = shell.settings.seo;
  const title = (locale === "ar" ? seo.titleAr : seo.titleEn) || `${shell.storeName} — ${locale === "ar" ? brand.taglineAr : brand.taglineEn}`;
  const description =
    (locale === "ar" ? seo.descriptionAr : seo.descriptionEn) ||
    (locale === "ar" ? "متجر سعودي لأجهزة صغيرة مختارة بعناية، مع دفع آمن وتوصيل داخل المملكة." : "A Saudi store for carefully chosen small devices, with secure payment and delivery across the Kingdom.");
  const og = shell.settings.theme.ogImageUrl || "/products/magcharge-76/hero.webp";
  return {
    metadataBase: new URL(env.appUrl),
    title: { default: title, template: `%s | ${shell.storeName}` },
    description,
    applicationName: shell.storeName,
    alternates: { languages: { ar: "/ar", en: "/en", "x-default": "/ar" } },
    openGraph: { type: "website", siteName: shell.storeName, locale: locale === "ar" ? "ar_SA" : "en_US", images: [{ url: og, width: 1600, height: 1600 }] },
    twitter: { card: "summary_large_image" },
    verification: seo.googleSiteVerification ? { google: seo.googleSiteVerification } : undefined,
    robots: env.appEnv === "production" ? { index: true, follow: true } : { index: false, follow: false },
    formatDetection: { telephone: false },
  };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw;
  const t = getDictionary(locale);
  const [shell, products, customer] = await Promise.all([getShell(locale), listPublishedProducts(), getCustomer()]);
  const theme = shell.settings.theme;
  const heroImage = products[0]?.media[0]?.url ?? null;
  const suggestions =
    locale === "ar"
      ? ["وين طلبي؟", "ساعدني أختار منتج", "كم تكلفة الشحن؟", "ما طرق الدفع؟", "سياسة الاسترجاع"]
      : ["Where is my order?", "Help me choose a product", "How much is shipping?", "Payment methods?", "Returns policy"];

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      suppressHydrationWarning
      style={{ ["--color-volt" as string]: theme.volt, ["--color-field" as string]: theme.field }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT_SCRIPT }} />
        <link rel="preload" href="/fonts/readex-pro-arabic-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-dvh">
        <I18nProvider locale={locale} dict={t}>
          <ToastProvider closeLabel={t.nav.close}>
            <CartProvider>
              <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-volt focus:px-4 focus:py-2 focus:text-white">
                {t.nav.skip}
              </a>
              <Intro label={t.intro.loading} imageUrl={heroImage} />
              <div data-noprint className="contents">
                <AnnouncementBar items={shell.announcements} />
                <Header signedIn={Boolean(customer)} />
                <NetworkStatus />
              </div>
              <main id="main" className="min-h-[60vh]">
                {children}
              </main>
              <div data-noprint className="contents">
                <Footer t={t} locale={locale} shell={shell} />
                <CartDrawer />
                <WishlistSync signedIn={Boolean(customer)} />
                <HelpWidget whatsapp={shell.settings.store.whatsapp} aiEnabled={aiConfigured()} suggestions={suggestions} />
              </div>
              <Analytics ga4Id={shell.settings.analytics.ga4Id} metaPixelId={shell.settings.analytics.metaPixelId} tiktokPixelId={shell.settings.analytics.tiktokPixelId} />
            </CartProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
