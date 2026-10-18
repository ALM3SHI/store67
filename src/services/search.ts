import "server-only";
import { listPublishedProducts, type ProductView } from "@/services/catalog";
import { buildIndex, search } from "@/lib/search/rank";

/**
 * In-store product search. The index is rebuilt from published products at
 * most once a minute per server instance (or immediately after an admin edit
 * via invalidateSearchIndex). For catalogs beyond a few thousand products,
 * swap this for Postgres full-text + pg_trgm or a hosted search service —
 * the API shape stays the same.
 */
let cached: { at: number; products: ProductView[]; index: ReturnType<typeof buildIndex> } | null = null;
const TTL = 60_000;

export function invalidateSearchIndex() {
  cached = null;
}

async function getIndex() {
  if (cached && Date.now() - cached.at < TTL) return cached;
  const products = await listPublishedProducts();
  const index = buildIndex(
    products.map((p) => ({
      id: p.id,
      name: [p.nameAr, p.nameEn, ...p.variants.flatMap((v) => [v.nameAr, v.nameEn, v.sku])],
      keywords: [p.keywords, p.taglineAr, p.taglineEn, p.category?.nameAr ?? "", p.category?.nameEn ?? "", p.brand ?? ""],
      body: [p.shortAr, p.shortEn, ...p.highlights.flatMap((h) => [h.ar, h.en])],
    })),
  );
  cached = { at: Date.now(), products, index };
  return cached;
}

export type SearchHit = {
  slug: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  priceHalalas: number;
  compareAtHalalas: number | null;
  inStock: boolean;
  category: string | null;
};

export async function searchProducts(q: string, limit = 8): Promise<SearchHit[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return [];
  const { products, index } = await getIndex();
  return search(index, query)
    .slice(0, limit)
    .map((r) => products.find((p) => p.id === r.id)!)
    .map((p) => {
      const cheapest = [...p.variants].sort((a, b) => a.priceHalalas - b.priceHalalas)[0]!;
      return {
        slug: p.slug,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        imageUrl: p.media.find((m) => m.kind === "image")?.url ?? null,
        priceHalalas: cheapest.priceHalalas,
        compareAtHalalas: cheapest.compareAtHalalas,
        inStock: p.inStock,
        category: p.category?.slug ?? null,
      };
    });
}

/** Full catalog query with filters and sorting, used by /products. */
export async function queryCatalog(opts: { q?: string; category?: string; inStock?: boolean; sort?: "relevance" | "price_asc" | "price_desc" | "newest" }) {
  const { products, index } = await getIndex();
  let list = products;
  let scores = new Map<string, number>();
  if (opts.q?.trim()) {
    const hits = search(index, opts.q);
    scores = new Map(hits.map((h) => [h.id, h.score]));
    list = list.filter((p) => scores.has(p.id));
  }
  if (opts.category) list = list.filter((p) => p.category?.slug === opts.category);
  if (opts.inStock) list = list.filter((p) => p.inStock);
  const sort = opts.sort ?? "relevance";
  list = [...list].sort((a, b) => {
    if (sort === "price_asc") return a.priceFromHalalas - b.priceFromHalalas;
    if (sort === "price_desc") return b.priceFromHalalas - a.priceFromHalalas;
    if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
    if (scores.size) return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    return 0; // keep featured/sort order
  });
  return list;
}
