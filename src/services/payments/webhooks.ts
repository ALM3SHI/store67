import "server-only";
import { env, serverSecret } from "@/config/env";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { applyPaymentState, findPaymentByRef, type ApplyResult } from "./apply";
import { moyasarProvider, toState, type MoyasarPayment } from "./moyasar";
import { tabbyProvider } from "./tabby";
import { tamaraProvider } from "./tamara";
import type { ProviderPaymentState } from "./types";
import { reportError } from "@/services/monitoring";

export type WebhookOutcome = { status: number; result: ApplyResult | "unauthorized" | "ignored" | "invalid" | "not_configured" };

/**
 * Moyasar account webhook. Authenticity: the shared `secret_token` configured
 * on the webhook in the Moyasar dashboard. Defense in depth: the payment is
 * then re-fetched from the Moyasar API with our secret key, so a forged body
 * can never mark an order as paid.
 */
export async function handleMoyasarWebhook(body: unknown): Promise<WebhookOutcome> {
  if (!moyasarProvider.isConfigured()) return { status: 503, result: "not_configured" };
  const b = body as { id?: string; type?: string; secret_token?: string; data?: MoyasarPayment } | null;
  if (!b || typeof b !== "object" || !b.secret_token || !safeEqual(b.secret_token, env.moyasar.webhookSecret!)) {
    return { status: 401, result: "unauthorized" };
  }
  if (!b.id || !b.type || !b.data?.id) return { status: 400, result: "invalid" };
  if (!b.type.startsWith("payment_")) return { status: 200, result: "ignored" };

  const invoiceId = b.data.invoice_id;
  const payment = invoiceId ? await findPaymentByRef("moyasar", invoiceId) : null;
  if (!payment) return { status: 200, result: "ignored" }; // not one of ours (or created elsewhere)

  // Never trust the webhook body for money: ask the API for the authoritative state.
  let state: ProviderPaymentState;
  try {
    state = await moyasarProvider.fetchState(invoiceId!, b.data.id);
  } catch (e) {
    await reportError("payment", e, { path: "Moyasar webhook: verification fetch" });
    return { status: 502, result: "invalid" }; // non-2xx → Moyasar retries later
  }
  const result = await applyPaymentState({
    paymentId: payment.id,
    state,
    eventId: b.id,
    eventType: b.type,
    source: "webhook",
    payload: { id: b.id, type: b.type, payment_id: b.data.id, status: b.data.status, amount: b.data.amount, live: (b as { live?: boolean }).live ?? null },
  });
  return { status: 200, result };
}

/* ───────────── Test gateway (non-production only) */

export function signTestEvent(raw: string) {
  return hmacSha256(serverSecret(), `test-gateway:${raw}`);
}

export async function handleTestWebhook(raw: string, signature: string | null): Promise<WebhookOutcome> {
  const { testGatewayProvider } = await import("./test-gateway");
  if (!testGatewayProvider.isConfigured()) return { status: 404, result: "not_configured" };
  if (!signature || !safeEqual(signature, signTestEvent(raw))) return { status: 401, result: "unauthorized" };
  let b: { id: string; type: "payment_paid" | "payment_failed" | "payment_cancelled"; ref: string; amount: number; currency: string };
  try {
    b = JSON.parse(raw);
  } catch {
    return { status: 400, result: "invalid" };
  }
  const payment = await findPaymentByRef("test", b.ref);
  if (!payment) return { status: 404, result: "invalid" };
  const state: ProviderPaymentState = {
    status: b.type === "payment_paid" ? "paid" : b.type === "payment_failed" ? "failed" : "cancelled",
    amountHalalas: b.amount,
    currency: b.currency,
    providerPaymentId: `testpay_${b.id}`,
    method: "test",
    live: false,
    failureReason: b.type === "payment_failed" ? "Card declined (simulated)" : null,
  };
  const result = await applyPaymentState({ paymentId: payment.id, state, eventId: b.id, eventType: b.type, source: "webhook", payload: b });
  return { status: 200, result };
}

export { toState };

/**
 * Tabby payment webhook. If TABBY_WEBHOOK_SECRET is set, the custom header
 * registered with the webhook must match. Either way the payment is re-fetched
 * from Tabby's API before anything changes.
 */
export async function handleTabbyWebhook(body: unknown, headerSecret: string | null): Promise<WebhookOutcome> {
  if (!tabbyProvider.isConfigured()) return { status: 503, result: "not_configured" };
  if (env.tabby.webhookSecret && !(headerSecret && safeEqual(headerSecret, env.tabby.webhookSecret))) return { status: 401, result: "unauthorized" };
  const b = body as { id?: string; status?: string } | null;
  if (!b?.id || typeof b.id !== "string") return { status: 400, result: "invalid" };
  const payment = await findPaymentByRef("tabby", b.id);
  // Unknown yet (e.g. webhook raced the session save): non-200 makes Tabby retry.
  if (!payment) return { status: 404, result: "ignored" };
  try {
    const state = await tabbyProvider.fetchState(b.id);
    return { status: 200, result: await applyPaymentState({ paymentId: payment.id, state, eventId: `${b.id}:${b.status ?? ""}:${state.status}`, eventType: b.status ?? "tabby", source: "webhook" }) };
  } catch (e) {
    await reportError("payment", e, { path: "Tabby webhook: verification fetch" });
    return { status: 502, result: "invalid" };
  }
}

/**
 * Tamara order webhook. The body is only a hint: the order is fetched (and
 * authorised when approved) through Tamara's API with our token.
 */
export async function handleTamaraWebhook(body: unknown): Promise<WebhookOutcome> {
  if (!tamaraProvider.isConfigured()) return { status: 503, result: "not_configured" };
  const b = body as { order_id?: string; event_type?: string } | null;
  if (!b?.order_id || typeof b.order_id !== "string") return { status: 400, result: "invalid" };
  const payment = await findPaymentByRef("tamara", b.order_id);
  if (!payment) return { status: 404, result: "ignored" };
  try {
    const state = await tamaraProvider.fetchState(b.order_id);
    return { status: 200, result: await applyPaymentState({ paymentId: payment.id, state, eventId: `${b.order_id}:${b.event_type ?? ""}:${state.status}`, eventType: b.event_type ?? "tamara", source: "webhook" }) };
  } catch (e) {
    await reportError("payment", e, { path: "Tamara webhook: verification fetch" });
    return { status: 502, result: "invalid" };
  }
}
