"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/services/audit";
import { saveSetting, settingSchemas, type SettingKey } from "@/services/settings";
import { parseSARToHalalas } from "@/lib/money";
import { hashPassword, randomToken } from "@/lib/crypto";
import { putFile, validateUpload, UploadError, deleteFile } from "@/services/storage";
import { invalidateSearchIndex } from "@/services/search";
import type { ActionState } from "@/components/admin/ui";

const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const dateOrNull = (v: string) => (v ? new Date(`${v}T00:00:00+03:00`) : null);
const zodMsg = (e: unknown) => (e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" — ") : "تعذّر الحفظ.");

/* ───────────── Coupons */
export async function saveCoupon(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("coupons.manage");
  const id = str(fd, "id");
  const type = str(fd, "type") as "percent" | "fixed" | "free_shipping";
  const code = str(fd, "code").toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, message: "الكود: 3–30 حرفًا إنجليزيًا أو رقمًا." };
  if (!["percent", "fixed", "free_shipping"].includes(type)) return { ok: false, message: "نوع غير صالح." };
  let value = 0;
  if (type === "percent") {
    value = Number(str(fd, "value"));
    if (!Number.isInteger(value) || value < 1 || value > 100) return { ok: false, message: "نسبة الخصم بين 1 و100." };
  } else if (type === "fixed") {
    const h = parseSARToHalalas(str(fd, "value"));
    if (!h) return { ok: false, message: "أدخل قيمة الخصم بالريال." };
    value = h;
  }
  const minSubtotal = parseSARToHalalas(str(fd, "minSubtotal") || "0") ?? 0;
  const maxDiscount = str(fd, "maxDiscount") ? parseSARToHalalas(str(fd, "maxDiscount")) : null;
  const usageLimit = str(fd, "usageLimit") ? Math.max(1, Number(str(fd, "usageLimit"))) : null;
  const perCustomerLimit = str(fd, "perCustomerLimit") ? Math.max(1, Number(str(fd, "perCustomerLimit"))) : null;
  const startsAt = dateOrNull(str(fd, "startsAt"));
  const endsAt = str(fd, "endsAt") ? new Date(`${str(fd, "endsAt")}T23:59:59+03:00`) : null;
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء." };
  const row = {
    code,
    type,
    value,
    minSubtotalHalalas: minSubtotal,
    maxDiscountHalalas: maxDiscount,
    usageLimit,
    perCustomerLimit,
    startsAt,
    endsAt,
    active: bool(fd, "active"),
    showInBanner: bool(fd, "showInBanner"),
    descriptionAr: str(fd, "descriptionAr").slice(0, 120) || null,
    descriptionEn: str(fd, "descriptionEn").slice(0, 120) || null,
    updatedAt: new Date(),
  };
  const db = await getDb();
  const [clash] = await db.select({ id: schema.coupons.id }).from(schema.coupons).where(eq(schema.coupons.code, code));
  if (clash && clash.id !== id) return { ok: false, message: "هذا الكود موجود بالفعل." };
  if (id) await db.update(schema.coupons).set(row).where(eq(schema.coupons.id, id));
  else await db.insert(schema.coupons).values(row);
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: id ? "coupon.update" : "coupon.create", entity: "coupon", entityId: id || code, meta: { type, value, active: row.active } });
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظ الكوبون." };
}

export async function toggleCoupon(fd: FormData) {
  const admin = await requireAdmin("coupons.manage");
  const id = z.uuid().parse(fd.get("id"));
  const db = await getDb();
  const [c] = await db.select().from(schema.coupons).where(eq(schema.coupons.id, id));
  if (!c) return;
  await db.update(schema.coupons).set({ active: !c.active, updatedAt: new Date() }).where(eq(schema.coupons.id, id));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "coupon.toggle", entity: "coupon", entityId: id, meta: { active: !c.active } });
  revalidatePath("/", "layout");
}

/* ───────────── Reviews */
export async function moderateReview(fd: FormData) {
  const admin = await requireAdmin("reviews.manage");
  const id = z.uuid().parse(fd.get("id"));
  const status = z.enum(["approved", "rejected"]).parse(fd.get("status"));
  const db = await getDb();
  await db.update(schema.reviews).set({ status }).where(eq(schema.reviews.id, id));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "review.moderate", entity: "review", entityId: id, meta: { status } });
  revalidatePath("/", "layout");
}

/* ───────────── Pages */
export async function savePage(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("pages.manage");
  const slug = str(fd, "slug");
  const data = {
    titleAr: str(fd, "titleAr").slice(0, 120),
    titleEn: str(fd, "titleEn").slice(0, 120),
    bodyAr: str(fd, "bodyAr").slice(0, 30000),
    bodyEn: str(fd, "bodyEn").slice(0, 30000),
    published: bool(fd, "published"),
    reviewed: bool(fd, "reviewed"),
    updatedAt: new Date(),
  };
  if (!data.titleAr || !data.titleEn) return { ok: false, message: "العنوان مطلوب باللغتين." };
  const db = await getDb();
  await db.update(schema.pages).set(data).where(eq(schema.pages.slug, slug));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "page.update", entity: "page", entityId: slug, meta: { reviewed: data.reviewed } });
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظت الصفحة." };
}

