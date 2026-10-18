import "server-only";
import { env } from "@/config/env";
import type { CreateShipmentArgs, ShippingProvider, TrackingResult } from "./types";

/**
 * Aramex JSON web services (ShippingAPI.V2): Rate Calculator, Shipping and
 * Tracking. Credentials come from ARAMEX_* environment variables. Set
 * ARAMEX_BASE_URL to the sandbox host provided with your test account.
 *
 * Nothing here pretends to work without credentials: isConfigured() is false
 * and the store falls back to the admin-managed flat rate + manual tracking.
 */
function clientInfo() {
  const a = env.aramex;
  return {
    UserName: a.username,
    Password: a.password,
    Version: a.version,
    AccountNumber: a.accountNumber,
    AccountPin: a.accountPin,
    AccountEntity: a.accountEntity,
    AccountCountryCode: a.accountCountryCode,
    Source: a.source,
  };
}

type Notification = { Code: string; Message: string };
type Envelope = { HasErrors: boolean; Notifications?: Notification[] | null };

export class AramexError extends Error {
  constructor(
    message: string,
    readonly notifications: Notification[] = [],
  ) {
    super(message);
    this.name = "AramexError";
  }
}

async function post<T extends Envelope>(service: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.aramex.baseUrl}/${service}/Service_1_0.svc/json/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ClientInfo: clientInfo(), Transaction: { Reference1: "", Reference2: "", Reference3: "", Reference4: "", Reference5: "" }, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new AramexError(`Aramex ${method} HTTP ${res.status}`);
  const json = (await res.json()) as T;
  if (json.HasErrors) {
    const n = json.Notifications ?? [];
    throw new AramexError(`Aramex ${method}: ${n.map((x) => `${x.Code} ${x.Message}`).join("; ") || "unknown error"}`, n);
  }
  return json;
}

const kg = (grams: number) => Math.max(0.5, Math.round((grams / 1000) * 100) / 100);

function party(p: CreateShipmentArgs["shipper"], account?: string) {
  return {
    Reference1: "",
    AccountNumber: account ?? "",
    PartyAddress: {
      Line1: p.line1,
      Line2: p.line2 ?? "",
      Line3: "",
      City: p.city,
      PostCode: p.postalCode ?? "",
      CountryCode: "SA",
    },
    Contact: {
      PersonName: p.name,
      CompanyName: p.name,
      PhoneNumber1: p.phone,
      CellPhone: p.phone,
      EmailAddress: p.email ?? "",
    },
  };
}

export const aramexShipping: ShippingProvider = {
  id: "aramex",
  isConfigured: () => {
    const a = env.aramex;
    return Boolean(a.username && a.password && a.accountNumber && a.accountPin && a.accountEntity);
  },

  async quote({ city, weightGrams, settings }) {
    type RateRes = Envelope & { TotalAmount?: { CurrencyCode: string; Value: number } };
    const res = await post<RateRes>("RateCalculator", "CalculateRate", {
      OriginAddress: { City: settings.originCity, CountryCode: "SA", Line1: settings.originLine1 || settings.originCity },
      DestinationAddress: { City: city, CountryCode: "SA", Line1: city },
      ShipmentDetails: {
        PaymentType: "P",
        ProductGroup: "DOM",
        ProductType: "ONP",
        ActualWeight: { Unit: "KG", Value: kg(weightGrams) },
        ChargeableWeight: { Unit: "KG", Value: kg(weightGrams) },
        NumberOfPieces: 1,
      },
      PreferredCurrencyCode: "SAR",
    });
    const total = res.TotalAmount;
    if (!total || total.CurrencyCode !== "SAR") throw new AramexError("Aramex rate missing or not in SAR");
    return { amountHalalas: Math.round(total.Value * 100), source: "aramex", etaAr: settings.etaAr, etaEn: settings.etaEn };
  },

  async createShipment(args) {
    type ShipRes = Envelope & {
      Shipments?: { ID: string; HasErrors: boolean; Notifications?: Notification[]; ShipmentLabel?: { LabelURL?: string | null } | null }[];
    };
    const now = Date.now();
    const res = await post<ShipRes>("Shipping", "CreateShipments", {
      LabelInfo: { ReportID: 9201, ReportType: "URL" },
      Shipments: [
        {
          Reference1: args.reference,
          Shipper: party(args.shipper, env.aramex.accountNumber),
          Consignee: party(args.consignee),
          ShippingDateTime: `/Date(${now})/`,
          DueDate: `/Date(${now + 3 * 86400000})/`,
          Details: {
            ActualWeight: { Unit: "KG", Value: kg(args.weightGrams) },
            ChargeableWeight: { Unit: "KG", Value: kg(args.weightGrams) },
            NumberOfPieces: args.pieces,
            ProductGroup: "DOM",
            ProductType: "ONP",
            PaymentType: "P",
            DescriptionOfGoods: args.description.slice(0, 100),
            GoodsOriginCountry: "SA",
            Services: args.codAmountHalalas ? "CODS" : "",
            CashOnDeliveryAmount: args.codAmountHalalas ? { CurrencyCode: "SAR", Value: args.codAmountHalalas / 100 } : null,
          },
        },
      ],
    });
    const s = res.Shipments?.[0];
    if (!s || s.HasErrors || !s.ID) {
      throw new AramexError("Aramex did not return a shipment", s?.Notifications ?? []);
    }
    return { trackingNumber: s.ID, labelUrl: s.ShipmentLabel?.LabelURL ?? null };
  },

  async track(trackingNumber): Promise<TrackingResult> {
    type TrackRes = Envelope & {
      TrackingResults?: { Key: string; Value: { UpdateCode: string; UpdateDescription: string; UpdateDateTime: string; UpdateLocation: string }[] }[];
    };
    const res = await post<TrackRes>("Tracking", "TrackShipments", { Shipments: [trackingNumber], GetLastTrackingUpdateOnly: false });
    const updates = res.TrackingResults?.find((r) => r.Key === trackingNumber)?.Value ?? [];
    const events = updates.map((u) => ({
      at: parseAramexDate(u.UpdateDateTime),
      description: u.UpdateDescription,
      location: u.UpdateLocation,
      code: u.UpdateCode,
    }));
    return { status: inferStatus(updates.map((u) => u.UpdateCode)), events };
  },
};

export function parseAramexDate(v: string): string {
  const m = /\/Date\((\d+)([+-]\d{4})?\)\//.exec(v);
  return m ? new Date(Number(m[1])).toISOString() : v;
}

/** Aramex update codes: SH005/SH006 delivered, SH003 out for delivery, SH069 returned */
export function inferStatus(codes: string[]): TrackingResult["status"] {
  if (codes.some((c) => c === "SH005" || c === "SH006" || c === "SH007")) return "delivered";
  if (codes.some((c) => c === "SH069" || c === "SH070")) return "returned";
  if (codes.some((c) => c === "SH003")) return "out_for_delivery";
  if (codes.length > 0) return "in_transit";
  return "created";
}
