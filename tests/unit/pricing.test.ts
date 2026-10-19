import { describe, expect, it } from "vitest";
import { computeTotals, applyOffers, checkCoupon } from "@/services/pricing";
import { parseSARToHalalas, formatSAR } from "@/lib/money";
import { normalizeSaudiMobile } from "@/lib/phone";

const noTax = { enabled: false, rateBps: 1500, pricesIncludeTax: true };
const line = (price: number, qty: number) => ({ variantId: "v", unitPriceHalalas: price, quantity: qty });

describe("computeTotals", () => {
  it("sums lines and adds shipping", () => {
    const t = computeTotals({ lines: [line(14900, 2)], coupon: null, shippingRateHalalas: 2500, freeShippingOverHalalas: null, codFeeHalalas: 0, tax: noTax });
    expect(t).toMatchObject({ subtotalHalalas: 29800, shippingHalalas: 2500, totalHalalas: 32300, taxHalalas: 0 });
  });
  it("applies percent coupons with a cap", () => {
    const t = computeTotals({
      lines: [line(10000, 3)],
      coupon: { code: "X", type: "percent", value: 50, maxDiscountHalalas: 5000 },
      shippingRateHalalas: 0,
      freeShippingOverHalalas: null,
      codFeeHalalas: 0,
      tax: noTax,
    });
    expect(t.discountHalalas).toBe(5000);
    expect(t.totalHalalas).toBe(25000);
  });
  it("never discounts below zero", () => {
    const t = computeTotals({ lines: [line(1000, 1)], coupon: { code: "X", type: "fixed", value: 99999, maxDiscountHalalas: null }, shippingRateHalalas: 500, freeShippingOverHalalas: null, codFeeHalalas: 0, tax: noTax });
    expect(t.discountHalalas).toBe(1000);
    expect(t.totalHalalas).toBe(500);
  });
  it("gives free shipping over the threshold and with free-shipping coupons", () => {
    const a = computeTotals({ lines: [line(20000, 1)], coupon: null, shippingRateHalalas: 2500, freeShippingOverHalalas: 20000, codFeeHalalas: 0, tax: noTax });
    expect(a.shippingHalalas).toBe(0);
    const b = computeTotals({ lines: [line(100, 1)], coupon: { code: "F", type: "free_shipping", value: 0, maxDiscountHalalas: null }, shippingRateHalalas: 2500, freeShippingOverHalalas: null, codFeeHalalas: 0, tax: noTax });
    expect(b.shippingHalalas).toBe(0);
  });
  it("extracts VAT from inclusive prices (15%)", () => {
    const t = computeTotals({ lines: [line(11500, 1)], coupon: null, shippingRateHalalas: 0, freeShippingOverHalalas: null, codFeeHalalas: 0, tax: { enabled: true, rateBps: 1500, pricesIncludeTax: true } });
    expect(t.taxHalalas).toBe(1500);
    expect(t.totalHalalas).toBe(11500);
  });
  it("adds VAT on top of exclusive prices including shipping and COD fee", () => {
    const t = computeTotals({ lines: [line(10000, 1)], coupon: null, shippingRateHalalas: 2000, freeShippingOverHalalas: null, codFeeHalalas: 1000, tax: { enabled: true, rateBps: 1500, pricesIncludeTax: false } });
    expect(t.taxHalalas).toBe(1950);
    expect(t.totalHalalas).toBe(14950);
  });
});

describe("checkCoupon", () => {
  const base = { active: true, startsAt: null, endsAt: null, usageLimit: null, usedCount: 0, perCustomerLimit: null, minSubtotalHalalas: 0 };
  const now = new Date("2026-10-01T00:00:00Z");
  it("accepts a valid coupon", () => expect(checkCoupon(base, { subtotalHalalas: 100, now, redemptionsByCustomer: 0 })).toBeNull());
  it("rejects inactive, expired, exhausted, min subtotal and per-customer", () => {
    expect(checkCoupon({ ...base, active: false }, { subtotalHalalas: 100, now, redemptionsByCustomer: 0 })).toBe("inactive");
    expect(checkCoupon({ ...base, endsAt: new Date("2026-09-01") }, { subtotalHalalas: 100, now, redemptionsByCustomer: 0 })).toBe("expired");
    expect(checkCoupon({ ...base, startsAt: new Date("2026-11-01") }, { subtotalHalalas: 100, now, redemptionsByCustomer: 0 })).toBe("not_started");
    expect(checkCoupon({ ...base, usageLimit: 3, usedCount: 3 }, { subtotalHalalas: 100, now, redemptionsByCustomer: 0 })).toBe("exhausted");
    expect(checkCoupon({ ...base, minSubtotalHalalas: 500 }, { subtotalHalalas: 100, now, redemptionsByCustomer: 0 })).toBe("min_subtotal");
    expect(checkCoupon({ ...base, perCustomerLimit: 1 }, { subtotalHalalas: 100, now, redemptionsByCustomer: 1 })).toBe("per_customer");
  });
});

