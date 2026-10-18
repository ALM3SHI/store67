"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { productInputSchema } from "@/schemas/product";
import { parseSARToHalalas } from "@/lib/money";
import { audit } from "@/services/audit";
import { invalidateSearchIndex } from "@/services/search";
import type { ActionState } from "@/components/admin/ui";

const clean = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) => rows.filter((r) => keys.some((k) => String(r[k] ?? "").trim() !== ""));

export async function saveProduct(_: ActionState, formData: FormData): Promise<ActionState & { id?: string }> {
  const admin = await requireAdmin("products.manage");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { ok: false, message: "تعذّر قراءة البيانات." };
  }
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[i.path.join(".")] ??= i.message;
    return { ok: false, message: Object.values(errors)[0] ?? "تحقق من الحقول.", errors };
  }
  const p = parsed.data;

  // Prices: halalas, and the discount price must be lower than the original
  const variants: (typeof p.variants[number] & { priceHalalas: number; compareAtHalalas: number | null })[] = [];
  for (const [i, v] of p.variants.entries()) {
    const price = parseSARToHalalas(v.price)!;
    const compareAt = v.compareAt ? parseSARToHalalas(v.compareAt) : null;
    if (compareAt !== null && compareAt <= price) return { ok: false, message: `الإصدار ${i + 1}: «السعر قبل الخصم» يجب أن يكون أعلى من السعر الحالي، أو اتركه فارغًا.` };
    variants.push({ ...v, priceHalalas: price, compareAtHalalas: compareAt });
  }
  const skus = variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) return { ok: false, message: "رموز SKU يجب ألا تتكرر." };

  const db = await getDb();
  const productId = p.id || undefined;

  // Uniqueness checks with friendly messages
  const [slugClash] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, p.slug));
  if (slugClash && slugClash.id !== productId) return { ok: false, message: "الرابط المختصر مستخدم لمنتج آخر.", errors: { slug: "مستخدم" } };
  const skuRows = await db.select({ id: schema.productVariants.id, sku: schema.productVariants.sku, productId: schema.productVariants.productId }).from(schema.productVariants).where(inArray(schema.productVariants.sku, skus));
  const foreign = skuRows.find((r) => r.productId !== productId);
  if (foreign) return { ok: false, message: `رمز SKU «${foreign.sku}» مستخدم في منتج آخر.` };

  const data = {
    slug: p.slug,
    status: p.status,
    categoryId: p.categoryId || null,
    featured: p.featured,
    brand: p.brand || null,
    gtin: p.gtin || null,
    mpn: p.mpn || null,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    taglineAr: p.taglineAr,
    taglineEn: p.taglineEn,
    shortAr: p.shortAr,
    shortEn: p.shortEn,
    descriptionAr: p.descriptionAr,
    descriptionEn: p.descriptionEn,
    highlights: clean(p.highlights, ["ar", "en"]),
    specs: clean(p.specs, ["labelAr", "labelEn", "valueAr", "valueEn"]),
    inBox: clean(p.inBox, ["ar", "en"]),
    compatibility: clean(p.compatibility, ["ar", "en"]),
    howToUse: clean(p.howToUse, ["titleAr", "titleEn", "bodyAr", "bodyEn"]),
    faqs: clean(p.faqs, ["qAr", "qEn", "aAr", "aEn"]),
    warrantyAr: p.warrantyAr,
    warrantyEn: p.warrantyEn,
    seoTitleAr: p.seoTitleAr || null,
    seoTitleEn: p.seoTitleEn || null,
    seoDescAr: p.seoDescAr || null,
    seoDescEn: p.seoDescEn || null,
    keywords: p.keywords,
    updatedAt: new Date(),
  };

  const id = await (db as unknown as Tx).transaction(async (tx) => {
    let pid = productId;
    if (pid) {
      const [u] = await tx.update(schema.products).set(data).where(eq(schema.products.id, pid)).returning({ id: schema.products.id });
      if (!u) throw new Error("not found");
    } else {
      const [ins] = await tx.insert(schema.products).values(data).returning({ id: schema.products.id });
      pid = ins!.id;
    }

    // Variants: update / insert; removed ones are deleted, or deactivated if ordered before
    const keepIds = variants.map((v) => v.id).filter(Boolean) as string[];
    const existing = await tx.select().from(schema.productVariants).where(eq(schema.productVariants.productId, pid));
    const removed = existing.filter((e) => !keepIds.includes(e.id));
    if (removed.length) {
      const ordered = await tx.select({ v: schema.orderItems.variantId }).from(schema.orderItems).where(inArray(schema.orderItems.variantId, removed.map((r) => r.id)));
      const orderedIds = new Set(ordered.map((o) => o.v));
      const toDelete = removed.filter((r) => !orderedIds.has(r.id)).map((r) => r.id);
      const toDeactivate = removed.filter((r) => orderedIds.has(r.id)).map((r) => r.id);
      if (toDelete.length) await tx.delete(schema.productVariants).where(inArray(schema.productVariants.id, toDelete));
      if (toDeactivate.length) await tx.update(schema.productVariants).set({ active: false }).where(inArray(schema.productVariants.id, toDeactivate));
    }
    for (const [i, v] of variants.entries()) {
      const row = {
        productId: pid,
        sku: v.sku.toUpperCase(),
        nameAr: v.nameAr,
        nameEn: v.nameEn,
        priceHalalas: v.priceHalalas,
        compareAtHalalas: v.compareAtHalalas,
        stock: v.stock,
        trackInventory: v.trackInventory,
        lowStockThreshold: v.lowStockThreshold,
        weightGrams: v.weightGrams,
        lengthMm: v.lengthMm,
        widthMm: v.widthMm,
        heightMm: v.heightMm,
        active: v.active,
        sort: i,
        updatedAt: new Date(),
      };
      const prev = existing.find((e) => e.id === v.id);
      if (prev) {
        await tx.update(schema.productVariants).set(row).where(eq(schema.productVariants.id, prev.id));
        if (prev.stock !== v.stock) {
          await tx.insert(schema.inventoryMovements).values({ variantId: prev.id, delta: v.stock - prev.stock, reason: "adjust", actorId: admin.userId });
        }
      } else {
        const [nv] = await tx.insert(schema.productVariants).values(row).returning({ id: schema.productVariants.id });
        if (v.stock) await tx.insert(schema.inventoryMovements).values({ variantId: nv!.id, delta: v.stock, reason: "restock", actorId: admin.userId });
      }
    }

    // Media: replace ordering, delete removed rows
    const keepMedia = p.media.map((m) => m.id).filter(Boolean) as string[];
    await tx.delete(schema.productMedia).where(keepMedia.length ? and(eq(schema.productMedia.productId, pid), notInArray(schema.productMedia.id, keepMedia)) : eq(schema.productMedia.productId, pid));
    for (const [i, m] of p.media.entries()) {
      const row = { productId: pid, url: m.url, kind: m.kind, altAr: m.altAr, altEn: m.altEn, width: m.width, height: m.height, placeholder: m.placeholder, sort: i };
      if (m.id) await tx.update(schema.productMedia).set(row).where(eq(schema.productMedia.id, m.id));
      else await tx.insert(schema.productMedia).values(row);
    }
    return pid;
  });

  await audit({ actorId: admin.userId, actorEmail: admin.email, action: productId ? "product.update" : "product.create", entity: "product", entityId: id, meta: { slug: p.slug, status: p.status, prices: variants.map((v) => [v.sku, v.priceHalalas]) } });
  invalidateSearchIndex();
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظ المنتج.", id };
}

export async function setProductStatus(id: string, status: "draft" | "published" | "archived") {
  const admin = await requireAdmin("products.manage");
  const db = await getDb();
  await db.update(schema.products).set({ status, updatedAt: new Date() }).where(eq(schema.products.id, id));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "product.status", entity: "product", entityId: id, meta: { status } });
  invalidateSearchIndex();
  revalidatePath("/", "layout");
}

export async function productStockSummary() {
  await requireAdmin("products.manage");
  const db = await getDb();
  return db
    .select({ productId: schema.productVariants.productId, stock: sql<number>`sum(${schema.productVariants.stock})::int`, minPrice: sql<number>`min(${schema.productVariants.priceHalalas})::int`, count: sql<number>`count(*)::int` })
    .from(schema.productVariants)
    .where(eq(schema.productVariants.active, true))
    .groupBy(schema.productVariants.productId);
}
