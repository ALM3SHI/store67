import type { ShippingProvider } from "./types";

/**
 * Admin-managed shipping: a per-city price when one is set for the
 * destination, otherwise the flat rate. Tracking is entered by hand.
 */
export const manualShipping: ShippingProvider = {
  id: "manual",
  isConfigured: () => true,
  async quote({ city, settings }) {
    const special = city ? settings.cityRates.find((r) => r.city === city) : undefined;
    if (special) {
      return {
        amountHalalas: special.rateHalalas,
        source: "city",
        etaAr: special.etaAr || settings.etaAr,
        etaEn: special.etaEn || settings.etaEn,
      };
    }
    return { amountHalalas: settings.flatRateHalalas, source: "flat", etaAr: settings.etaAr, etaEn: settings.etaEn };
  },
};
