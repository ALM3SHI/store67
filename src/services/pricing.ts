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
  discountHalalas: number;
  shippingHalalas: number;
  codFeeHalalas: number;
  taxHalalas: number;
  totalHalalas: number;
  freeShippingApplied: boolean;
};

export function computeTotals(args: {
  lines: PricedLine[];
  coupon: CouponRule | null;
  shippingRateHalalas: number | null; // null = not yet known
  freeShippingOverHalalas: number | null;
  codFeeHalalas: number;
  tax: TaxRule;
}): Totals {
  const subtotal = args.lines.reduce((s, l) => s + l.unitPriceHalalas * l.quantity, 0);

  let discount = 0;
  let freeShipping = false;
  if (args.coupon) {
    if (args.coupon.type === "percent") {
      discount = Math.floor((subtotal * args.coupon.value) / 100);
      if (args.coupon.maxDiscountHalalas !== null) discount = Math.min(discount, args.coupon.maxDiscountHalalas);
    } else if (args.coupon.type === "fixed") {
      discount = Math.min(args.coupon.value, subtotal);
    } else {
      freeShipping = true;
    }
  }

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
