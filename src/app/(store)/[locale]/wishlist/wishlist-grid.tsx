"use client";
import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { useWishlist, WishlistButton } from "@/components/wishlist/wishlist";
import { QuickBuy } from "@/components/product/add-button";
import { PriceTag } from "@/components/ui/price";
import type { BuyProduct } from "@/components/product/buy-box";

export type WishItem = {
  slug: string;
  name: string;
  tagline: string;
  poster: string | null;
  priceHalalas: number;
  compareAtHalalas: number | null;
  inStock: boolean;
  buy: BuyProduct;
};

export function WishlistGrid({ items }: { items: WishItem[] }) {
  const { t, locale } = useI18n();
  const w = useWishlist();
  // Keep the order in which they were saved; drop products no longer sold.
  const saved = w.slugs.map((s) => items.find((i) => i.slug === s)).filter((x): x is WishItem => Boolean(x));
  if (!saved.length) {
    return (
      <div className="mt-10 rounded-[var(--radius-panel)] border border-dashed border-metal-300 px-6 py-14 text-center" data-testid="wishlist-empty">
        <p className="text-metal-700">{t.wishlist.empty}</p>
        <Link href={`/${locale}/products`} className="btn btn-primary mt-5">{t.wishlist.browse}</Link>
      </div>
    );
  }
  return (
    <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="wishlist-items">
      {saved.map((p) => (
        <li key={p.slug} className="flex flex-col rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-3">
          <Link href={`/${locale}/products/${p.slug}`} className="relative aspect-square overflow-hidden rounded-[14px] bg-[radial-gradient(70%_60%_at_50%_40%,#ffffff,#ebe8e2)]">
            {p.poster ? <Image src={p.poster} alt={p.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-contain p-6" /> : null}
          </Link>
          <div className="flex flex-1 flex-col px-2 pb-1 pt-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold"><Link href={`/${locale}/products/${p.slug}`} className="hover:underline">{p.name}</Link></h2>
              <PriceTag price={p.priceHalalas} compareAt={p.compareAtHalalas} locale={locale} size="sm" wasLabel={t.product.priceWas} />
            </div>
            <p className="mt-1 text-sm text-metal-700">{p.tagline}</p>
            <div className="mt-auto flex items-center gap-3 pt-4">
              {p.inStock ? <QuickBuy product={p.buy} variant="add" /> : <span className="text-sm text-danger">{t.product.outOfStock}</span>}
              <WishlistButton slug={p.slug} className="ms-auto" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
