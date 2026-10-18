/**
 * Creates (or resets the password of) an admin user.
 *
 *   ADMIN_PASSWORD='a-long-passphrase' npm run admin:create -- owner@example.com "Store Owner" owner
 *
 * If ADMIN_PASSWORD is not set, a strong random password is generated and
 * printed ONCE. Passwords are stored as scrypt hashes only.
 */
import { getDb, schema } from "@/lib/db";
import { hashPassword, randomToken } from "@/lib/crypto";

async function main() {
  const [email, name = "Owner", role = "owner"] = process.argv.slice(2);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Usage: npm run admin:create -- <email> [name] [owner|manager|support]");
    process.exit(1);
  }
  if (!["owner", "manager", "support"].includes(role)) throw new Error("role must be owner, manager or support");
  let password = process.env.ADMIN_PASSWORD;
  const generated = !password;
  if (!password) password = randomToken(18);
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");

  const db = await getDb();
  const passwordHash = await hashPassword(password);
  await db
    .insert(schema.adminUsers)
    .values({ email: email.toLowerCase(), name, role: role as "owner", passwordHash })
    .onConflictDoUpdate({ target: schema.adminUsers.email, set: { passwordHash, name, role: role as "owner", active: true, updatedAt: new Date() } });

  console.log(`✓ admin ready: ${email.toLowerCase()} (${role})`);
  if (generated) console.log(`  generated password (shown once): ${password}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
