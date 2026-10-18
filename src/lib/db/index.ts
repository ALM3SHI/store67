import "server-only";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "@/config/env";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Holder = { db?: Promise<Db> };
const g = globalThis as unknown as { __store76db?: Holder };
const holder: Holder = (g.__store76db ??= {});

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<Db> {
  if (env.databaseUrl) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: env.databaseUrl,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: process.env.DATABASE_SSL === "disable" ? false : env.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    return drizzle(pool, { schema });
  }

  // Embedded Postgres (PGlite) — zero-setup local development and tests only.
  if (env.appEnv === "production") {
    throw new Error("DATABASE_URL is required when APP_ENV=production");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = env.pgliteDir === "memory://" ? "memory://" : path.resolve(env.pgliteDir);
  if (dir !== "memory://") {
    const fs = await import("node:fs/promises");
    await fs.mkdir(path.dirname(dir), { recursive: true });
  }
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

/** Lazily-initialised shared database handle. */
export function getDb(): Promise<Db> {
  holder.db ??= connect().catch((err) => {
    holder.db = undefined;
    throw err;
  });
  return holder.db;
}

/** True when the store is backed by a real database connection string. */
export const hasExternalDatabase = () => Boolean(env.databaseUrl);

export { schema };
