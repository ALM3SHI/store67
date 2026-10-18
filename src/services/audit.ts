import "server-only";
import { getDb, schema, type DbOrTx } from "@/lib/db";

export async function audit(
  e: { actorId?: string | null; actorEmail?: string | null; action: string; entity: string; entityId?: string | null; meta?: Record<string, unknown>; ip?: string | null },
  db?: DbOrTx,
) {
  try {
    const conn = db ?? (await getDb());
    await conn.insert(schema.auditLogs).values({
      actorId: e.actorId ?? null,
      actorEmail: e.actorEmail ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      meta: e.meta ?? null,
      ip: e.ip ?? null,
    });
  } catch (err) {
    // Auditing must never break the operation it records.
    console.error("[audit] failed to write", e.action, err instanceof Error ? err.message : err);
  }
}
