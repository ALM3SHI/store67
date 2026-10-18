import type { Settings } from "@/services/settings";

export type ShippingQuote = {
  amountHalalas: number;
  source: "flat" | "aramex" | "flat_fallback";
  etaAr?: string;
  etaEn?: string;
};

export type ShipmentParty = {
  name: string;
  phone: string;
  email?: string | null;
  city: string;
  line1: string;
  line2?: string;
  postalCode?: string;
};

export type CreateShipmentArgs = {
  reference: string;
  shipper: ShipmentParty;
  consignee: ShipmentParty;
  weightGrams: number;
  pieces: number;
  description: string;
  codAmountHalalas: number | null;
};

export type TrackingEvent = { at: string; description: string; location?: string; code?: string };
export type TrackingResult = {
  status: "created" | "in_transit" | "out_for_delivery" | "delivered" | "returned";
  events: TrackingEvent[];
};

/** Carrier adapter. Add a new carrier (SMSA, SPL, J&T…) by implementing this. */
export interface ShippingProvider {
  readonly id: "aramex" | "manual";
  isConfigured(): boolean;
  quote(args: { city: string; weightGrams: number; settings: Settings["shipping"] }): Promise<ShippingQuote>;
  createShipment?(args: CreateShipmentArgs): Promise<{ trackingNumber: string; labelUrl: string | null }>;
  track?(trackingNumber: string): Promise<TrackingResult>;
}
