import "server-only";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import type { OfferRule } from "@/services/pricing";

export type Promotion = typeof schema.promotions.$inferSelect;

export const toRule = (p: Promotion): OfferRule => ({
  id: p.id,
  nameAr: p.nameAr,
  nameEn: p.nameEn,
  type: p.type === "bundle" ? "bundle" : "quantity",
  productIds: p.productIds,
  minQuantity: p.minQuantity,
  percentOff: p.percentOff,
});

/** Offers that are switched on and inside their dates right now. */
export async function activePromotions(db?: DbOrTx, now = new Date()): Promise<Promotion[]> {
  const conn = db ?? (await getDb());
  return conn
    .select()
    .from(schema.promotions)
    .where(
      and(
        eq(schema.promotions.active, true),
        or(isNull(schema.promotions.startsAt), lte(schema.promotions.startsAt, now)),
        or(isNull(schema.promotions.endsAt), gt(schema.promotions.endsAt, now)),
      ),
    )
    .orderBy(desc(schema.promotions.percentOff));
}

/** Active offers that involve a product (for the product page). */
export async function promotionsForProduct(productId: string, db?: DbOrTx, now = new Date()) {
  return (await activePromotions(db, now)).filter((p) => (p.type === "quantity" && !p.productIds.length) || p.productIds.includes(productId));
}
