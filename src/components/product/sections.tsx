import Image from "next/image";
import Link from "next/link";
import { Truck, RotateCcw, ShieldCheck, Banknote, Check, Star } from "lucide-react";
import type { ProductView } from "@/services/catalog";
import type { Settings } from "@/services/settings";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { RichText } from "@/components/ui/rich-text";
import { formatSAR } from "@/lib/money";
import { BuyBox, type BuyProduct } from "./buy-box";
import { QuickBuy } from "./add-button";
import { PriceTag } from "@/components/ui/price";
import { Product3D } from "./product-3d";
import { posterFor } from "@/features/product/view";

const L = (locale: Locale, ar: string, en: string) => (locale === "ar" ? ar || en : en || ar);

function SectionHeading({ children, id, dark }: { children: React.ReactNode; id?: string; dark?: boolean }) {
  return (
    <h2 id={id} className={`text-[1.65rem] font-semibold md:text-[2.1rem] ${dark ? "text-porcelain" : "text-ink"}`}>
      {children}
    </h2>
  );
}

/* ─────────────────────────── Home hero: the product on its charging stage */
export function HeroStage({ product, buy, locale, heroImage }: { product: ProductView; buy: BuyProduct; locale: Locale; heroImage: string }) {
  const name = L(locale, product.nameAr, product.nameEn);
  return (
    <section className="relative isolate overflow-hidden bg-ink text-porcelain" aria-labelledby="hero-title">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_25%_55%,rgba(88,216,239,.10),transparent_70%),radial-gradient(50%_60%_at_85%_10%,rgba(45,99,245,.12),transparent_70%)] rtl:[transform:scaleX(-1)]" />
      <div className="container-x grid items-center gap-8 pb-14 pt-8 md:min-h-[calc(100svh-6.5rem)] md:grid-cols-[1.05fr_1fr] md:gap-12 md:py-16">
        <div className="order-2 space-y-6 md:order-1">
          <p className="flex items-center gap-2 font-display text-[0.95rem] text-metal-300" style={{ fontFamily: "var(--font-display)" }} dir="auto">
            <span className="h-2 w-2 rounded-full bg-field shadow-[0_0_12px_2px_rgba(88,216,239,.6)]" aria-hidden />
            {name}
          </p>
          <h1 id="hero-title" className="max-w-[14ch] text-[clamp(2.35rem,6.4vw,4.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
            {L(locale, product.taglineAr, product.taglineEn)}
          </h1>
          <p className="max-w-[46ch] text-[1.08rem] leading-8 text-metal-300">{L(locale, product.shortAr, product.shortEn)}</p>
          <BuyBox product={buy} tone="dark" />
          {product.highlights.length ? (
            <ul className="grid gap-x-6 gap-y-2.5 border-t border-white/10 pt-6 text-[0.95rem] text-metal-100 sm:grid-cols-2">
              {product.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check size={17} className="mt-1 shrink-0 text-field" aria-hidden />
                  {L(locale, h.ar, h.en)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="relative order-1 mx-auto aspect-square w-full max-w-[min(560px,88vw)] md:order-2">
          <div className="field-rings" aria-hidden>
            <span className="h-full w-full" />
            <span className="h-full w-full" />
            <span className="h-full w-full" />
          </div>
          <div aria-hidden className="absolute inset-[14%] rounded-full bg-[radial-gradient(circle,rgba(88,216,239,.22),transparent_65%)] blur-2xl" />
          <div className="absolute inset-[2%] animate-snap-in">
            {product.model3d ? (
              <Product3D source={product.model3d} poster={posterFor(product)} alt={name} tone="dark" priority sizes="(min-width: 768px) 560px, 88vw" className="h-full w-full" />
            ) : (
              <Image src={heroImage} alt={L(locale, product.media[0]?.altAr ?? "", product.media[0]?.altEn ?? "") || name} fill priority fetchPriority="high" sizes="(min-width: 768px) 520px, 88vw" className="object-contain drop-shadow-[0_40px_60px_rgba(0,0,0,.55)]" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Story & highlights */
export function BenefitsSection({ product, t, locale }: { product: ProductView; t: Dictionary; locale: Locale }) {
  const body = L(locale, product.descriptionAr, product.descriptionEn);
  if (!body) return null;
  return (
    <section className="container-x py-16 md:py-24" aria-labelledby="benefits">
      <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
        <SectionHeading id="benefits">{t.product.benefits}</SectionHeading>
        <RichText text={body} className="prose-store text-[1.12rem] leading-9 text-metal-700 [&>p:first-child]:text-ink [&>p:first-child]:text-[1.3rem] [&>p:first-child]:leading-10" />
      </div>
    </section>
  );
}

/* ─────────────────────────── How to use (a real sequence, so it is numbered) */
export function StepsSection({ product, t, locale }: { product: ProductView; t: Dictionary; locale: Locale }) {
  if (!product.howToUse.length) return null;
  return (
    <section className="border-y border-paper-2 bg-porcelain" aria-labelledby="how">
      <div className="container-x py-16 md:py-20">
        <SectionHeading id="how">{t.product.howToUse}</SectionHeading>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
          {product.howToUse.map((s, i) => (
            <li key={i} className="relative">
              <span className="font-display text-[3.2rem] font-light leading-none text-metal-300" style={{ fontFamily: "var(--font-display)" }} aria-hidden>
                {i + 1}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{L(locale, s.titleAr, s.titleEn)}</h3>
              <p className="mt-1.5 max-w-[34ch] text-metal-700">{L(locale, s.bodyAr, s.bodyEn)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────── Specs, box contents, compatibility */
export function SpecsSection({ product, t, locale, showDrafts }: { product: ProductView; t: Dictionary; locale: Locale; showDrafts: boolean }) {
  // Unverified data is never shown in production; in development it is shown with a clear badge.
  const specs = product.specs.filter((s) => s.verified || showDrafts);
  const compat = product.compatibility.filter((c) => c.verified || showDrafts);
  const hasDraft = specs.some((s) => !s.verified) || compat.some((c) => !c.verified);
  const boxImage = product.media.find((m) => m.url.includes("in-box")) ?? null;
  const warranty = L(locale, product.warrantyAr, product.warrantyEn);

  return (
    <section className="container-x py-16 md:py-24" aria-labelledby="specs">
      <div className="grid gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <SectionHeading id="specs">{t.product.specs}</SectionHeading>
            {hasDraft ? <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-xs text-warn">{t.product.draftData}</span> : null}
          </div>
          {specs.length ? (
            <dl className="mt-8 divide-y divide-paper-2 border-y border-paper-2">
              {specs.map((s, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 py-3.5">
                  <dt className="text-metal-500">{L(locale, s.labelAr, s.labelEn)}</dt>
                  <dd className="font-medium">{L(locale, s.valueAr, s.valueEn)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-6 text-metal-700">{t.product.specsPending}</p>
          )}
          {compat.length ? (
            <div className="mt-10">
              <h3 className="text-lg font-semibold">{t.product.compatibility}</h3>
              <ul className="mt-3 space-y-2 text-metal-700">
                {compat.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <Check size={17} className="mt-1 shrink-0 text-ok" aria-hidden /> {L(locale, c.ar, c.en)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {warranty ? (
            <div className="mt-10">
              <h3 className="text-lg font-semibold">{t.product.warranty}</h3>
              <p className="mt-2 text-metal-700">{warranty}</p>
            </div>
          ) : null}
        </div>

        {product.inBox.length ? (
          <div>
            <h3 className="text-[1.35rem] font-semibold">{t.product.inBox}</h3>
            {boxImage ? (
              <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-[var(--radius-panel)] bg-paper-2">
                <Image src={boxImage.url} alt={L(locale, boxImage.altAr, boxImage.altEn)} fill sizes="(min-width: 768px) 520px, 100vw" className="object-cover" loading="lazy" />
              </div>
            ) : null}
            <ul className="mt-5 space-y-2.5">
              {product.inBox.map((b, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-volt" aria-hidden />
                  {L(locale, b.ar, b.en)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ─────────────────────────── Shipping / returns / payment — only what is true */
export function PromiseStrip({ settings, t, locale, onlinePaymentsLive, codEnabled }: { settings: Settings; t: Dictionary; locale: Locale; onlinePaymentsLive: boolean; codEnabled: boolean }) {
  const s = settings.shipping;
  const eta = L(locale, s.etaAr, s.etaEn);
  const shipLine =
    s.rateSource === "flat"
      ? s.freeOverHalalas !== null
        ? locale === "ar"
          ? `${formatSAR(s.flatRateHalalas, "ar")}، ومجاني من ${formatSAR(s.freeOverHalalas, "ar")}`
          : `${formatSAR(s.flatRateHalalas, "en")}, free from ${formatSAR(s.freeOverHalalas, "en")}`
        : formatSAR(s.flatRateHalalas, locale)
      : locale === "ar"
        ? "تُحسب حسب مدينتك في صفحة الدفع"
        : "Calculated for your city at checkout";
  const items = [
    {
      icon: Truck,
      title: locale === "ar" ? "الشحن داخل المملكة" : "Shipping in Saudi Arabia",
      body: shipLine + (eta ? (locale === "ar" ? ` — خلال ${eta}` : ` — ${eta}`) : ""),
      href: `/${locale}/pages/shipping`,
    },
    {
      icon: RotateCcw,
      title: t.checkout.returns,
      body: locale === "ar" ? `خلال ${settings.commerce.returnsWindowDays} أيام من الاستلام` : `Within ${settings.commerce.returnsWindowDays} days of delivery`,
      href: `/${locale}/pages/returns`,
    },
    onlinePaymentsLive
      ? { icon: ShieldCheck, title: locale === "ar" ? "دفع آمن" : "Secure payment", body: t.checkout.payOnlineHint, href: `/${locale}/pages/privacy` }
      : codEnabled
        ? { icon: Banknote, title: t.checkout.cod, body: t.checkout.codHint, href: `/${locale}/pages/terms` }
        : null,
  ].filter(Boolean) as { icon: typeof Truck; title: string; body: string; href: string }[];

  return (
    <section className="bg-paper-2/60" aria-label={t.product.policies}>
      <ul className={`container-x grid gap-px py-2 ${items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {items.map((it) => (
          <li key={it.title}>
            <Link href={it.href} className="group flex gap-4 rounded-2xl p-5 transition-colors hover:bg-porcelain">
              <it.icon size={22} className="mt-0.5 shrink-0 text-volt" aria-hidden />
              <span>
                <span className="block font-medium">{it.title}</span>
                <span className="mt-0.5 block text-sm leading-6 text-metal-700">{it.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────── FAQ */
export function FaqSection({ faqs, t, locale }: { faqs: ProductView["faqs"]; t: Dictionary; locale: Locale }) {
  if (!faqs.length) return null;
  return (
    <section className="container-x py-16 md:py-24" aria-labelledby="faq">
      <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <SectionHeading id="faq">{t.product.faq}</SectionHeading>
        <div className="divide-y divide-paper-2 border-y border-paper-2">
          {faqs.map((f, i) => (
            <details key={i} className="group py-1" name="faq">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[1.05rem] font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                {L(locale, f.qAr, f.qEn)}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-metal-300 text-lg leading-none transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="pb-5 pe-12 leading-8 text-metal-700">{L(locale, f.aAr, f.aEn)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Reviews (real, moderated reviews only) */
export function ReviewsSection({
  reviews,
  product,
  t,
  locale,
}: {
  reviews: { id: string; authorName: string; rating: number; body: string; createdAt: Date; verified: boolean }[];
  product: ProductView;
  t: Dictionary;
  locale: Locale;
}) {
  return (
    <section className="border-t border-paper-2 bg-porcelain" aria-labelledby="reviews">
      <div className="container-x py-16 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading id="reviews">{t.product.reviews}</SectionHeading>
          {product.ratingAverage !== null ? (
            <p className="flex items-center gap-2 text-lg">
              <Star size={20} className="fill-ink" aria-hidden />
              <bdi className="font-display">{product.ratingAverage.toFixed(1)}</bdi>
              <span className="text-sm text-metal-500">({product.reviewCount})</span>
            </p>
          ) : null}
        </div>
        {reviews.length === 0 ? (
          <p className="mt-6 max-w-[60ch] text-metal-700">{t.product.noReviews}</p>
        ) : (
          <ul className="mt-8 grid gap-6 md:grid-cols-2">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-paper-2 pt-5">
                <div className="flex items-center gap-1" aria-label={`${r.rating}/5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} size={15} className={i < r.rating ? "fill-ink text-ink" : "text-metal-300"} aria-hidden />
                  ))}
                </div>
                <p className="mt-3 leading-8">{r.body}</p>
                <p className="mt-2 text-sm text-metal-500">
                  {r.authorName}
                  {r.verified ? ` — ${t.product.verifiedBuyer}` : ""} — {new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium" }).format(r.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── Closing call to action */
export function FinalCta({ product, buy, t, locale }: { product: ProductView; buy: BuyProduct; t: Dictionary; locale: Locale }) {
  const v = product.variants[0]!;
  const img = product.media.find((m) => m.url.includes("on-phone")) ?? product.media[0];
  return (
    <section className="relative overflow-hidden bg-ink text-porcelain" aria-labelledby="final-cta">
      <div className="container-x grid items-center gap-10 py-16 md:grid-cols-[1.2fr_1fr] md:py-20">
        <div className="space-y-5">
          <h2 id="final-cta" className="text-[clamp(1.9rem,4.4vw,3rem)] font-semibold leading-tight">
            {t.product.finalTitle}
          </h2>
          <p className="max-w-[44ch] text-metal-300">{t.product.finalBody}</p>
          <p className="text-metal-100">
            {L(locale, product.nameAr, product.nameEn)} — <PriceTag price={v.priceHalalas} compareAt={v.compareAtHalalas} locale={locale} size="md" wasLabel={t.product.priceWas} />
          </p>
          <QuickBuy product={buy} />
        </div>
        {product.model3d ? (
          <Product3D source={product.model3d} poster={posterFor(product)} alt={L(locale, product.nameAr, product.nameEn)} tone="dark" azimuth={2.2} elevation={0.45} autoRotate={false} showHint={false} sizes="384px" className="mx-auto aspect-square w-full max-w-sm" />
        ) : img ? (
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[28px]">
            <Image src={img.url} alt={L(locale, img.altAr, img.altEn)} fill sizes="384px" className="object-cover" loading="lazy" />
          </div>
        ) : null}
      </div>
    </section>
  );
}


/* ─────────────────────────── The collection — every product as an interactive 3D model */
export function CollectionSection({ products, buys, t, locale }: { products: ProductView[]; buys: BuyProduct[]; t: Dictionary; locale: Locale }) {
  if (products.length < 2) return null;
  return (
    <section className="container-x py-16 md:py-24" aria-labelledby="collection">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="collection" className="text-[1.65rem] font-semibold md:text-[2.1rem]">{locale === "ar" ? "المجموعة" : "The collection"}</h2>
          <p className="mt-1 text-metal-700">{locale === "ar" ? "حرّك كل منتج بإصبعك وشاهده من كل زاوية." : "Turn each product with your finger and see it from every side."}</p>
        </div>
        <Link href={`/${locale}/products`} className="text-[0.95rem] font-medium text-volt underline-offset-4 hover:underline">
          {t.search.viewAll}
        </Link>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {products.map((p, i) => {
          const v = [...p.variants].sort((a, b) => a.priceHalalas - b.priceHalalas)[0]!;
          const name = L(locale, p.nameAr, p.nameEn);
          return (
            <li key={p.id} className="flex flex-col rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-3" data-testid="collection-item">
              <div className="relative aspect-square overflow-hidden rounded-[14px] bg-[radial-gradient(70%_60%_at_50%_40%,#ffffff,#ebe8e2)]">
                {p.model3d ? (
                  <Product3D source={p.model3d} poster={posterFor(p)} alt={name} tone="light" autoRotate={false} sizes="(min-width: 768px) 33vw, 100vw" className="absolute inset-0" />
                ) : p.media[0] ? (
                  <Image src={p.media[0].url} alt={L(locale, p.media[0].altAr, p.media[0].altEn) || name} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">
                    <Link href={`/${locale}/products/${p.slug}`} className="hover:underline hover:underline-offset-4">{name}</Link>
                  </h3>
                  <PriceTag price={v.priceHalalas} compareAt={v.compareAtHalalas} locale={locale} size="sm" wasLabel={t.product.priceWas} />
                </div>
                <p className="mt-1 text-sm text-metal-700">{L(locale, p.taglineAr, p.taglineEn)}</p>
                <div className="mt-auto flex items-center gap-3 pt-4">
                  <QuickBuy product={buys[i]!} variant="add" />
                  <Link href={`/${locale}/products/${p.slug}`} className="text-sm font-medium text-metal-700 hover:text-ink">
                    {locale === "ar" ? "التفاصيل" : "Details"}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
