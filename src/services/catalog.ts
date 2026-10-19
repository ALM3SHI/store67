import "server-only";
import { and, asc, eq, inArray, sql, desc } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import type { FaqRow, Localized, SpecRow, StepRow } from "@/lib/db/schema";

export type VariantView = {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  options: Record<string, string>;
  priceHalalas: number;
  compareAtHalalas: number | null;
  /** null when inventory is not tracked */
  available: number | null;
  inStock: boolean;
  lowStock: boolean;
  weightGrams: number | null;
};

export type MediaView = {
  id: string;
  kind: string;
  url: string;
  altAr: string;
  altEn: string;
  width: number | null;
  height: number | null;
  placeholder: boolean;
};

export type ProductView = {
  id: string;
  slug: string;
  status: "draft" | "published" | "archived";
  featured: boolean;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  shortAr: string;
  shortEn: string;
  descriptionAr: string;
  descriptionEn: string;
  highlights: Localized[];
  specs: SpecRow[];
  inBox: Localized[];
  compatibility: { ar: string; en: string; verified: boolean }[];
  howToUse: StepRow[];
  faqs: FaqRow[];
  warrantyAr: string;
  warrantyEn: string;
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescAr: string | null;
  seoDescEn: string | null;
  keywords: string;
  /** "builtin:<key>" or .glb URL; null = images only */
  model3d: string | null;
  category: { slug: string; nameAr: string; nameEn: string } | null;
  media: MediaView[];
  variants: VariantView[];
  priceFromHalalas: number;
  inStock: boolean;
  reviewCount: number;
  ratingAverage: number | null;
  updatedAt: string;
  createdAt: string;
};

type ProductRow = typeof schema.products.$inferSelect;

async function hydrate(conn: DbOrTx, rows: ProductRow[]): Promise<ProductView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [media, variants, cats, ratings] = await Promise.all([
    conn.select().from(schema.productMedia).where(inArray(schema.productMedia.productId, ids)).orderBy(asc(schema.productMedia.sort)),
    conn
      .select()
      .from(schema.productVariants)
      .where(and(inArray(schema.productVariants.productId, ids), eq(schema.productVariants.active, true)))
      .orderBy(asc(schema.productVariants.sort)),
    conn.select().from(schema.categories),
    conn
      .select({
        productId: schema.reviews.productId,
        count: sql<number>`count(*)::int`,
        avg: sql<number>`avg(${schema.reviews.rating})::float`,
      })
      .from(schema.reviews)
      .where(and(inArray(schema.reviews.productId, ids), eq(schema.reviews.status, "approved")))
      .groupBy(schema.reviews.productId),
  ]);

  return rows.map((p) => {
    const vs: VariantView[] = variants
      .filter((v) => v.productId === p.id)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        nameAr: v.nameAr,
        nameEn: v.nameEn,
        options: v.options,
        priceHalalas: v.priceHalalas,
        compareAtHalalas: v.compareAtHalalas,
        available: v.trackInventory ? v.stock : null,
        inStock: !v.trackInventory || v.stock > 0,
        lowStock: v.trackInventory && v.stock > 0 && v.stock <= v.lowStockThreshold,
        weightGrams: v.weightGrams,
      }));
    const cat = cats.find((c) => c.id === p.categoryId);
    const r = ratings.find((x) => x.productId === p.id);
    return {
      id: p.id,
      slug: p.slug,
      status: p.status,
      featured: p.featured,
      brand: p.brand,
      gtin: p.gtin,
      mpn: p.mpn,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      taglineAr: p.taglineAr,
      taglineEn: p.taglineEn,
      shortAr: p.shortAr,
      shortEn: p.shortEn,
      descriptionAr: p.descriptionAr,
      descriptionEn: p.descriptionEn,
      highlights: p.highlights,
      specs: p.specs,
      inBox: p.inBox,
      compatibility: p.compatibility,
      howToUse: p.howToUse,
      faqs: p.faqs,
      warrantyAr: p.warrantyAr,
      warrantyEn: p.warrantyEn,
      seoTitleAr: p.seoTitleAr,
      seoTitleEn: p.seoTitleEn,
      seoDescAr: p.seoDescAr,
      seoDescEn: p.seoDescEn,
      keywords: p.keywords,
      model3d: p.model3d,
      category: cat ? { slug: cat.slug, nameAr: cat.nameAr, nameEn: cat.nameEn } : null,
      media: media
        .filter((m) => m.productId === p.id)
        .map((m) => ({ id: m.id, kind: m.kind, url: m.url, altAr: m.altAr, altEn: m.altEn, width: m.width, height: m.height, placeholder: m.placeholder })),
      variants: vs,
      priceFromHalalas: vs.length ? Math.min(...vs.map((v) => v.priceHalalas)) : 0,
      inStock: vs.some((v) => v.inStock),
      reviewCount: r?.count ?? 0,
      ratingAverage: r ? Math.round(r.avg * 10) / 10 : null,
      updatedAt: p.updatedAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    };
  });
}

/** Published products with at least one active variant, featured first. */
export async function listPublishedProducts(db?: DbOrTx): Promise<ProductView[]> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select()
    .from(schema.products)
    .where(eq(schema.products.status, "published"))
    .orderBy(desc(schema.products.featured), asc(schema.products.sort), desc(schema.products.createdAt));
  return (await hydrate(conn, rows)).filter((p) => p.variants.length > 0);
}

export async function getPublishedProduct(slug: string, db?: DbOrTx): Promise<ProductView | null> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.slug, slug), eq(schema.products.status, "published")))
    .limit(1);
  const [p] = await hydrate(conn, rows);
  return p && p.variants.length > 0 ? p : null;
}

export async function getProductById(id: string, db?: DbOrTx): Promise<ProductView | null> {
  const conn = db ?? (await getDb());
  const rows = await conn.select().from(schema.products).where(eq(schema.products.id, id)).limit(1);
  const [p] = await hydrate(conn, rows);
  return p ?? null;
}

export async function listApprovedReviews(productId: string, limit = 20, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  return conn
    .select({
      id: schema.reviews.id,
      authorName: schema.reviews.authorName,
      rating: schema.reviews.rating,
      body: schema.reviews.body,
      createdAt: schema.reviews.createdAt,
      verified: sql<boolean>`${schema.reviews.orderId} is not null`,
    })
    .from(schema.reviews)
    .where(and(eq(schema.reviews.productId, productId), eq(schema.reviews.status, "approved")))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(limit);
}

export async function listCategories(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  return conn.select().from(schema.categories).orderBy(asc(schema.categories.sort));
}
