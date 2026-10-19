import "server-only";
import { aramexShipping } from "./aramex";
import { manualShipping } from "./manual";
import type { ShippingQuote } from "./types";
import type { Settings } from "@/services/settings";
import { reportError } from "@/services/monitoring";

export function shippingIntegrationStatus() {
  return { aramex: aramexShipping.isConfigured() };
}

export function getShippingProvider(id: string) {
  if (id === "aramex" && aramexShipping.isConfigured()) return aramexShipping;
  return manualShipping;
}

/**
 * Shipping price used by the cart and stored on the order. When live Aramex
 * rating is enabled but the API fails, the admin flat rate is used instead
 * (flagged as `flat_fallback`) so checkout never breaks.
 */
export async function quoteShipping(args: { city: string | undefined; weightGrams: number; settings: Settings["shipping"] }): Promise<ShippingQuote | null> {
  const { settings } = args;
  if (settings.rateSource === "aramex" && aramexShipping.isConfigured()) {
    if (!args.city) return null; // needs the destination first
    try {
      return await aramexShipping.quote({ city: args.city, weightGrams: args.weightGrams, settings });
    } catch (e) {
      await reportError("shipping", e, { path: "Aramex rate (fell back to flat rate)" });
      const flat = await manualShipping.quote({ city: args.city, weightGrams: args.weightGrams, settings });
      return { ...flat, source: "flat_fallback" };
    }
  }
  return manualShipping.quote({ city: args.city ?? "", weightGrams: args.weightGrams, settings });
}
