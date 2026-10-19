import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { brand } from "@/config/brand";
import { env } from "@/config/env";
import { sha256 } from "@/lib/crypto";

export type ErrorSource = "request" | "action" | "payment" | "shipping" | "cron" | "notify" | "checkout";

const ALERT_EVERY_MS = 60 * 60_000;
/** In-memory throttle for when the database itself is the thing that is down. */
const memoryAlerts = new Map<string, number>();

/** Groups "the same" error: numbers, ids and quoted values are stripped. */
export function errorFingerprint(source: string, message: string, stack?: string) {
  const norm = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/"[^"]*"|'[^']*'/g, "<v>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
  const frame = (stack ?? "").split("\n").find((l) => l.trim().startsWith("at ") && !l.includes("node_modules"))?.trim() ?? "";
  return sha256(`${source}|${norm}|${frame.replace(/:\d+:\d+\)?$/, "")}`).slice(0, 32);
}

function describe(err: unknown) {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`.slice(0, 1000), stack: err.stack?.slice(0, 4000) };
  return { message: String(err).slice(0, 1000), stack: undefined };
}

/**
 * Records a server-side error and, at most once an hour per error, alerts the
 * team (email + Telegram) when error alerts are on. Never throws.
 */
export async function reportError(source: ErrorSource, err: unknown, ctx: { path?: string | null; alert?: boolean } = {}) {
  const { message, stack } = describe(err);
  const fp = errorFingerprint(source, message, stack);
  console.error(`[error:${source}]${ctx.path ? ` ${ctx.path}` : ""} ${message}`);
  const wantAlert = ctx.alert !== false && source !== "notify";
  try {
    const db = await getDb();
    const now = new Date();
    const [row] = await db
      .insert(schema.appErrors)
      .values({ fingerprint: fp, source, message, detail: stack ?? null, path: ctx.path ?? null })
      .onConflictDoUpdate({
        target: schema.appErrors.fingerprint,
        set: { count: sql`${schema.appErrors.count} + 1`, lastSeenAt: now, path: ctx.path ?? null, detail: stack ?? null, resolved: false },
      })
      .returning();
    if (!row || !wantAlert) return;
    if (row.alertedAt && now.getTime() - row.alertedAt.getTime() < ALERT_EVERY_MS) return;
    const { getSettings } = await import("@/services/settings");
    const { notifications } = await getSettings(["notifications"], db);
    if (!notifications.errorAlerts) return;
    // Claim the alert slot first so concurrent failures send one message.
    const [claimed] = await db
      .update(schema.appErrors)
      .set({ alertedAt: now })
      .where(sql`${schema.appErrors.fingerprint} = ${fp} and (${schema.appErrors.alertedAt} is null or ${schema.appErrors.alertedAt} < ${new Date(now.getTime() - ALERT_EVERY_MS).toISOString()}::timestamptz)`)
      .returning({ fp: schema.appErrors.fingerprint });
    if (!claimed) return;
    const { sendAdminAlert } = await import("@/services/notify");
    const { renderErrorAlert } = await import("@/services/notify/templates");
    await sendAdminAlert("error_alert", renderErrorAlert({ source, message, path: ctx.path ?? null, count: row.count, adminLink: `${env.appUrl}/admin/errors`, storeName: brand.name }), db);
  } catch (dbErr) {
    // The database may be what's broken: fall back to a throttled direct Telegram message.
    console.error("[monitoring] could not record error:", dbErr instanceof Error ? dbErr.message : dbErr);
    if (!wantAlert) return;
    const last = memoryAlerts.get(fp) ?? 0;
    if (Date.now() - last < ALERT_EVERY_MS) return;
    memoryAlerts.set(fp, Date.now());
    try {
      const { transport } = await import("@/services/notify/transport");
      const { renderErrorAlert } = await import("@/services/notify/templates");
      await transport.telegram(
        renderErrorAlert({ source, message: `${message}\n(تعذّر أيضًا تسجيله في قاعدة البيانات: ${dbErr instanceof Error ? dbErr.message : String(dbErr)})`, path: ctx.path ?? null, count: 1, adminLink: `${env.appUrl}/admin/errors`, storeName: brand.name }).text,
      );
    } catch {
      /* nothing else we can do */
    }
  }
}

export async function unresolvedErrorCount(sinceHours = 24) {
  const db = await getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.appErrors)
    .where(sql`${schema.appErrors.resolved} = false and ${schema.appErrors.lastSeenAt} > now() - (${sinceHours} || ' hours')::interval`);
  return r?.n ?? 0;
}

export async function resolveError(fingerprint: string) {
  const db = await getDb();
  await db.update(schema.appErrors).set({ resolved: true }).where(eq(schema.appErrors.fingerprint, fingerprint));
}
