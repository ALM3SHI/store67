"use server";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/services/audit";
import type { ActionState } from "@/components/admin/ui";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function savePromotion(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("coupons.manage");
  const id = str(fd, "id");
  const type = str(fd, "type") === "bundle" ? "bundle" : "quantity";
  const nameAr = str(fd, "nameAr").slice(0, 80);
  const nameEn = str(fd, "nameEn").slice(0, 80);
  const percentOff = Number(str(fd, "percentOff"));
  const minQuantity = type === "quantity" ? Number(str(fd, "minQuantity") || "2") : 1;
  const productIds = [...new Set(fd.getAll("productIds").map(String))].filter((x) => z.uuid().safeParse(x).success);
  if (nameAr.length < 3) return { ok: false, message: "اكتب اسم العرض كما سيظهر للعميل (عربي)." };
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) return { ok: false, message: "نسبة الخصم بين 1 و90." };
  if (type === "quantity" && (!Number.isInteger(minQuantity) || minQuantity < 2 || minQuantity > 50)) return { ok: false, message: "أقل كمية بين 2 و50." };
  if (type === "bundle" && productIds.length < 2) return { ok: false, message: "اختر منتجين على الأقل للباقة." };
  const db = await getDb();
  if (productIds.length) {
    const found = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, productIds));
    if (found.length !== productIds.length) return { ok: false, message: "بعض المنتجات المختارة غير موجودة." };
  }
  const startsAt = str(fd, "startsAt") ? new Date(`${str(fd, "startsAt")}T00:00:00+03:00`) : null;
  const endsAt = str(fd, "endsAt") ? new Date(`${str(fd, "endsAt")}T23:59:59+03:00`) : null;
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء." };
  const row = { nameAr, nameEn: nameEn || nameAr, type, productIds, minQuantity, percentOff, startsAt, endsAt, active: fd.get("active") === "on", updatedAt: new Date() };
  if (id) await db.update(schema.promotions).set(row).where(eq(schema.promotions.id, z.uuid().parse(id)));
  else await db.insert(schema.promotions).values(row);
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: id ? "promotion.update" : "promotion.create", entity: "promotion", entityId: id || nameAr, meta: { type, percentOff, productIds: productIds.length } });
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظ العرض. يُطبَّق تلقائيًا في السلة دون كود." };
}

export async function togglePromotion(fd: FormData) {
  const admin = await requireAdmin("coupons.manage");
  const id = z.uuid().parse(fd.get("id"));
  const db = await getDb();
  const [p] = await db.select().from(schema.promotions).where(eq(schema.promotions.id, id));
  if (!p) return;
  await db.update(schema.promotions).set({ active: !p.active, updatedAt: new Date() }).where(eq(schema.promotions.id, id));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "promotion.toggle", entity: "promotion", entityId: id, meta: { active: !p.active } });
  revalidatePath("/", "layout");
}

export async function deletePromotion(fd: FormData) {
  const admin = await requireAdmin("coupons.manage");
  const id = z.uuid().parse(fd.get("id"));
  const db = await getDb();
  await db.delete(schema.promotions).where(eq(schema.promotions.id, id));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "promotion.delete", entity: "promotion", entityId: id });
  revalidatePath("/", "layout");
}
