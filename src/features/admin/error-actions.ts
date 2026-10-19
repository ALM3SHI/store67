"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/services/audit";

export async function resolveAppError(fd: FormData) {
  const admin = await requireAdmin("audit.view");
  const db = await getDb();
  if (fd.get("all") === "1") {
    await db.update(schema.appErrors).set({ resolved: true }).where(eq(schema.appErrors.resolved, false));
  } else {
    const fp = z.string().regex(/^[0-9a-f]{32}$/).parse(fd.get("fingerprint"));
    await db.update(schema.appErrors).set({ resolved: true }).where(eq(schema.appErrors.fingerprint, fp));
  }
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "errors.resolve", entity: "app_error", entityId: String(fd.get("fingerprint") ?? "all") });
  revalidatePath("/admin/errors");
}
