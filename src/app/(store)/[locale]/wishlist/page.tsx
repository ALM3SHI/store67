import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { listPublishedProducts } from "@/services/catalog";
import { getShell } from "@/services/storefront";
import { posterFor, toBuyProduct } from "@/features/product/view";
import { WishlistGrid, type WishItem } from "./wishlist-grid";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.wishlist.title, robots: { index: false, follow: true } };
}

export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const [products, shell] = await Promise.all([listPublishedProducts(), getShell(locale)]);
  const L = (ar: string, en: string) => (locale === "ar" ? ar || en : en || ar);
  const items: WishItem[] = products.map((p) => {
    const v = [...p.variants].sort((a, b) => a.priceHalalas - b.priceHalalas)[0]!;
    return {
      slug: p.slug,
      name: L(p.nameAr, p.nameEn),
      tagline: L(p.taglineAr, p.taglineEn),
      poster: posterFor(p),
      priceHalalas: v.priceHalalas,
      compareAtHalalas: v.compareAtHalalas,
      inStock: p.variants.some((x) => x.inStock),
      buy: toBuyProduct(p, shell.settings, t),
    };
  });
  return (
    <section className="container-x py-12 md:py-16">
      <h1 className="text-[1.9rem] font-semibold">{t.wishlist.title}</h1>
      <p className="mt-1 text-sm text-metal-500">{t.wishlist.note}</p>
      <WishlistGrid items={items} />
    </section>
  );
}
