"use client";

type Params = Record<string, unknown>;
type W = Window & {
  gtag?: (...a: unknown[]) => void;
  fbq?: (...a: unknown[]) => void;
  ttq?: { track: (e: string, p?: Params) => void };
};

const META: Record<string, string> = { add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase", view_item: "ViewContent" };
const TIKTOK: Record<string, string> = { add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "CompletePayment", view_item: "ViewContent" };

/**
 * Sends an e-commerce event to whichever analytics tools were loaded.
 * Tools are only loaded after the visitor consents, so before consent this is a no-op.
 */
export function track(event: "add_to_cart" | "begin_checkout" | "purchase" | "view_item", params: Params) {
  if (typeof window === "undefined") return;
  const w = window as W;
  try {
    w.gtag?.("event", event, params);
    if (w.fbq && META[event]) w.fbq("track", META[event], { value: params.value, currency: params.currency });
    if (w.ttq && TIKTOK[event]) w.ttq.track(TIKTOK[event], { value: params.value, currency: params.currency });
  } catch {
    /* analytics must never break the store */
  }
}
