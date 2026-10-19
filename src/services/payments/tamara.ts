import "server-only";
import { env } from "@/config/env";
import { PaymentProviderError, PaymentRejectedError, type PaymentProvider, type ProviderPaymentState } from "./types";

/**
 * Tamara — pay in instalments (https://docs.tamara.co).
 * Flow: POST /checkout → redirect to checkout_url → on approval (redirect or
 * webhook) we call POST /orders/{id}/authorise → the order counts as paid.
 * Capture (POST /payments/capture) needs shipping info, so it runs when the
 * order ships; Tamara also auto-captures authorised orders after 21 days.
 * Refunds (POST /payments/simplified-refund/{id}) work on captured orders.
 */
const amt = (h: number) => ({ amount: Number((h / 100).toFixed(2)), currency: "SAR" });

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.tamara.apiToken) throw new PaymentProviderError("Tamara API token missing");
  const res = await fetch(`${env.tamara.apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.tamara.apiToken}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const b = body as { message?: string; errors?: { error_code?: string }[] } | null;
    const msg = `Tamara ${path} failed: HTTP ${res.status} ${b?.message ?? ""} ${b?.errors?.map((e) => e.error_code).join(",") ?? ""}`.trim();
    // A refused consumer/order at checkout creation means "not eligible" — offer another method.
    if (path === "/checkout" && (res.status === 400 || res.status === 422)) throw new PaymentRejectedError(msg);
    throw new PaymentProviderError(msg);
  }
  return body as T;
}

export type TamaraOrder = {
  order_id: string;
  order_reference_id?: string;
  status: string; // new | approved | authorised | partially_captured | fully_captured | declined | expired | canceled | partially_refunded | fully_refunded …
  total_amount?: { amount: number; currency: string };
  refunded_amount?: { amount: number; currency: string };
};

export function tamaraToState(o: TamaraOrder): ProviderPaymentState {
  const total = Math.round((o.total_amount?.amount ?? 0) * 100);
  const refunded = Math.round((o.refunded_amount?.amount ?? 0) * 100);
  const base = { amountHalalas: total, currency: o.total_amount?.currency ?? "SAR", providerPaymentId: o.order_id, method: "tamara" };
  const s = o.status.toLowerCase();
  if (s === "fully_refunded" || (refunded > 0 && refunded >= total)) return { ...base, status: "refunded", refundedHalalas: refunded };
  if (s === "partially_refunded" || refunded > 0) return { ...base, status: "partially_refunded", refundedHalalas: refunded };
  if (["authorised", "partially_captured", "fully_captured", "captured"].includes(s)) return { ...base, status: "paid" };
  if (s === "declined") return { ...base, status: "failed", failureReason: "tamara_declined" };
  if (s === "expired" || s === "canceled" || s === "cancelled") return { ...base, status: "cancelled" };
  // "approved" still needs our authorise call; "new" is waiting for the customer.
  return { ...base, status: "pending" };
}

/** Approved orders must be authorised by the merchant before they count as paid. */
async function authoriseIfApproved(orderId: string): Promise<TamaraOrder> {
  const o = await call<TamaraOrder>(`/orders/${encodeURIComponent(orderId)}`);
  if (o.status.toLowerCase() !== "approved") return o;
  await call(`/orders/${encodeURIComponent(orderId)}/authorise`, { method: "POST" });
  return call<TamaraOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export const tamaraProvider: PaymentProvider = {
  id: "tamara",
  label: "Tamara",
  isConfigured: () => Boolean(env.tamara.apiToken),

  async createSession(a) {
    if (!a.order) throw new PaymentProviderError("Tamara needs order details");
    const o = a.order;
    const [first, ...rest] = o.buyer.name.trim().split(/\s+/);
    const last = rest.join(" ") || first || "-";
    const res = await call<{ order_id: string; checkout_id: string; checkout_url: string; status: string }>("/checkout", {
      method: "POST",
      body: JSON.stringify({
        order_reference_id: a.orderNumber,
        order_number: a.orderNumber,
        total_amount: amt(a.amountHalalas),
        description: a.description,
        country_code: "SA",
        payment_type: "PAY_BY_INSTALMENTS",
        instalments: 3,
        locale: a.locale === "ar" ? "ar_SA" : "en_US",
        items: o.items.map((i) => ({
          reference_id: i.sku,
          type: "Physical",
          name: i.title,
          sku: i.sku,
          quantity: i.quantity,
          unit_price: amt(i.unitHalalas),
          total_amount: amt(i.totalHalalas),
          item_url: i.productUrl,
          ...(i.imageUrl ? { image_url: i.imageUrl } : {}),
        })),
        consumer: { first_name: first || "-", last_name: last, phone_number: o.buyer.phone, ...(o.buyer.email ? { email: o.buyer.email } : {}) },
        shipping_address: { first_name: first || "-", last_name: last, line1: o.shipping.address, city: o.shipping.city, country_code: "SA", phone_number: o.buyer.phone },
        tax_amount: amt(o.taxHalalas),
        shipping_amount: amt(o.shippingHalalas),
        discount: { amount: amt(o.discountHalalas), name: "discount" },
        merchant_url: { success: a.returnUrl, failure: a.returnUrl, cancel: a.cancelUrl },
        risk_assessment: {
          is_premium_customer: false,
          account_creation_date: o.buyer.registeredSince.toISOString().slice(0, 10).split("-").reverse().join("-"),
          total_order_count: o.buyer.previousOrders,
        },
      }),
    });
    if (!res.checkout_url || !res.order_id) throw new PaymentRejectedError(`Tamara: no checkout (${res.status})`);
    return { providerRef: res.order_id, checkoutUrl: res.checkout_url };
  },

  async fetchState(providerRef) {
    return tamaraToState(await authoriseIfApproved(providerRef));
  },

  async onShipped({ providerRef, amountHalalas, carrier, trackingNumber, trackingUrl }) {
    const o = await call<TamaraOrder>(`/orders/${encodeURIComponent(providerRef)}`);
    if (o.status.toLowerCase() !== "authorised") return; // already captured / not payable
    await call("/payments/capture", {
      method: "POST",
      body: JSON.stringify({
        order_id: providerRef,
        total_amount: amt(amountHalalas),
        shipping_info: { shipped_at: new Date().toISOString(), shipping_company: (carrier || "Courier").slice(0, 100), ...(trackingNumber ? { tracking_number: trackingNumber.slice(0, 100) } : {}), ...(trackingUrl ? { tracking_url: trackingUrl } : {}) },
      }),
    });
  },

  async refund({ providerPaymentId, amountHalalas, reference }) {
    try {
      await call(`/payments/simplified-refund/${encodeURIComponent(providerPaymentId)}`, {
        method: "POST",
        body: JSON.stringify({ total_amount: amt(amountHalalas), comment: "Refund from store admin", merchant_refund_id: reference ?? `refund-${Date.now()}` }),
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "refund failed";
      return { ok: false, message: /captur/i.test(msg) ? `${msg} — الطلب لم يُلتقط بعد (يُلتقط عند الشحن). ألغِ الطلب من بوابة تمارا.` : msg };
    }
  },
};
