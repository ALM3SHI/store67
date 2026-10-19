"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PENDING_COOKIE, PENDING_MINUTES, readPendingLogin, signPendingLogin, verifySecondFactor } from "@/services/two-factor";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { clientIp, createAdminSession, destroyAdminSession, getAdminSession } from "@/lib/auth/session";
import { rateLimit, clearRateLimit } from "@/services/rate-limit";
import { audit } from "@/services/audit";
import { requestPasswordReset, resetPassword, MIN_PASSWORD } from "@/services/password-reset";
import { emailConfigured } from "@/services/notify";
import { env } from "@/config/env";

const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });
// A real hash of a random string: keeps timing the same when the email doesn't exist.
const DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function login(_: unknown, formData: FormData): Promise<{ error: string } | null> {
  const parsed = loginSchema.safeParse({ email: String(formData.get("email") ?? "").trim().toLowerCase(), password: formData.get("password") });
  if (!parsed.success) return { error: "أدخل البريد الإلكتروني وكلمة المرور." };
  const ip = (await clientIp()) ?? "local";
  const key = `login:${parsed.data.email}:${ip}`;
  const rl = await rateLimit(key, 5, 900);
  if (!rl.allowed) return { error: "محاولات كثيرة. انتظر ١٥ دقيقة ثم أعد المحاولة." };

  const db = await getDb();
  const [user] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, parsed.data.email));
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY);
  if (!user || !ok || !user.active) {
    await audit({ action: "auth.login_failed", entity: "admin_user", actorEmail: parsed.data.email, ip });
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }
  await clearRateLimit(key);
  if (user.totpEnabledAt) {
    // Password is right; the session is created only after the second factor.
    const jar = await cookies();
    jar.set(PENDING_COOKIE, signPendingLogin(user.id), { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/admin", maxAge: PENDING_MINUTES * 60 });
    await audit({ actorId: user.id, actorEmail: user.email, action: "auth.password_ok_2fa_pending", entity: "admin_user", entityId: user.id, ip });
    redirect("/admin/login/verify");
  }
  await createAdminSession(user.id);
  await db.update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, user.id));
  await audit({ actorId: user.id, actorEmail: user.email, action: "auth.login", entity: "admin_user", entityId: user.id, ip });
  redirect("/admin");
}

export async function logout() {
  const s = await getAdminSession();
  await destroyAdminSession();
  if (s) await audit({ actorId: s.userId, actorEmail: s.email, action: "auth.logout", entity: "admin_user", entityId: s.userId });
  redirect("/admin/login");
}

export type ResetState = { ok: boolean; message: string } | null;

export async function forgotPassword(_: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { ok: false, message: "أدخل بريدًا إلكترونيًا صحيحًا." };
  const r = await requestPasswordReset(email, await clientIp());
  if (r.limited) return { ok: false, message: "طلبات كثيرة. انتظر ساعة ثم حاول مجددًا." };
  const devNote = !emailConfigured() && env.appEnv !== "production" ? " (بيئة تطوير: البريد غير مهيأ، لذلك يظهر الرابط في نافذة الخادم التي شغّلت منها npm run dev.)" : "";
  return { ok: true, message: `إن كان البريد مسجلًا لدينا فستصلك رسالة برابط صالح لمدة 30 دقيقة.${devNote}` };
}

export async function completePasswordReset(_: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { ok: false, message: "كلمتا المرور غير متطابقتين." };
  const ip = await clientIp();
  const rl = await rateLimit(`pwreset:complete:${ip ?? "unknown"}`, 10, 900);
  if (!rl.allowed) return { ok: false, message: "محاولات كثيرة. انتظر قليلًا." };
  const r = await resetPassword(token, password, { ip });
  if (!r.ok) return { ok: false, message: r.reason === "weak" ? `كلمة المرور ${MIN_PASSWORD} حرفًا على الأقل.` : "الرابط غير صالح أو انتهت صلاحيته أو استُخدم من قبل. اطلب رابطًا جديدًا." };
  redirect("/admin/login?reset=1");
}

export async function verifyLoginCode(_: ResetState, formData: FormData): Promise<ResetState> {
  const jar = await cookies();
  const userId = readPendingLogin(jar.get(PENDING_COOKIE)?.value);
  if (!userId) redirect("/admin/login?expired=1");
  const ip = await clientIp();
  const rl = await rateLimit(`2fa:${userId}`, 6, 900);
  if (!rl.allowed) return { ok: false, message: "محاولات كثيرة. انتظر ١٥ دقيقة ثم سجّل الدخول من جديد." };
  const code = String(formData.get("code") ?? "").slice(0, 40);
  const via = await verifySecondFactor(userId, code);
  const db = await getDb();
  const [user] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, userId));
  if (!via || !user || !user.active) {
    await audit({ actorId: userId, actorEmail: user?.email ?? null, action: "auth.2fa_failed", entity: "admin_user", entityId: userId, ip });
    return { ok: false, message: "الرمز غير صحيح أو مستخدم من قبل. أدخل الرمز الحالي من تطبيق المصادقة." };
  }
  await clearRateLimit(`2fa:${userId}`);
  jar.delete({ name: PENDING_COOKIE, path: "/admin" });
  await createAdminSession(user.id);
  await db.update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, user.id));
  await audit({ actorId: user.id, actorEmail: user.email, action: via === "recovery" ? "auth.login_recovery_code" : "auth.login", entity: "admin_user", entityId: user.id, ip });
  redirect(via === "recovery" ? "/admin/account?recovery=1" : "/admin");
}
