import { aiProvider } from "@/services/ai";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { listCategories } from "@/services/catalog";
import { PageHeader } from "@/components/admin/static";
import { ProductEditor } from "@/components/admin/product-editor";
import { halalasToInput } from "@/lib/money";

export const metadata = { title: "تعديل المنتج" };

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin("products.manage");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) notFound();
  const [variants, media, categories] = await Promise.all([
    db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, id)).orderBy(asc(schema.productVariants.sort)),
    db.select().from(schema.productMedia).where(eq(schema.productMedia.productId, id)).orderBy(asc(schema.productMedia.sort)),
    listCategories(),
  ]);
  return (
    <>
      <PageHeader
        title={p.nameAr}
        description={sp.saved ? "أُنشئ المنتج. أكمل البيانات ثم انشره." : undefined}
        actions={p.status === "published" ? <Link href={`/ar/products/${p.slug}`} target="_blank" className="btn btn-ghost btn-sm">عرض في المتجر</Link> : null}
      />
      <ProductEditor
        categories={categories}
        aiEnabled={aiProvider() !== null}
        initial={{
          id: p.id,
          slug: p.slug,
          status: p.status,
          categoryId: p.categoryId,
          featured: p.featured,
          brand: p.brand ?? "",
          gtin: p.gtin ?? "",
          mpn: p.mpn ?? "",
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
          seoTitleAr: p.seoTitleAr ?? "",
          seoTitleEn: p.seoTitleEn ?? "",
          seoDescAr: p.seoDescAr ?? "",
          seoDescEn: p.seoDescEn ?? "",
          keywords: p.keywords,
          model3d: p.model3d ?? "",
          variants: variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            nameAr: v.nameAr,
            nameEn: v.nameEn,
            price: halalasToInput(v.priceHalalas),
            compareAt: halalasToInput(v.compareAtHalalas),
            stock: v.stock,
            trackInventory: v.trackInventory,
            lowStockThreshold: v.lowStockThreshold,
            weightGrams: v.weightGrams,
            lengthMm: v.lengthMm,
            widthMm: v.widthMm,
            heightMm: v.heightMm,
            active: v.active,
          })),
          media: media.map((m) => ({ id: m.id, url: m.url, kind: m.kind as "image" | "video", altAr: m.altAr, altEn: m.altEn, width: m.width, height: m.height, placeholder: m.placeholder })),
        }}
      />
    </>
  );
}
