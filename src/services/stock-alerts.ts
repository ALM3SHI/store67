import "server-only";
import { and, eq, or, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { env } from "@/config/env";
import { brand } from "@/config/brand";
import { getSettings } from "@/services/settings";
import { sendEmailLogged } from "@/services/notify";
import { renderBackInStock } from "@/services/notify/templates";

export const stockAlertSchema = z.object({
  variantId: z.uuid(),
  email: z.email().max(200),
  locale: z.enum(["ar", "en"]).default("ar"),
});

export type SubscribeResult = "subscribed" | "already" | "in_stock" | "not_found";

export async function subscribeStockAlert(input: z.infer<typeof stockAlertSchema>, db?: DbOrTx): Promise<SubscribeResult> {
  const conn = db ?? (await getDb());
  const [v] = await conn
    .select({ id: schema.productVariants.id, stock: schema.productVariants.stock, track: schema.productVariants.trackInventory, active: schema.productVariants.active })
    .from(schema.productVariants)
    .where(eq(schema.productVariants.id, input.variantId));
  if (!v || !v.active) return "not_found";
  if (!v.track || v.stock > 0) return "in_stock";
  const inserted = await conn
    .insert(schema.stockAlerts)
    .values({ variantId: v.id, email: input.email.trim().toLowerCase(), locale: input.locale })
    .onConflictDoNothing()
    .returning({ id: schema.stockAlerts.id });
  return inserted.length ? "subscribed" : "already";
}

/**
 * Emails everyone waiting for a variant that is now available, then forgets
 * their address. Safe to call often (after stock edits, cancellations, cron).
 */
export async function sendBackInStockAlerts(db?: DbOrTx): Promise<number> {
  const conn = db ?? (await getDb());
  const ready = await conn
    .select({
      alertId: schema.stockAlerts.id,
      email: schema.stockAlerts.email,
      locale: schema.stockAlerts.locale,
      variantNameAr: schema.productVariants.nameAr,
      variantNameEn: schema.productVariants.nameEn,
      productNameAr: schema.products.nameAr,
      productNameEn: schema.products.nameEn,
      slug: schema.products.slug,
      variantCount: sql<number>`(select count(*)::int from ${schema.productVariants} pv where pv.product_id = ${schema.products.id})`,
    })
    .from(schema.stockAlerts)
    .innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.stockAlerts.variantId))
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
    .where(
      and(
        eq(schema.products.status, "published"),
        eq(schema.productVariants.active, true),
        or(eq(schema.productVariants.trackInventory, false), gt(schema.productVariants.stock, 0)),
      ),
    )
    .limit(500);
  if (!ready.length) return 0;
  const { store } = await getSettings(["store"], conn);
  let sent = 0;
  for (const r of ready) {
    // Claim the row first so two runs never email the same person twice.
    const [claimed] = await conn.delete(schema.stockAlerts).where(eq(schema.stockAlerts.id, r.alertId)).returning({ id: schema.stockAlerts.id });
    if (!claimed) continue;
    const L = r.locale === "en" ? "en" : "ar";
    const productName = L === "ar" ? r.productNameAr : r.productNameEn;
    const variant = r.variantCount > 1 ? (L === "ar" ? r.variantNameAr : r.variantNameEn) : "";
    const mail = renderBackInStock({
      locale: L,
      productName,
      variant,
      link: `${env.appUrl}/${L}/products/${r.slug}`,
      storeName: (L === "ar" ? store.nameAr || brand.nameAr : store.nameEn || brand.name),
    });
    const res = await sendEmailLogged("back_in_stock", r.email, mail, conn);
    if (res.ok) sent++;
  }
  return sent;
}

/** Waiting counts per product for the admin list. */
export async function stockAlertCounts(db?: DbOrTx): Promise<Map<string, number>> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select({ productId: schema.productVariants.productId, n: sql<number>`count(*)::int` })
    .from(schema.stockAlerts)
    .innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.stockAlerts.variantId))
    .groupBy(schema.productVariants.productId);
  return new Map(rows.map((r) => [r.productId, r.n]));
}

