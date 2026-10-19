import type { Metadata } from "next";
import Link from "next/link";
import { asLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { cartForToken } from "@/services/cart-reminders";
import { buildQuote } from "@/services/quote";
import { RestoreCart } from "@/components/cart/restore-cart";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function RestorePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale);
  const saved = await cartForToken((await searchParams).token ?? "");
  const lines = saved ? (await buildQuote({ items: saved.items })).lines.filter((l) => l.quantity > 0) : [];
  return (
    <section className="container-x max-w-xl py-16" data-testid="cart-restore">
      {lines.length ? (
        <RestoreCart
          next={`/${locale}/checkout`}
          label={t.cart.restoring}
          items={lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            snapshot: { slug: l.slug, nameAr: l.nameAr, nameEn: l.nameEn, variantNameAr: l.variantNameAr, variantNameEn: l.variantNameEn, imageUrl: l.imageUrl, priceHalalas: l.unitPriceHalalas, maxQuantity: l.maxQuantity },
          }))}
        />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{t.cart.restoreExpired}</h1>
          <Link href={`/${locale}/products`} className="btn btn-primary mt-6">{t.wishlist.browse}</Link>
        </>
      )}
    </section>
  );
}
