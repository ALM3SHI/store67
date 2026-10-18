import type { MetadataRoute } from "next";
import { listPublishedProducts } from "@/services/catalog";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { absUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, pages] = await Promise.all([
    listPublishedProducts(),
    getDb().then((db) => db.select({ slug: schema.pages.slug, updatedAt: schema.pages.updatedAt }).from(schema.pages).where(eq(schema.pages.published, true))),
  ]);
  const both = (path: string, lastModified?: Date | string, priority?: number): MetadataRoute.Sitemap[number] => ({
    url: absUrl(`/ar${path}`),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: { ar: absUrl(`/ar${path}`), en: absUrl(`/en${path}`) } },
  });
  return [
    both("", products[0]?.updatedAt, 1),
    both("/products", products[0]?.updatedAt, 0.8),
    ...products.map((p) => ({
      ...both(`/products/${p.slug}`, p.updatedAt, 0.9),
      images: p.media.filter((m) => m.kind === "image").map((m) => absUrl(m.url)),
    })),
    ...pages.map((p) => both(`/pages/${p.slug}`, p.updatedAt, 0.3)),
    both("/track", undefined, 0.2),
  ];
}
