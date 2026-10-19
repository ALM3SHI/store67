import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { getSettings } from "@/services/settings";
import { env } from "@/config/env";
import { brand } from "@/config/brand";
import { esc } from "@/services/notify/templates";

/**
 * Tells the team once when a variant reaches its alert level, and re-arms the
 * alert after it is restocked above that level. Safe to call often (after each
 * order and from the scheduler). Returns how many variants were reported.
 */
export async function sendLowStockAlerts(db?: DbOrTx): Promise<number> {
  const conn = db ?? (await getDb());
  // Re-arm restocked variants.
  await conn
    .update(schema.productVariants)
    .set({ lowStockAlertedAt: null })
    .where(and(isNotNull(schema.productVariants.lowStockAlertedAt), gt(schema.productVariants.stock, schema.productVariants.lowStockThreshold)));

  const { notifications, store } = await getSettings(["notifications", "store"], conn);
  if (!notifications.lowStockAlerts) return 0;
  const low = await conn
    .select({ id: schema.productVariants.id, sku: schema.productVariants.sku, stock: schema.productVariants.stock, variant: schema.productVariants.nameAr, name: schema.products.nameAr })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
    .where(
      and(
        eq(schema.productVariants.trackInventory, true),
        eq(schema.productVariants.active, true),
        isNull(schema.productVariants.lowStockAlertedAt),
        lte(schema.productVariants.stock, schema.productVariants.lowStockThreshold),
        sql`${schema.products.status} = 'published'`,
      ),
    );
  if (!low.length) return 0;

  // Claim before sending so two concurrent calls can't both report the same variants.
  const claimed = await conn
    .update(schema.productVariants)
    .set({ lowStockAlertedAt: new Date() })
    .where(and(inArray(schema.productVariants.id, low.map((v) => v.id)), isNull(schema.productVariants.lowStockAlertedAt)))
    .returning({ id: schema.productVariants.id });
  const rows = low.filter((v) => claimed.some((c) => c.id === v.id));
  if (!rows.length) return 0;

  const storeName = store.nameAr || brand.nameAr;
  const text = [
    `📦 مخزون منخفض — ${storeName}`,
    ...rows.map((v) => `• ${v.name}${v.variant ? ` (${v.variant})` : ""} — ${v.stock === 0 ? "نفد" : `بقي ${v.stock}`} — ${v.sku}`),
    `${env.appUrl}/admin/products`,
  ].join("\n");
  const { sendAdminAlert } = await import("@/services/notify");
  await sendAdminAlert("low_stock", {
    subject: `مخزون منخفض: ${rows.length} ${rows.length === 1 ? "منتج" : "منتجات"} — ${storeName}`,
    text,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">${esc(text).replace(/\n/g, "<br>")}</div>`,
  }, conn);
  return rows.length;
}
