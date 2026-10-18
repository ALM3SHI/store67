/**
 * Applies SQL migrations in ./drizzle to DATABASE_URL (or the local PGlite
 * database when DATABASE_URL is not set).
 *
 *   npm run db:migrate
 */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  const folder = path.join(process.cwd(), "drizzle");
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, ssl: url.includes("localhost") || process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false } });
    await migrate(drizzle(pool), { migrationsFolder: folder });
    await pool.end();
    console.log("✓ migrations applied to DATABASE_URL");
  } else {
    const { getDb } = await import("@/lib/db");
    await getDb(); // PGlite migrates on connect
    console.log("✓ migrations applied to local PGlite database");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
