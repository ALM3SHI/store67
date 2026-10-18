"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { clientIp, createAdminSession, destroyAdminSession, getAdminSession } from "@/lib/auth/session";
import { rateLimit, clearRateLimit } from "@/services/rate-limit";
import { audit } from "@/services/audit";

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
