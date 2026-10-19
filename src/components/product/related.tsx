import Image from "next/image";
import Link from "next/link";
import { BadgePercent, Plus } from "lucide-react";
import type { ProductView } from "@/services/catalog";
import type { Promotion } from "@/services/promotions";
import type { Dictionary } from "@/i18n";
import { fmt } from "@/i18n";
import type { Locale } from "@/i18n/config";
import type { BuyProduct } from "./buy-box";
import { AddBundle, QuickBuy } from "./add-button";
import { PriceTag, Money } from "@/components/ui/price";
import { WishlistButton } from "@/components/wishlist/wishlist";

const L = (locale: Locale, ar: string, en: string) => (locale === "ar" ? ar : en);
const cheapest = (p: ProductView) => [...p.variants].sort((a, b) => a.priceHalalas - b.priceHalalas)[0]!;
const image = (p: ProductView) => p.media.find((m) => m.kind === "image");

/** Quantity offers that cover this product, shown under the buy box. */
export function OfferNotes({ offers, t, locale }: { offers: Promotion[]; t: Dictionary; locale: Locale }) {
  const list = offers.filter((o) => o.type === "quantity");
  if (!list.length) return null;
  return (
    <div className="rounded-[var(--radius-panel)] border border-ok/30 bg-ok/6 p-4" data-testid="product-offers">
      <p className="flex items-center gap-2 text-sm font-semibold text-ok"><BadgePercent size={17} aria-hidden /> {t.product.offers}</p>
      <ul className="mt-2 space-y-1 text-[0.95rem]">
        {list.map((o) => <li key={o.id}>{L(locale, o.nameAr, o.nameEn)}</li>)}
      </ul>
      <p className="mt-1.5 text-xs text-metal-500">{t.product.offerAuto}</p>
    </div>
  );
}

/** "Buy them together" for each active bundle offer that includes this product. */
export function BundleSection({ currentId, bundles, products, buys, t, locale }: { currentId: string; bundles: Promotion[]; products: ProductView[]; buys: BuyProduct[]; t: Dictionary; locale: Locale }) {
  const shown = bundles
    .map((b) => ({ b, items: [currentId, ...b.productIds.filter((id) => id !== currentId)].filter((id) => b.productIds.includes(id)).map((id) => products.findIndex((p) => p.id === id)).filter((i) => i >= 0) }))
    .filter((x) => x.items.length === x.b.productIds.length && x.items.length >= 2);
  if (!shown.length) return null;
  return (
    <section className="container-x pb-14" aria-labelledby="bundles">
      <h2 id="bundles" className="text-[1.5rem] font-semibold">{t.product.bundleTitle}</h2>
      <div className="mt-6 space-y-5">
        {shown.map(({ b, items }) => {
          const total = items.reduce((s, i) => s + cheapest(products[i]!).priceHalalas, 0);
          const after = total - Math.floor((total * b.percentOff) / 100);
          return (
            <div key={b.id} className="rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-4 md:p-6" data-testid="bundle">
              <p className="text-metal-700">{fmt(t.product.bundleBody, { name: L(locale, b.nameAr, b.nameEn), p: String(b.percentOff) })}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {items.map((i, n) => {
                  const p = products[i]!;
                  const img = image(p);
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      {n > 0 ? <Plus size={18} className="text-metal-500" aria-hidden /> : null}
                      <Link href={`/${locale}/products/${p.slug}`} className="flex items-center gap-3 rounded-xl bg-white p-2 pe-4 hover:shadow-sm">
                        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink">{img ? <Image src={img.url} alt="" fill sizes="64px" className="object-cover" /> : null}</span>
                        <span className="text-sm">
                          <span className="block font-medium">{L(locale, p.nameAr, p.nameEn)}</span>
                          <Money halalas={cheapest(p).priceHalalas} locale={locale} />
                        </span>
                      </Link>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <p className="text-sm text-metal-700">{t.product.bundleTotal}: <s><Money halalas={total} locale={locale} /></s></p>
                <p className="font-semibold text-ok">{t.product.bundleAfter}: <Money halalas={after} locale={locale} /></p>
                <div className="ms-auto"><AddBundle products={items.map((i) => buys[i]!)} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RelatedSection({ kind, products, buys, t, locale }: { kind: "bought_together" | "related"; products: ProductView[]; buys: BuyProduct[]; t: Dictionary; locale: Locale }) {
  if (!products.length) return null;
  return (
    <section className="container-x pb-16" aria-labelledby="related" data-testid="related" data-kind={kind}>
      <h2 id="related" className="text-[1.5rem] font-semibold">{kind === "bought_together" ? t.product.boughtTogether : t.product.related}</h2>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
        {products.map((p, i) => {
          const v = cheapest(p);
          const img = image(p);
          const name = L(locale, p.nameAr, p.nameEn);
          return (
            <li key={p.id} className="flex flex-col rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-3">
              <Link href={`/${locale}/products/${p.slug}`} className="relative block aspect-[4/3] overflow-hidden rounded-[14px] bg-[radial-gradient(70%_60%_at_50%_40%,#ffffff,#ebe8e2)]" tabIndex={-1} aria-hidden>
                {img ? <Image src={img.url} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" /> : null}
              </Link>
              <div className="flex flex-1 flex-col px-1.5 pb-1.5 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold"><Link href={`/${locale}/products/${p.slug}`} className="hover:underline hover:underline-offset-4">{name}</Link></h3>
                  <PriceTag price={v.priceHalalas} compareAt={v.compareAtHalalas} locale={locale} size="sm" wasLabel={t.product.priceWas} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-metal-700">{L(locale, p.taglineAr, p.taglineEn)}</p>
                <div className="mt-auto flex items-center gap-3 pt-3">
                  <QuickBuy product={buys[i]!} variant="add" />
                  <WishlistButton slug={p.slug} className="ms-auto" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
