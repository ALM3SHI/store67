import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getDictionary } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { queryCatalog } from "@/services/search";
import { listCategories } from "@/services/catalog";
import { getShell } from "@/services/storefront";
import { PriceTag } from "@/components/ui/price";
import { QuickBuy } from "@/components/product/add-button";
import { toBuyProduct, posterFor } from "@/features/product/view";
import { Product3D } from "@/components/product/product-3d";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const sp = await searchParams;
  const t = getDictionary(locale);
  return {
    title: t.nav.shop,
    alternates: { canonical: `/${locale}/products`, languages: { ar: "/ar/products", en: "/en/products" } },
    // Filtered and search result pages should not compete with the main listing
    robots: sp.q || sp.sort || sp.category || sp.stock ? { index: false, follow: true } : undefined,
  };
}

const SORTS = ["relevance", "price_asc", "price_desc", "newest"] as const;

export default async function Catalog({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  const sp = await searchParams;
  const t = getDictionary(locale);
  const sort = SORTS.includes(sp.sort as (typeof SORTS)[number]) ? (sp.sort as (typeof SORTS)[number]) : "relevance";
  const q = (sp.q ?? "").slice(0, 80);
  const [products, categories, shell] = await Promise.all([
    queryCatalog({ q, category: sp.category, inStock: sp.stock === "1", sort }),
    listCategories(),
    getShell(locale),
  ]);
  const sortLabels: Record<(typeof SORTS)[number], string> =
    locale === "ar"
      ? { relevance: "الأنسب", price_asc: "السعر: من الأقل", price_desc: "السعر: من الأعلى", newest: "الأحدث" }
      : { relevance: "Best match", price_asc: "Price: low to high", price_desc: "Price: high to low", newest: "Newest" };
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: q || undefined, category: sp.category, stock: sp.stock, sort: sort === "relevance" ? undefined : sort, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return `/${locale}/products${s ? `?${s}` : ""}`;
  };

  return (
    <div className="container-x py-10 md:py-14">
      <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[2rem] font-semibold md:text-[2.6rem]">{q ? `${t.search.results}: «${q}»` : t.nav.shop}</h1>
          <p className="mt-1 text-metal-500">{products.length} {locale === "ar" ? "منتج" : products.length === 1 ? "product" : "products"}</p>
        </div>
        <form className="flex w-full max-w-md gap-2" action={`/${locale}/products`} role="search">
          <input name="q" defaultValue={q} placeholder={t.search.placeholder} aria-label={t.search.label} className="field" />
          {sort !== "relevance" ? <input type="hidden" name="sort" value={sort} /> : null}
          <button className="btn btn-ink">{t.nav.search}</button>
        </form>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-paper-2 pb-5 text-sm">
        <Link href={qs({ category: undefined })} className={cn("rounded-full border px-3.5 py-1.5", !sp.category ? "border-ink bg-ink text-white" : "border-metal-300 hover:border-ink")}>
          {locale === "ar" ? "الكل" : "All"}
        </Link>
        {categories.map((c) => (
          <Link key={c.id} href={qs({ category: c.slug })} className={cn("rounded-full border px-3.5 py-1.5", sp.category === c.slug ? "border-ink bg-ink text-white" : "border-metal-300 hover:border-ink")}>
            {locale === "ar" ? c.nameAr : c.nameEn}
          </Link>
        ))}
        <Link href={qs({ stock: sp.stock === "1" ? undefined : "1" })} className={cn("rounded-full border px-3.5 py-1.5", sp.stock === "1" ? "border-volt bg-volt text-white" : "border-metal-300 hover:border-ink")} aria-pressed={sp.stock === "1"}>
          {t.search.inStock}
        </Link>
        <nav className="ms-auto flex flex-wrap gap-1" aria-label={locale === "ar" ? "ترتيب" : "Sort"}>
          {SORTS.map((s) => (
            <Link key={s} href={qs({ sort: s === "relevance" ? undefined : s })} aria-current={sort === s ? "true" : undefined} className={cn("rounded-full px-3 py-1.5", sort === s ? "bg-paper-2 font-medium" : "text-metal-700 hover:text-ink")}>
              {sortLabels[s]}
            </Link>
          ))}
        </nav>
      </div>

      {products.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg">{q ? t.search.empty.replace("{q}", q) : t.product.unavailable}</p>
          <Link href={`/${locale}/products`} className="btn btn-ink mt-6">
            {t.search.viewAll}
          </Link>
        </div>
      ) : (
        <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p, i) => {
            const v = [...p.variants].sort((a, b) => a.priceHalalas - b.priceHalalas)[0]!;
            const img = p.media.find((m) => m.kind === "image");
            const name = locale === "ar" ? p.nameAr : p.nameEn;
            return (
              <li key={p.id} className="group flex flex-col" data-testid="catalog-item">
                <div className="relative aspect-square overflow-hidden rounded-[var(--radius-panel)] bg-[radial-gradient(70%_60%_at_50%_40%,#ffffff,#ebe8e2)]">
                  {p.model3d ? (
                    <Product3D source={p.model3d} poster={posterFor(p)} alt={name} tone="light" autoRotate={false} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="absolute inset-0" />
                  ) : img ? (
                    <Link href={`/${locale}/products/${p.slug}`} className="absolute inset-0">
                      <Image src={img.url} alt={(locale === "ar" ? img.altAr : img.altEn) || name} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={i < 3} className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    </Link>
                  ) : null}
                  {!p.inStock ? <span className="pointer-events-none absolute start-3 top-3 rounded-full bg-porcelain px-3 py-1 text-xs font-medium text-danger">{t.product.outOfStock}</span> : null}
                </div>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      <Link href={`/${locale}/products/${p.slug}`} className="hover:underline hover:underline-offset-4">{name}</Link>
                    </h2>
                    <p className="text-sm text-metal-700">{locale === "ar" ? p.taglineAr : p.taglineEn}</p>
                  </div>
                  <PriceTag price={v.priceHalalas} compareAt={v.compareAtHalalas} locale={locale} size="sm" wasLabel={t.product.priceWas} />
                </div>
                <div className="mt-4">
                  <QuickBuy product={toBuyProduct(p, shell.settings, t)} variant="add" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
