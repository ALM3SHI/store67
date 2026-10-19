import { z } from "zod";

const t = (max = 300) => z.string().trim().max(max).default("");
const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "سعر غير صالح");

export const variantInputSchema = z.object({
  id: z.uuid().optional().or(z.literal("")),
  sku: z.string().trim().min(2, "رمز SKU مطلوب").max(60).regex(/^[A-Za-z0-9._-]+$/, "SKU: حروف إنجليزية وأرقام و - _ ."),
  nameAr: t(80),
  nameEn: t(80),
  price: money,
  compareAt: money.or(z.literal("")).default(""),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  trackInventory: z.boolean().default(true),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).default(5),
  weightGrams: z.coerce.number().int().min(0).max(100000).nullable().default(null),
  lengthMm: z.coerce.number().int().min(0).max(10000).nullable().default(null),
  widthMm: z.coerce.number().int().min(0).max(10000).nullable().default(null),
  heightMm: z.coerce.number().int().min(0).max(10000).nullable().default(null),
  active: z.boolean().default(true),
});

export const mediaInputSchema = z.object({
  id: z.uuid().optional().or(z.literal("")),
  url: z.string().trim().min(1).max(500).refine((u) => u.startsWith("/") || u.startsWith("https://"), "رابط صورة غير صالح"),
  kind: z.enum(["image", "video"]).default("image"),
  altAr: t(200),
  altEn: t(200),
  width: z.number().int().nullable().default(null),
  height: z.number().int().nullable().default(null),
  placeholder: z.boolean().default(false),
});

const loc = z.object({ ar: t(300), en: t(300) });

export const productInputSchema = z.object({
  id: z.uuid().optional().or(z.literal("")),
  slug: z.string().trim().toLowerCase().min(2, "الرابط المختصر مطلوب").max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "الرابط المختصر: حروف إنجليزية صغيرة وأرقام وشرطات"),
  status: z.enum(["draft", "published", "archived"]),
  categoryId: z.uuid().nullable().or(z.literal("")).default(null),
  featured: z.boolean().default(false),
  brand: t(80),
  gtin: z.string().trim().regex(/^(\d{8}|\d{12,14})?$/, "GTIN: 8 أو 12–14 رقمًا").default(""),
  mpn: t(60),
  nameAr: z.string().trim().min(2, "اسم المنتج بالعربية مطلوب").max(120),
  nameEn: z.string().trim().min(2, "اسم المنتج بالإنجليزية مطلوب").max(120),
  taglineAr: t(160),
  taglineEn: t(160),
  shortAr: t(500),
  shortEn: t(500),
  descriptionAr: t(8000),
  descriptionEn: t(8000),
  highlights: z.array(loc).max(12).default([]),
  specs: z.array(z.object({ labelAr: t(80), labelEn: t(80), valueAr: t(200), valueEn: t(200), verified: z.boolean().default(false) })).max(40).default([]),
  inBox: z.array(loc).max(20).default([]),
  compatibility: z.array(z.object({ ar: t(200), en: t(200), verified: z.boolean().default(false) })).max(20).default([]),
  howToUse: z.array(z.object({ titleAr: t(80), titleEn: t(80), bodyAr: t(400), bodyEn: t(400) })).max(10).default([]),
  faqs: z.array(z.object({ qAr: t(200), qEn: t(200), aAr: t(1000), aEn: t(1000) })).max(30).default([]),
  warrantyAr: t(500),
  warrantyEn: t(500),
  seoTitleAr: t(70),
  seoTitleEn: t(70),
  seoDescAr: t(170),
  seoDescEn: t(170),
  keywords: t(500),
  model3d: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^builtin:[a-z0-9-]+$/.test(v) || /^(\/api\/media\/|https:\/\/).+\.glb$/i.test(v), "المجسم: نموذج مدمج أو رابط ملف .glb")
    .default(""),
  variants: z.array(variantInputSchema).min(1, "أضف إصدارًا واحدًا على الأقل (السعر والمخزون)").max(50),
  media: z.array(mediaInputSchema).max(30).default([]),
});

export type ProductInput = z.input<typeof productInputSchema>;
