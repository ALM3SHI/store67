import "server-only";
import { env } from "@/config/env";
import { PaymentProviderError, PaymentRejectedError, type PaymentProvider, type ProviderPaymentState } from "./types";

/**
 * Tabby — split in 4, no interest (https://docs.tabby.ai).
 * Flow: POST /api/v2/checkout → redirect to the installments web_url →
 * the customer returns (or the webhook arrives) → GET /api/v2/payments/{id}
 * is the authority → AUTHORIZED is captured right away so it becomes CLOSED
 * (only CLOSED payments can be refunded).
 */
const sar = (h: number) => (h / 100).toFixed(2);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.tabby.secretKey) throw new PaymentProviderError("Tabby secret key missing");
  const res = await fetch(`${env.tabby.apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.tabby.secretKey}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
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
    const b = body as { error?: string; message?: string; errors?: unknown } | null;
    throw new PaymentProviderError(`Tabby ${path} failed: HTTP ${res.status} ${b?.error ?? b?.message ?? ""}`.trim());
  }
  return body as T;
}

type TabbySession = {
  id: string;
  status: "created" | "rejected" | "expired" | "approved";
  payment?: { id: string; status?: string };
  configuration?: {
    available_products?: { installments?: { web_url?: string }[] };
    products?: { installments?: { is_available?: boolean; rejection_reason?: string | null } };
  };
};
export type TabbyPayment = {
  id: string;
  status: string; // CREATED | AUTHORIZED | CLOSED | REJECTED | EXPIRED (webhooks: lower-case)
  amount: string;
  currency: string;
  is_test?: boolean;
  order?: { reference_id?: string };
  captures?: { id: string; amount: string }[];
  refunds?: { id: string; amount: string }[];
};

export function tabbyToState(p: TabbyPayment): ProviderPaymentState {
  const amountHalalas = Math.round(Number(p.amount) * 100);
  const refunded = (p.refunds ?? []).reduce((n, r) => n + Math.round(Number(r.amount) * 100), 0);
  const s = p.status.toUpperCase();
  const base = { amountHalalas, currency: p.currency, providerPaymentId: p.id, method: "tabby", live: p.is_test === undefined ? undefined : !p.is_test };
  if (refunded > 0) return { ...base, status: refunded >= amountHalalas ? "refunded" : "partially_refunded", refundedHalalas: refunded };
  if (s === "AUTHORIZED" || s === "CLOSED") return { ...base, status: "paid" };
  if (s === "REJECTED") return { ...base, status: "failed", failureReason: "tabby_rejected" };
  if (s === "EXPIRED") return { ...base, status: "cancelled" };
  return { ...base, status: "pending" };
}

export const tabbyProvider: PaymentProvider = {
  id: "tabby",
  label: "Tabby",
  isConfigured: () => Boolean(env.tabby.secretKey && env.tabby.merchantCode),

  async createSession(a) {
    if (!a.order) throw new PaymentProviderError("Tabby needs order details");
    const o = a.order;
    const s = await call<TabbySession>("/api/v2/checkout", {
      method: "POST",
      body: JSON.stringify({
        payment: {
          amount: sar(a.amountHalalas),
          currency: "SAR",
          description: a.description,
          buyer: { name: o.buyer.name, email: o.buyer.email ?? "", phone: o.buyer.phone },
          shipping_address: { city: o.shipping.city, address: o.shipping.address, zip: o.shipping.postalCode || "00000" },
          order: {
            reference_id: a.orderNumber,
            tax_amount: sar(o.taxHalalas),
            shipping_amount: sar(o.shippingHalalas),
            discount_amount: sar(o.discountHalalas),
            items: o.items.map((i) => ({ reference_id: i.sku, title: i.title, quantity: i.quantity, unit_price: sar(i.unitHalalas), category: "Electronics", product_url: i.productUrl, ...(i.imageUrl ? { image_url: i.imageUrl } : {}) })),
          },
          buyer_history: { registered_since: o.buyer.registeredSince.toISOString(), loyalty_level: o.buyer.previousOrders },
        },
        lang: a.locale,
        merchant_code: env.tabby.merchantCode,
        merchant_urls: { success: a.returnUrl, cancel: a.cancelUrl, failure: a.returnUrl },
      }),
    });
    const url = s.configuration?.available_products?.installments?.[0]?.web_url;
    if (s.status === "rejected" || !url || !s.payment?.id) {
      throw new PaymentRejectedError(`Tabby rejected: ${s.configuration?.products?.installments?.rejection_reason ?? s.status}`);
    }
    return { providerRef: s.payment.id, checkoutUrl: url };
  },

  async fetchState(providerRef) {
    return tabbyToState(await call<TabbyPayment>(`/api/v2/payments/${encodeURIComponent(providerRef)}`));
  },

  async afterPaid({ providerRef, amountHalalas, orderNumber }) {
    const p = await call<TabbyPayment>(`/api/v2/payments/${encodeURIComponent(providerRef)}`);
    if (p.status.toUpperCase() !== "AUTHORIZED" || (p.captures ?? []).length) return;
    await call(`/api/v2/payments/${encodeURIComponent(providerRef)}/captures`, {
      method: "POST",
      body: JSON.stringify({ amount: sar(amountHalalas), reference_id: `capture-${orderNumber}` }),
    });
  },

  async refund({ providerPaymentId, amountHalalas, reference }) {
    try {
      await call(`/api/v2/payments/${encodeURIComponent(providerPaymentId)}/refunds`, {
        method: "POST",
        body: JSON.stringify({ amount: sar(amountHalalas), reference_id: reference ?? `refund-${providerPaymentId}-${amountHalalas}-${Date.now()}` }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "refund failed" };
    }
  },
};
