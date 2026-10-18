import "server-only";
import { env } from "@/config/env";
import { PaymentProviderError, type PaymentProvider, type ProviderPaymentState, type NormalizedPaymentStatus } from "./types";

/**
 * Moyasar (https://docs.moyasar.com) — supports mada, Visa, Mastercard, Apple Pay
 * and STC Pay depending on what is activated on the merchant account.
 *
 * Flow: we create an *invoice* server-side (amount in halalas) and redirect the
 * customer to its hosted page. Card data never touches this server. The result
 * is confirmed by (1) the account webhook (secret_token verified) and (2) a
 * server-side re-fetch of the invoice/payment from the API.
 *
 * Auth: HTTP Basic with the secret key as username and an empty password.
 */
function authHeader() {
  const key = env.moyasar.secretKey;
  if (!key) throw new PaymentProviderError("Moyasar secret key missing");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.moyasar.apiBase}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new PaymentProviderError(`Moyasar ${path} failed: ${msg}`);
  }
  return body as T;
}

type MoyasarPayment = {
  id: string;
  status: string; // initiated | paid | failed | authorized | captured | refunded | voided | verified
  amount: number;
  currency: string;
  refunded?: number;
  invoice_id?: string | null;
  source?: { type?: string; company?: string; message?: string | null } | null;
  live?: boolean;
};
type MoyasarInvoice = {
  id: string;
  status: string; // initiated | paid | failed | refunded | canceled | on_hold | expired | voided
  amount: number;
  currency: string;
  url: string;
  payments?: MoyasarPayment[];
};

function mapStatus(s: string): NormalizedPaymentStatus {
  switch (s) {
    case "paid":
    case "captured":
      return "paid";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    case "voided":
    case "canceled":
    case "expired":
      return "cancelled";
    default:
      return "pending"; // initiated, authorized, on_hold, verified
  }
}

function methodOf(p?: MoyasarPayment | null): string | null {
  if (!p?.source) return null;
  if (p.source.type === "creditcard") return p.source.company ?? "creditcard"; // mada | visa | master | amex
  return p.source.type ?? null; // applepay | stcpay | samsungpay
}

export const moyasarProvider: PaymentProvider = {
  id: "moyasar",
  label: "Moyasar",
  isConfigured: () => Boolean(env.moyasar.secretKey && env.moyasar.webhookSecret),

  async createSession(args) {
    const invoice = await call<MoyasarInvoice>("/invoices", {
      method: "POST",
      body: JSON.stringify({
        amount: args.amountHalalas,
        currency: args.currency,
        description: args.description,
        success_url: args.returnUrl,
        back_url: args.cancelUrl,
      }),
    });
    if (!invoice?.id || !invoice.url) throw new PaymentProviderError("Moyasar invoice response missing id/url");
    return { providerRef: invoice.id, checkoutUrl: invoice.url };
  },

  async fetchState(providerRef, providerPaymentId) {
    if (providerPaymentId) {
      const p = await call<MoyasarPayment>(`/payments/${encodeURIComponent(providerPaymentId)}`);
      return toState(p);
    }
    const inv = await call<MoyasarInvoice>(`/invoices/${encodeURIComponent(providerRef)}`);
    const paid = inv.payments?.find((p) => mapStatus(p.status) === "paid");
    const latest = paid ?? inv.payments?.[inv.payments.length - 1] ?? null;
    return {
      status: mapStatus(inv.status),
      amountHalalas: inv.amount,
      currency: inv.currency,
      providerPaymentId: latest?.id ?? null,
      method: methodOf(latest),
      live: latest?.live,
      failureReason: latest && mapStatus(latest.status) === "failed" ? (latest.source?.message ?? null) : null,
    };
  },

  async refund({ providerPaymentId, amountHalalas }) {
    try {
      await call<MoyasarPayment>(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount: amountHalalas }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "refund failed" };
    }
  },
};

export function toState(p: MoyasarPayment): ProviderPaymentState {
  const refunded = p.refunded ?? 0;
  let status = mapStatus(p.status);
  if (status === "paid" && refunded > 0) status = refunded >= p.amount ? "refunded" : "partially_refunded";
  return {
    status,
    amountHalalas: p.amount,
    currency: p.currency,
    providerPaymentId: p.id,
    method: methodOf(p),
    live: p.live,
    failureReason: status === "failed" ? (p.source?.message ?? null) : null,
    refundedHalalas: refunded,
  };
}

export type { MoyasarPayment };
