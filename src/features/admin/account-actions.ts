"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/services/audit";
import { rateLimit } from "@/services/rate-limit";
import { newRecoveryCodes, normalizeRecovery } from "@/lib/totp";
import { sha256 } from "@/lib/crypto";
import { beginTwoFactorSetup, confirmTwoFactorSetup, disableTwoFactor, verifySecondFactor } from "@/services/two-factor";

export type TwoFactorState =
  | null
  | { step: "scan"; qrSvg: string; secret: string; error?: string }
  | { step: "codes"; codes: string[] }
  | { step: "done"; message: string }
  | { step: "error"; message: string };

export async function twoFactorAction(prev: TwoFactorState, fd: FormData): Promise<TwoFactorState> {
  const me = await requireAdmin("dashboard.view");
  const intent = String(fd.get("intent") ?? "");
  const rl = await rateLimit(`2fa-manage:${me.userId}`, 15, 900);
  if (!rl.allowed) return { step: "error", message: "محاولات كثيرة. انتظر قليلًا." };

  if (intent === "start") {
    const s = await beginTwoFactorSetup(me.userId, me.email);
    return { step: "scan", qrSvg: s.qrSvg, secret: s.secret };
  }
  if (intent === "confirm") {
    const codes = await confirmTwoFactorSetup(me.userId, String(fd.get("code") ?? ""));
    if (!codes) return prev && prev.step === "scan" ? { ...prev, error: "الرمز غير صحيح. تأكد من وقت الجوال وأدخل الرمز الحالي." } : { step: "error", message: "ابدأ الإعداد من جديد." };
    await audit({ actorId: me.userId, actorEmail: me.email, action: "auth.2fa_enabled", entity: "admin_user", entityId: me.userId });
    revalidatePath("/admin/account");
    return { step: "codes", codes };
  }
  if (intent === "disable" || intent === "regenerate") {
    const via = await verifySecondFactor(me.userId, String(fd.get("code") ?? ""));
    if (!via) return { step: "error", message: "أدخل رمزًا صحيحًا من تطبيق المصادقة (أو رمز استرداد) للتأكيد." };
    if (intent === "disable") {
      await disableTwoFactor(me.userId);
      await audit({ actorId: me.userId, actorEmail: me.email, action: "auth.2fa_disabled", entity: "admin_user", entityId: me.userId });
      revalidatePath("/admin/account");
      return { step: "done", message: "أُوقف التحقق بخطوتين." };
    }
    const codes = newRecoveryCodes();
    const db = await getDb();
    await db.update(schema.adminUsers).set({ recoveryCodes: codes.map((c) => sha256(normalizeRecovery(c))) }).where(eq(schema.adminUsers.id, me.userId));
    await audit({ actorId: me.userId, actorEmail: me.email, action: "auth.2fa_recovery_regenerated", entity: "admin_user", entityId: me.userId });
    revalidatePath("/admin/account");
    return { step: "codes", codes };
  }
  return null;
}

/** Owner: turn off 2FA for a colleague who lost their phone and recovery codes. */
export async function resetUserTwoFactor(fd: FormData) {
  const owner = await requireAdmin("users.manage");
  const id = z.uuid().parse(fd.get("id"));
  if (id === owner.userId) return;
  await disableTwoFactor(id);
  const db = await getDb();
  await db.delete(schema.adminSessions).where(eq(schema.adminSessions.userId, id));
  await audit({ actorId: owner.userId, actorEmail: owner.email, action: "user.2fa_reset", entity: "admin_user", entityId: id });
  revalidatePath("/admin/users");
}