/* ───────────── Business documents (private files) */
const DOC_MAX = 10 * 1024 * 1024;
export async function saveDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("documents.manage");
  const id = str(fd, "id");
  const status = z.enum(["missing", "needs_review", "valid_per_admin"]).safeParse(str(fd, "status"));
  if (!status.success) return { ok: false, message: "حالة غير صالحة." };
  const expiresAt = dateOrNull(str(fd, "expiresAt"));
  const number = str(fd, "number").slice(0, 60) || null;
  if (status.data === "valid_per_admin" && !number) return { ok: false, message: "أدخل رقم الوثيقة قبل تحديدها «سارية»." };
  if (status.data === "valid_per_admin" && expiresAt && expiresAt <= new Date()) return { ok: false, message: "تاريخ الانتهاء مضى؛ لا يمكن تحديد الوثيقة كسارية." };
  const row: Partial<typeof schema.businessDocuments.$inferInsert> = {
    kind: str(fd, "kind").slice(0, 30) || "other",
    titleAr: str(fd, "titleAr").slice(0, 120) || "وثيقة",
    titleEn: str(fd, "titleEn").slice(0, 120) || "Document",
    number,
    issuedAt: dateOrNull(str(fd, "issuedAt")),
    expiresAt,
    status: status.data,
    notes: str(fd, "notes").slice(0, 1000) || null,
    showPublicly: bool(fd, "showPublicly"),
    updatedAt: new Date(),
  };
  const file = fd.get("file");
  const db = await getDb();
  if (file instanceof File && file.size > 0) {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const { mime, ext } = validateUpload(buf, "document", DOC_MAX);
      const stored = await putFile("private", "documents", ext, buf, mime);
      if (id) {
        const [old] = await db.select().from(schema.businessDocuments).where(eq(schema.businessDocuments.id, id));
        if (old?.fileKey) await deleteFile("private", old.fileKey).catch(() => {});
      }
      row.fileKey = stored.key;
      row.fileName = file.name.slice(0, 120);
    } catch (e) {
      return { ok: false, message: e instanceof UploadError && e.code === "too_large" ? "الملف أكبر من 10MB." : "الملف يجب أن يكون PDF أو صورة JPG/PNG." };
    }
  }
  if (id) await db.update(schema.businessDocuments).set(row).where(eq(schema.businessDocuments.id, id));
  else await db.insert(schema.businessDocuments).values(row as typeof schema.businessDocuments.$inferInsert);
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: id ? "document.update" : "document.create", entity: "document", entityId: id || row.kind, meta: { status: row.status, showPublicly: row.showPublicly, file: Boolean(row.fileKey) } });
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظت الوثيقة." };
}

/* ───────────── Settings */
export async function saveSettingsGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("settings.manage");
  const key = str(fd, "group") as SettingKey;
  if (!(key in settingSchemas)) return { ok: false, message: "مجموعة غير معروفة." };
  let value: unknown;
  try {
    value = JSON.parse(str(fd, "payload"));
  } catch {
    return { ok: false, message: "تعذّر قراءة البيانات." };
  }
  try {
    const saved = await saveSetting(key, value);
    await audit({ actorId: admin.userId, actorEmail: admin.email, action: "settings.update", entity: "settings", entityId: key, meta: key === "analytics" || key === "store" ? undefined : (saved as Record<string, unknown>) });
  } catch (e) {
    return { ok: false, message: zodMsg(e) };
  }
  invalidateSearchIndex();
  revalidatePath("/", "layout");
  return { ok: true, message: "حُفظت الإعدادات." };
}

/* ───────────── Admin users */
export async function createAdminUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("users.manage");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name").slice(0, 80);
  const role = z.enum(["owner", "manager", "support"]).safeParse(str(fd, "role"));
  if (!z.email().safeParse(email).success || !name || !role.success) return { ok: false, message: "أدخل الاسم والبريد والدور." };
  const db = await getDb();
  const [exists] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, email));
  if (exists) return { ok: false, message: "يوجد مستخدم بهذا البريد." };
  const password = randomToken(14);
  await db.insert(schema.adminUsers).values({ email, name, role: role.data, passwordHash: await hashPassword(password) });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "user.create", entity: "admin_user", entityId: email, meta: { role: role.data } });
  revalidatePath("/admin/users");
  return { ok: true, message: `أُنشئ الحساب. كلمة المرور المؤقتة (تظهر مرة واحدة): ${password}` };
}

export async function updateAdminUser(fd: FormData) {
  const admin = await requireAdmin("users.manage");
  const id = z.uuid().parse(fd.get("id"));
  if (id === admin.userId) return; // never lock yourself out
  const role = z.enum(["owner", "manager", "support"]).parse(fd.get("role"));
  const active = fd.get("active") === "on";
  const db = await getDb();
  await db.update(schema.adminUsers).set({ role, active, updatedAt: new Date() }).where(eq(schema.adminUsers.id, id));
  if (!active) await db.delete(schema.adminSessions).where(eq(schema.adminSessions.userId, id));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "user.update", entity: "admin_user", entityId: id, meta: { role, active } });
  revalidatePath("/admin/users");
}

export async function changeOwnPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("dashboard.view");
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 12) return { ok: false, message: "كلمة المرور 12 حرفًا على الأقل." };
  const db = await getDb();
  await db.update(schema.adminUsers).set({ passwordHash: await hashPassword(pw), updatedAt: new Date() }).where(eq(schema.adminUsers.id, admin.userId));
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "user.password_change", entity: "admin_user", entityId: admin.userId });
  return { ok: true, message: "تغيّرت كلمة المرور." };
}
