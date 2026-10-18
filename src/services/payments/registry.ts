import "server-only";
import { moyasarProvider } from "./moyasar";
import { testGatewayProvider } from "./test-gateway";
import type { PaymentProvider } from "./types";
import type { PaymentMethodId } from "@/schemas/checkout";
import type { Settings } from "@/services/settings";

const online: Record<"moyasar" | "test", PaymentProvider> = {
  moyasar: moyasarProvider,
  test: testGatewayProvider,
};

export function getOnlineProvider(id: string): PaymentProvider | null {
  return id === "moyasar" || id === "test" ? online[id] : null;
}

export type AvailableMethod = { id: PaymentMethodId; kind: "online" | "cod" | "test" };

/** Only methods that are actually wired up are offered to customers. */
export function availablePaymentMethods(payments: Settings["payments"], totalHalalas?: number): AvailableMethod[] {
  const out: AvailableMethod[] = [];
  if (payments.onlineEnabled && moyasarProvider.isConfigured()) out.push({ id: "moyasar", kind: "online" });
  if (payments.codEnabled && (payments.codMaxHalalas === null || totalHalalas === undefined || totalHalalas <= payments.codMaxHalalas)) {
    out.push({ id: "cod", kind: "cod" });
  }
  if (testGatewayProvider.isConfigured()) out.push({ id: "test", kind: "test" });
  return out;
}

export function paymentIntegrationStatus() {
  return {
    moyasar: moyasarProvider.isConfigured(),
    test: testGatewayProvider.isConfigured(),
  };
}
