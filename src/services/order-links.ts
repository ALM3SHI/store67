import "server-only";
import { env, serverSecret } from "@/config/env";
import { hmacSha256 } from "@/lib/crypto";

/**
 * Guest access token for an order. Deterministic for (order, idempotency key)
 * so a retried checkout request gets the same link; only its hash is stored.
 * Because it can be re-derived on the server, emails can carry the same link.
 */
export function accessTokenFor(orderId: string, idempotencyKey: string) {
  return Buffer.from(hmacSha256(serverSecret(), `order-access:${orderId}:${idempotencyKey}`), "hex").toString("base64url");
}

export function orderUrl(locale: string, number: string, token: string) {
  return `${env.appUrl}/${locale}/orders/${encodeURIComponent(number)}?t=${encodeURIComponent(token)}`;
}

/** Link the customer can open from an email; falls back to the tracking page. */
export function customerOrderLink(o: { id: string; number: string; locale: string; idempotencyKey: string | null }) {
  const locale = o.locale === "en" ? "en" : "ar";
  if (!o.idempotencyKey) return `${env.appUrl}/${locale}/track`;
  return orderUrl(locale, o.number, accessTokenFor(o.id, o.idempotencyKey));
}
