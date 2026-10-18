/**
 * Seeds starter data (idempotent): npm run db:seed
 */
import { getDb } from "@/lib/db";
import { seedDatabase } from "@/lib/db/seed";

getDb()
  .then((db) => seedDatabase(db, console.log))
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
