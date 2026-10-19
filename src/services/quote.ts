import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { getSettings } from "@/services/settings";
import { computeTotals, checkCoupon, type CouponRejection, type Totals } from "@/services/pricing";
import { quoteShipping } from "@/services/shipping/registry";
import { availablePaymentMethods, type AvailableMethod } from "@/services/payments/registry";
import type { QuoteRequest } from "@/schemas/checkout";

export type QuoteLine = {
  variantId: string;
  productId: string;
  slug: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  variantNameAr: string;
  variantNameEn: string;
  imageUrl: string | null;
  unitPriceHalalas: number;
  compareAtHalalas: number | null;
  requestedQuantity: number;
  quantity: number;
  maxQuantity: number;
  lineTotalHalalas: number;
  weightGrams: number;
  trackInventory: boolean;
  issue: "unavailable" | "insufficient" | "max_qty" | null;
};

export type Quote = {
  lines: QuoteLine[];
  /** Lines that no longer exist / aren't published */
  removedVariantIds: string[];
  coupon: { code: string; applied: boolean; error: CouponRejection | "not_found" | null; couponId: string | null } | null;
  shipping: { amountHalalas: number | null; source: string | null; etaAr: string; etaEn: string; freeOverHalalas: number | null };
  tax: { enabled: boolean; rateBps: number; pricesIncludeTax: boolean };
  totals: Totals;
  paymentMethods: AvailableMethod[];
  codFeeHalalas: number;
  weightGrams: number;
  maxQtyPerItem: number;
};

const DEFAULT_WEIGHT = 300;

export async function buildQuote(req: QuoteRequest & { phone?: string }, opts: { db?: DbOrTx; now?: Date } = {}): Promise<Quote> {
  const conn = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const s = await getSettings(["commerce", "shipping", "payments"], conn);

  // Merge duplicate lines
  const wanted = new Map<string, number>();
  for (const i of req.items) wanted.set(i.variantId, (wanted.get(i.variantId) ?? 0) + i.quantity);
  const ids = [...wanted.keys()];

  const rows = ids.length
    ? await conn
        .select({ v: schema.productVariants, p: schema.products })
        .from(schema.productVariants)
        .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
        .where(and(inArray(schema.productVariants.id, ids), eq(schema.productVariants.active, true), eq(schema.products.status, "published")))
    : [];

  const productIds = [...new Set(rows.map((r) => r.p.id))];
  const media = productIds.length
    ? await conn
        .select({ productId: schema.productMedia.productId, url: schema.productMedia.url, sort: schema.productMedia.sort })
        .from(schema.productMedia)
        .where(and(inArray(schema.productMedia.productId, productIds), eq(schema.productMedia.kind, "image")))
    : [];

  const lines: QuoteLine[] = [];
  const removed: string[] = [];
  for (const id of ids) {
    const r = rows.find((x) => x.v.id === id);
    if (!r) {
      removed.push(id);
      continue;
    }
    const requested = wanted.get(id)!;
    const stockCap = r.v.trackInventory ? r.v.stock : Number.POSITIVE_INFINITY;
    const maxQ = Math.max(0, Math.min(s.commerce.maxQtyPerItem, stockCap));
    const qty = Math.min(requested, maxQ);
    let issue: QuoteLine["issue"] = null;
    if (maxQ === 0) issue = "unavailable";
    else if (requested > stockCap) issue = "insufficient";
    else if (requested > s.commerce.maxQtyPerItem) issue = "max_qty";
    const img = media.filter((m) => m.productId === r.p.id).sort((a, b) => a.sort - b.sort)[0];
    lines.push({
      variantId: id,
      productId: r.p.id,
      slug: r.p.slug,
      sku: r.v.sku,
      nameAr: r.p.nameAr,
      nameEn: r.p.nameEn,
      variantNameAr: r.v.nameAr,
      variantNameEn: r.v.nameEn,
      imageUrl: img?.url ?? null,
      unitPriceHalalas: r.v.priceHalalas,
      compareAtHalalas: r.v.compareAtHalalas,
      requestedQuantity: requested,
      quantity: qty,
      maxQuantity: maxQ,
      lineTotalHalalas: qty * r.v.priceHalalas,
      weightGrams: (r.v.weightGrams ?? DEFAULT_WEIGHT) * qty,
      trackInventory: r.v.trackInventory,
      issue,
    });
  }

  const sellable = lines.filter((l) => l.quantity > 0);
  const subtotal = sellable.reduce((s2, l) => s2 + l.lineTotalHalalas, 0);
  const weight = sellable.reduce((w, l) => w + l.weightGrams, 0);

  // Coupon
  let coupon: Quote["coupon"] = null;
  let couponRule = null;
  if (req.couponCode) {
    const code = req.couponCode.trim().toUpperCase();
    const [c] = await conn.select().from(schema.coupons).where(eq(schema.coupons.code, code)).limit(1);
    if (!c) coupon = { code, applied: false, error: "not_found", couponId: null };
    else {
      let byCustomer = 0;
      if (req.phone && c.perCustomerLimit !== null) {
        const [row] = await conn
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.couponRedemptions)
          .where(and(eq(schema.couponRedemptions.couponId, c.id), eq(schema.couponRedemptions.phone, req.phone)));
        byCustomer = row?.n ?? 0;
      }
      const err = checkCoupon(c, { subtotalHalalas: subtotal, now, redemptionsByCustomer: byCustomer });
      coupon = { code, applied: !err, error: err, couponId: c.id };
      if (!err) couponRule = { code, type: c.type, value: c.value, maxDiscountHalalas: c.maxDiscountHalalas };
    }
  }

  const ship = sellable.length ? await quoteShipping({ city: req.city, weightGrams: weight, settings: s.shipping }) : null;
  const tax = { enabled: s.commerce.taxEnabled, rateBps: s.commerce.taxRateBps, pricesIncludeTax: s.commerce.pricesIncludeTax };

  // COD fee only when COD is the chosen method
  const codFee = req.paymentMethod === "cod" && s.payments.codEnabled ? s.payments.codFeeHalalas : 0;

  const totals = computeTotals({
    lines: sellable.map((l) => ({ variantId: l.variantId, unitPriceHalalas: l.unitPriceHalalas, quantity: l.quantity })),
    coupon: couponRule,
    shippingRateHalalas: ship ? ship.amountHalalas : null,
    freeShippingOverHalalas: s.shipping.freeOverHalalas,
    codFeeHalalas: codFee,
    tax,
  });

  return {
    lines,
    removedVariantIds: removed,
    coupon,
    shipping: {
      amountHalalas: ship ? totals.shippingHalalas : null,
      source: ship?.source ?? null,
      etaAr: ship?.etaAr ?? s.shipping.etaAr,
      etaEn: ship?.etaEn ?? s.shipping.etaEn,
      freeOverHalalas: s.shipping.freeOverHalalas,
    },
    tax,
    totals,
    paymentMethods: availablePaymentMethods(s.payments, totals.totalHalalas),
    codFeeHalalas: s.payments.codEnabled ? s.payments.codFeeHalalas : 0,
    weightGrams: weight,
    maxQtyPerItem: s.commerce.maxQtyPerItem,
  };
}
