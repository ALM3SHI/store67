"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/services/audit";
import { invalidateSearchIndex } from "@/services/search";
import type { ActionState } from "@/components/admin/ui";

const categorySchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "المعرّف في الرابط: حروف إنجليزية صغيرة وأرقام وشرطات فقط، مثل personal-care")
    .max(60),
  nameAr: z.string().trim().min(2, "اكتب الاسم بالعربية").max(60),
  nameEn: z.string().trim().min(2, "Write the English name").max(60),
  sort: z.coerce.number().int().min(0).max(999).default(0),
});

function refresh() {
  invalidateSearchIndex();
  revalidatePath("/", "layout");
}

export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("products.manage");
  const id = String(fd.get("id") ?? "");
  const parsed = categorySchema.safeParse({ slug: fd.get("slug"), nameAr: fd.get("nameAr"), nameEn: fd.get("nameEn"), sort: fd.get("sort") || 0 });
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(" — ") };
  if (id && !z.uuid().safeParse(id).success) return { ok: false, message: "تصنيف غير صالح." };
  const db = await getDb();
  const [clash] = await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.slug, parsed.data.slug));
  if (clash && clash.id !== id) return { ok: false, message: "يوجد تصنيف بنفس المعرّف." };
  if (id) await db.update(schema.categories).set(parsed.data).where(eq(schema.categories.id, id));
  else await db.insert(schema.categories).values(parsed.data);
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: id ? "category.update" : "category.create", entity: "category", entityId: id || parsed.data.slug, meta: parsed.data });
  refresh();
  return { ok: true, message: id ? "حُفظ التصنيف." : "أُضيف التصنيف. اختره الآن من صفحة المنتج." };
}

export async function deleteCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("products.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { ok: false, message: "تصنيف غير صالح." };
  const db = await getDb();
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.categoryId, id.data));
  if (n > 0 && fd.get("confirm") !== "on") return { ok: false, message: `في هذا التصنيف ${n} منتج. فعّل خيار التأكيد للحذف؛ ستبقى المنتجات لكن بدون تصنيف.` };
  const [gone] = await db.delete(schema.categories).where(eq(schema.categories.id, id.data)).returning();
  if (!gone) return { ok: false, message: "التصنيف غير موجود." };
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "category.delete", entity: "category", entityId: id.data, meta: { slug: gone.slug, products: n } });
  refresh();
  return { ok: true, message: "حُذف التصنيف." };
}
