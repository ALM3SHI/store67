"use server";
import { headers } from "next/headers";
import { findOrderByNumberAndPhone, getOrderDetails } from "@/services/orders";
import { rateLimit } from "@/services/rate-limit";
import { normalizeSaudiMobile } from "@/lib/phone";

export type TrackResult =
  | { ok: false; error: "not_found" | "rate_limited" | "invalid" }
  | {
      ok: true;
      order: {
        number: string;
        status: string;
        paymentStatus: string;
        createdAt: string;
        items: { nameAr: string; nameEn: string; quantity: number }[];
        shipment: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; events: { at: string; description: string; location?: string }[] } | null;
        timeline: { message: string; at: string }[];
      };
    };

/** Public tracking: requires order number AND the checkout phone; rate-limited per IP. */
export async function trackOrder(_: TrackResult | null, formData: FormData): Promise<TrackResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await rateLimit(`track:${ip}`, 10, 600);
  if (!rl.allowed) return { ok: false, error: "rate_limited" };
  const number = String(formData.get("number") ?? "").trim().toUpperCase().slice(0, 20);
  const phone = normalizeSaudiMobile(String(formData.get("phone") ?? ""));
  if (!number || !phone) return { ok: false, error: "invalid" };
  const order = await findOrderByNumberAndPhone(number, phone);
  if (!order) return { ok: false, error: "not_found" };
  const d = await getOrderDetails(order.id, { includeInternal: false });
  const s = d.shipments[0];
  return {
    ok: true,
    order: {
      number: order.number,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt.toISOString(),
      items: d.items.map((i) => ({ nameAr: i.nameAr, nameEn: i.nameEn, quantity: i.quantity })),
      shipment: s ? { carrier: s.carrierName, trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl, events: s.events } : null,
      timeline: d.events.map((e) => ({ message: e.message, at: e.createdAt.toISOString() })),
    },
  };
}
