/**
 * Pure pricing engine — no I/O. Every total shown to the customer and stored on
 * an order is produced here, on the server, from trusted prices.
 */
export type PricedLine = { variantId: string; unitPriceHalalas: number; quantity: number };

export type CouponRule = {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: number;
  maxDiscountHalalas: number | null;
};

export type TaxRule = { enabled: boolean; rateBps: number; pricesIncludeTax: boolean };

export type Totals = {
  subtotalHalalas: number;
  /** Automatic offers + coupon */
  discountHalalas: number;
  offerDiscountHalalas: number;
  couponDiscountHalalas: number;
  shippingHalalas: number;
  codFeeHalalas: number;
  taxHalalas: number;
  totalHalalas: number;
  freeShippingApplied: boolean;
};

export function computeTotals(args: {
  lines: PricedLine[];
  /** From applyOffers(); the coupon applies to what is left after it */
  offerDiscountHalalas?: number;
  coupon: CouponRule | null;
  shippingRateHalalas: number | null; // null = not yet known
  freeShippingOverHalalas: number | null;
  codFeeHalalas: number;
  tax: TaxRule;
}): Totals {
  const subtotal = args.lines.reduce((s, l) => s + l.unitPriceHalalas * l.quantity, 0);

  const offer = Math.min(Math.max(0, args.offerDiscountHalalas ?? 0), subtotal);
  const base = subtotal - offer;
  let couponDiscount = 0;
  let freeShipping = false;
  if (args.coupon) {
    if (args.coupon.type === "percent") {
      couponDiscount = Math.floor((base * args.coupon.value) / 100);
      if (args.coupon.maxDiscountHalalas !== null) couponDiscount = Math.min(couponDiscount, args.coupon.maxDiscountHalalas);
    } else if (args.coupon.type === "fixed") {
      couponDiscount = Math.min(args.coupon.value, base);
    } else {
      freeShipping = true;
    }
  }
  const discount = offer + couponDiscount;

  const afterDiscount = subtotal - discount;
  if (args.freeShippingOverHalalas !== null && afterDiscount >= args.freeShippingOverHalalas && subtotal > 0) freeShipping = true;
  const shipping = freeShipping ? 0 : (args.shippingRateHalalas ?? 0);
  const codFee = args.codFeeHalalas;

  // In Saudi Arabia VAT applies to shipping and service fees as well as goods.
  const taxable = afterDiscount + shipping + codFee;
  let tax = 0;
  let total = taxable;
  if (args.tax.enabled && args.tax.rateBps > 0) {
    if (args.tax.pricesIncludeTax) {
      tax = Math.round((taxable * args.tax.rateBps) / (10000 + args.tax.rateBps));
    } else {
      tax = Math.round((taxable * args.tax.rateBps) / 10000);
      total = taxable + tax;
    }
  }

  return {
    subtotalHalalas: subtotal,
    discountHalalas: discount,
    offerDiscountHalalas: offer,
    couponDiscountHalalas: couponDiscount,
    shippingHalalas: shipping,
    codFeeHalalas: codFee,
    taxHalalas: tax,
    totalHalalas: total,
    freeShippingApplied: freeShipping && (args.shippingRateHalalas ?? 0) > 0,
  };
}

export type CouponCheckInput = {
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  minSubtotalHalalas: number;
};

export type CouponRejection = "inactive" | "not_started" | "expired" | "exhausted" | "min_subtotal" | "per_customer";

export function checkCoupon(
  c: CouponCheckInput,
  ctx: { subtotalHalalas: number; now: Date; redemptionsByCustomer: number },
): CouponRejection | null {
  if (!c.active) return "inactive";
  if (c.startsAt && ctx.now < c.startsAt) return "not_started";
  if (c.endsAt && ctx.now > c.endsAt) return "expired";
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return "exhausted";
  if (c.perCustomerLimit !== null && ctx.redemptionsByCustomer >= c.perCustomerLimit) return "per_customer";
  if (ctx.subtotalHalalas < c.minSubtotalHalalas) return "min_subtotal";
  return null;
}

/* ───────────── Automatic offers (no code needed) */

export type OfferRule = {
  id: string;
  nameAr: string;
  nameEn: string;
  /** quantity: N+ units of the listed products (or any product) → % off them.
      bundle: every listed product together → % off one of each, per complete set. */
  type: "quantity" | "bundle";
  productIds: string[];
  minQuantity: number;
  percentOff: number;
};
export type OfferLine = { variantId: string; productId: string; unitPriceHalalas: number; quantity: number };
export type AppliedOffer = { id: string; nameAr: string; nameEn: string; amountHalalas: number };

function offerValue(rule: OfferRule, lines: OfferLine[]): { amount: number; used: string[] } {
  const pct = Math.min(90, Math.max(0, rule.percentOff));
  if (rule.type === "quantity") {
    const eligible = lines.filter((l) => !rule.productIds.length || rule.productIds.includes(l.productId));
    const units = eligible.reduce((n, l) => n + l.quantity, 0);
    if (!eligible.length || units < Math.max(1, rule.minQuantity)) return { amount: 0, used: [] };
    const value = eligible.reduce((v, l) => v + l.unitPriceHalalas * l.quantity, 0);
    return { amount: Math.floor((value * pct) / 100), used: eligible.map((l) => l.variantId) };
  }
  const ids = [...new Set(rule.productIds)];
  if (ids.length < 2) return { amount: 0, used: [] };
  const perProduct = ids.map((pid) => lines.filter((l) => l.productId === pid));
  const sets = Math.min(...perProduct.map((ls) => ls.reduce((n, l) => n + l.quantity, 0)));
  if (!(sets >= 1)) return { amount: 0, used: [] };
  // One unit of each product per set; the cheapest units count, so the discount never exceeds what was bought.
  let value = 0;
  for (const ls of perProduct) {
    let need = sets;
    for (const l of [...ls].sort((a, b) => a.unitPriceHalalas - b.unitPriceHalalas)) {
      const take = Math.min(need, l.quantity);
      value += take * l.unitPriceHalalas;
      need -= take;
      if (!need) break;
    }
  }
  return { amount: Math.floor((value * pct) / 100), used: perProduct.flat().map((l) => l.variantId) };
}

/**
 * Picks the offers that save the customer the most. A cart line takes part in
 * one offer at most, so offers never stack on the same item.
 */
export function applyOffers(lines: OfferLine[], rules: OfferRule[]): { discountHalalas: number; applied: AppliedOffer[] } {
  let free = lines.filter((l) => l.quantity > 0);
  const remaining = [...rules];
  const applied: AppliedOffer[] = [];
  for (;;) {
    let best: { rule: OfferRule; amount: number; used: string[] } | null = null;
    for (const r of remaining) {
      const v = offerValue(r, free);
      if (v.amount > 0 && (!best || v.amount > best.amount)) best = { rule: r, ...v };
    }
    if (!best) break;
    applied.push({ id: best.rule.id, nameAr: best.rule.nameAr, nameEn: best.rule.nameEn, amountHalalas: best.amount });
    free = free.filter((l) => !best!.used.includes(l.variantId));
    remaining.splice(remaining.indexOf(best.rule), 1);
  }
  return { discountHalalas: applied.reduce((s, a) => s + a.amountHalalas, 0), applied };
}