describe("money & phone helpers", () => {
  it("parses SAR input", () => {
    expect(parseSARToHalalas("149")).toBe(14900);
    expect(parseSARToHalalas("149.5")).toBe(14950);
    expect(parseSARToHalalas("١٤٩")).toBe(14900);
    expect(parseSARToHalalas("abc")).toBeNull();
    expect(parseSARToHalalas("1.234")).toBeNull();
  });
  it("formats SAR", () => {
    expect(formatSAR(14900, "ar")).toBe("149 ر.س");
    expect(formatSAR(14950, "en")).toBe("SAR 149.50");
  });
  it("normalises Saudi mobiles", () => {
    expect(normalizeSaudiMobile("0512345678")).toBe("+966512345678");
    expect(normalizeSaudiMobile("+966 51 234 5678")).toBe("+966512345678");
    expect(normalizeSaudiMobile("٠٥١٢٣٤٥٦٧٨")).toBe("+966512345678");
    expect(normalizeSaudiMobile("0112345678")).toBeNull();
    expect(normalizeSaudiMobile("05123")).toBeNull();
  });
});

describe("automatic offers", () => {
  const A = { variantId: "va", productId: "pa", unitPriceHalalas: 10000, quantity: 1 };
  const B = { variantId: "vb", productId: "pb", unitPriceHalalas: 5000, quantity: 1 };
  const qty = { id: "q", nameAr: "كمية", nameEn: "Qty", type: "quantity" as const, productIds: [], minQuantity: 2, percentOff: 10 };
  const bundle = { id: "b", nameAr: "باقة", nameEn: "Bundle", type: "bundle" as const, productIds: ["pa", "pb"], minQuantity: 1, percentOff: 20 };

  it("quantity offer needs the minimum units", () => {
    expect(applyOffers([A], [qty]).discountHalalas).toBe(0);
    expect(applyOffers([{ ...A, quantity: 2 }], [qty])).toEqual({ discountHalalas: 2000, applied: [{ id: "q", nameAr: "كمية", nameEn: "Qty", amountHalalas: 2000 }] });
    expect(applyOffers([A, B], [{ ...qty, productIds: ["pb"] }]).discountHalalas).toBe(0); // only B counts
  });

  it("bundle discounts one of each per complete set, cheapest units first", () => {
    expect(applyOffers([A], [bundle]).discountHalalas).toBe(0);
    expect(applyOffers([A, B], [bundle]).discountHalalas).toBe(3000);
    expect(applyOffers([{ ...A, quantity: 3 }, B], [bundle]).discountHalalas).toBe(3000); // one set only
  });

  it("a line takes the better offer and offers never stack on it", () => {
    const r = applyOffers([A, B], [qty, bundle]);
    expect(r.applied.map((a) => a.id)).toEqual(["b"]);
    expect(r.discountHalalas).toBe(3000);
  });

  it("coupon applies after offers, and the total never goes negative", () => {
    const t = computeTotals({
      lines: [{ variantId: "va", unitPriceHalalas: 10000, quantity: 1 }],
      offerDiscountHalalas: 2000,
      coupon: { code: "X", type: "percent", value: 10, maxDiscountHalalas: null },
      shippingRateHalalas: 0,
      freeShippingOverHalalas: null,
      codFeeHalalas: 0,
      tax: { enabled: false, rateBps: 0, pricesIncludeTax: true },
    });
    expect([t.offerDiscountHalalas, t.couponDiscountHalalas, t.discountHalalas, t.totalHalalas]).toEqual([2000, 800, 2800, 7200]);
    const big = computeTotals({ lines: [{ variantId: "va", unitPriceHalalas: 1000, quantity: 1 }], offerDiscountHalalas: 5000, coupon: { code: "F", type: "fixed", value: 500, maxDiscountHalalas: null }, shippingRateHalalas: 0, freeShippingOverHalalas: null, codFeeHalalas: 0, tax: { enabled: false, rateBps: 0, pricesIncludeTax: true } });
    expect(big.totalHalalas).toBe(0);
  });
});
