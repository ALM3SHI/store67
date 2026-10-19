import { afterEach, describe, expect, it, vi } from "vitest";
import { inferStatus, parseAramexDate } from "@/services/shipping/aramex";
import { can } from "@/lib/auth/permissions";
import { sniffMime, validateUpload } from "@/services/storage";
import { hashPassword, verifyPassword, safeEqual } from "@/lib/crypto";
import { toState } from "@/services/payments/moyasar";

describe("Aramex helpers", () => {
  it("parses WCF dates", () => {
    expect(parseAramexDate("/Date(1760000000000+0300)/")).toBe(new Date(1760000000000).toISOString());
  });
  it("infers shipment status from update codes", () => {
    expect(inferStatus([])).toBe("created");
    expect(inferStatus(["SH014"])).toBe("in_transit");
    expect(inferStatus(["SH014", "SH003"])).toBe("out_for_delivery");
    expect(inferStatus(["SH003", "SH005"])).toBe("delivered");
  });
});

describe("Aramex without credentials", () => {
  afterEach(() => vi.resetModules());
  it("reports not configured and the store falls back to the flat rate", async () => {
    const { aramexShipping } = await import("@/services/shipping/aramex");
    const { quoteShipping } = await import("@/services/shipping/registry");
    expect(aramexShipping.isConfigured()).toBe(false);
    const settings = { rateSource: "aramex", flatRateHalalas: 2500, freeOverHalalas: null, etaAr: "", etaEn: "", carrierName: "", trackingUrlTemplate: "", originCity: "Makkah", originLine1: "", originContactName: "", originPhone: "", cities: [] } as const;
    const q = await quoteShipping({ city: "Riyadh", weightGrams: 200, settings: { ...settings, cities: [], cityRates: [] } });
    expect(q).toMatchObject({ amountHalalas: 2500, source: "flat" });
  });

  it("manual shipping uses a per-city price and delivery time when one is set", async () => {
    const { quoteShipping } = await import("@/services/shipping/registry");
    const base = { rateSource: "flat", flatRateHalalas: 2500, freeOverHalalas: null, etaAr: "٣–٥ أيام", etaEn: "3–5 days", carrierName: "", trackingUrlTemplate: "", originCity: "Makkah", originLine1: "", originContactName: "", originPhone: "", cities: [] } as const;
    const cityRates = [{ city: "Makkah", rateHalalas: 1500, etaAr: "يوم واحد", etaEn: "1 day" }];
    expect(await quoteShipping({ city: "Makkah", weightGrams: 200, settings: { ...base, cities: [], cityRates } })).toMatchObject({ amountHalalas: 1500, source: "city", etaAr: "يوم واحد" });
    expect(await quoteShipping({ city: "Riyadh", weightGrams: 200, settings: { ...base, cities: [], cityRates } })).toMatchObject({ amountHalalas: 2500, source: "flat", etaAr: "٣–٥ أيام" });
  });

  it("sends a CalculateRate request with ClientInfo when configured", async () => {
    Object.assign(process.env, { ARAMEX_USERNAME: "u", ARAMEX_PASSWORD: "p", ARAMEX_ACCOUNT_NUMBER: "1", ARAMEX_ACCOUNT_PIN: "2", ARAMEX_ACCOUNT_ENTITY: "RUH" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ HasErrors: false, TotalAmount: { CurrencyCode: "SAR", Value: 31.5 } }), { status: 200 }));
    const { aramexShipping } = await import("@/services/shipping/aramex");
    const q = await aramexShipping.quote({ city: "Riyadh", weightGrams: 400, settings: { rateSource: "aramex", flatRateHalalas: 2500, freeOverHalalas: null, etaAr: "", etaEn: "", carrierName: "", trackingUrlTemplate: "", originCity: "Makkah", originLine1: "", originContactName: "", originPhone: "", cities: [], cityRates: [] } });
    expect(q.amountHalalas).toBe(3150);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/RateCalculator/Service_1_0.svc/json/CalculateRate");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.ClientInfo).toMatchObject({ UserName: "u", AccountNumber: "1", AccountEntity: "RUH", AccountCountryCode: "SA" });
    expect(body.DestinationAddress.City).toBe("Riyadh");
    fetchMock.mockRestore();
    for (const k of ["ARAMEX_USERNAME", "ARAMEX_PASSWORD", "ARAMEX_ACCOUNT_NUMBER", "ARAMEX_ACCOUNT_PIN", "ARAMEX_ACCOUNT_ENTITY"]) delete process.env[k];
  });
});

describe("Moyasar mapping", () => {
  it("maps payment status and method", () => {
    expect(toState({ id: "p", status: "paid", amount: 100, currency: "SAR", source: { type: "creditcard", company: "mada" } })).toMatchObject({ status: "paid", method: "mada" });
    expect(toState({ id: "p", status: "paid", amount: 100, refunded: 40, currency: "SAR" }).status).toBe("partially_refunded");
    expect(toState({ id: "p", status: "failed", amount: 100, currency: "SAR", source: { type: "applepay", message: "DECLINED" } })).toMatchObject({ status: "failed", method: "applepay", failureReason: "DECLINED" });
  });
});

describe("roles", () => {
  it("support staff cannot refund, change settings or see the audit log", () => {
    expect(can("support", "orders.view")).toBe(true);
    expect(can("support", "orders.refund")).toBe(false);
    expect(can("support", "settings.manage")).toBe(false);
    expect(can("support", "products.manage")).toBe(false);
    expect(can("manager", "orders.refund")).toBe(true);
    expect(can("manager", "users.manage")).toBe(false);
    expect(can("owner", "documents.manage")).toBe(true);
  });
});

describe("uploads", () => {
  it("sniffs real file types and rejects disguised files", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(() => validateUpload(new TextEncoder().encode("<script>alert(1)</script>"), "image", 1000)).toThrow();
    expect(() => validateUpload(new TextEncoder().encode("%PDF-1.7"), "image", 1000)).toThrow(); // PDF is not an image
    expect(() => validateUpload(new Uint8Array(2000), "document", 1000)).toThrow();
    const glb = new Uint8Array(20);
    glb.set(new TextEncoder().encode("glTF"), 0);
    expect(validateUpload(glb, "model", 1000).ext).toBe("glb");
    expect(() => validateUpload(new TextEncoder().encode("%PDF-1.7 fake model"), "model", 1000)).toThrow();
  });
});

describe("passwords", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
