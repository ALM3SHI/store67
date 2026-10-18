import type { ShippingProvider } from "./types";

/** Admin-managed shipping: flat rate from settings, tracking entered by hand. */
export const manualShipping: ShippingProvider = {
  id: "manual",
  isConfigured: () => true,
  async quote({ settings }) {
    return { amountHalalas: settings.flatRateHalalas, source: "flat", etaAr: settings.etaAr, etaEn: settings.etaEn };
  },
};
