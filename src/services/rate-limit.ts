import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";

/**
 * Fixed-window rate limiter stored in Postgres so it works across serverless
 * instances. Returns whether the call is allowed and how many remain.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const now = new Date();
  const reset = new Date(now.getTime() + windowSeconds * 1000);
  const [row] = await conn
    .insert(schema.rateLimits)
    .values({ key, count: 1, resetAt: reset })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${schema.rateLimits.resetAt} < ${now.toISOString()}::timestamptz then 1 else ${schema.rateLimits.count} + 1 end`,
        resetAt: sql`case when ${schema.rateLimits.resetAt} < ${now.toISOString()}::timestamptz then ${reset.toISOString()}::timestamptz else ${schema.rateLimits.resetAt} end`,
      },
    })
    .returning();
  const count = row?.count ?? 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: row?.resetAt ?? reset };
}

export async function clearRateLimit(key: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  await conn.delete(schema.rateLimits).where(sql`${schema.rateLimits.key} = ${key}`);
}
