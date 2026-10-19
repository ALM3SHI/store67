import { inArray, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { can, roleLabels, type Permission } from "@/lib/auth/permissions";
import { AdminShell } from "@/components/admin/shell";
import { logout } from "@/features/admin/auth-actions";
import { getDb, schema } from "@/lib/db";
import { expireStaleOrders } from "@/services/orders";
import { unresolvedErrorCount } from "@/services/monitoring";

const ALL: Permission[] = ["dashboard.view", "products.manage", "orders.view", "orders.update", "orders.refund", "customers.view", "coupons.manage", "settings.manage", "documents.manage", "pages.manage", "reviews.manage", "users.manage", "audit.view"];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin("dashboard.view");
  await expireStaleOrders().catch(() => 0);
  const db = await getDb();
  const [[pending], [reviews], errors] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(inArray(schema.orders.status, ["confirmed", "processing"])),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.reviews).where(sql`${schema.reviews.status} = 'pending'`),
    can(s.role, "audit.view") ? unresolvedErrorCount(24).catch(() => 0) : 0,
  ]);
  return (
    <AdminShell
      user={{ name: s.name, email: s.email, roleLabel: roleLabels[s.role] }}
      perms={ALL.filter((p) => can(s.role, p))}
      logout={logout}
      badges={{ "/admin/orders": pending?.n ?? 0, "/admin/reviews": reviews?.n ?? 0, "/admin/errors": errors }}
    >
      {children}
    </AdminShell>
  );
}
