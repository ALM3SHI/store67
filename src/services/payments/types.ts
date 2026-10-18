export type NormalizedPaymentStatus = "paid" | "failed" | "pending" | "cancelled" | "refunded" | "partially_refunded";

export type ProviderPaymentState = {
  status: NormalizedPaymentStatus;
  amountHalalas: number;
  currency: string;
  providerPaymentId?: string | null;
  method?: string | null;
  live?: boolean;
  failureReason?: string | null;
  refundedHalalas?: number;
};

export type CreateSessionArgs = {
  paymentId: string;
  orderNumber: string;
  amountHalalas: number;
  currency: "SAR";
  locale: "ar" | "en";
  /** Where the gateway sends the customer back after paying */
  returnUrl: string;
  /** Where the gateway sends the customer if they go back */
  cancelUrl: string;
  description: string;
};

export type CreateSessionResult = { providerRef: string; checkoutUrl: string };

/**
 * Online payment gateway adapter. Order logic only talks to this interface,
 * so adding a gateway (Tap, HyperPay, PayTabs…) means adding one adapter.
 */
export interface PaymentProvider {
  readonly id: "moyasar" | "test";
  readonly label: string;
  isConfigured(): boolean;
  createSession(args: CreateSessionArgs): Promise<CreateSessionResult>;
  /** Authoritative status straight from the gateway (never trust redirects alone) */
  fetchState(providerRef: string, providerPaymentId?: string | null): Promise<ProviderPaymentState>;
  refund?(args: { providerPaymentId: string; amountHalalas: number }): Promise<{ ok: boolean; message?: string }>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly safeMessage = "payment_provider_error",
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
