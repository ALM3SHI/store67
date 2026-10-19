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

/** What buy-now-pay-later providers need to assess and show the order. */
export type SessionOrderContext = {
  buyer: { name: string; phone: string; email: string | null; registeredSince: Date; previousOrders: number };
  shipping: { city: string; address: string; postalCode: string };
  items: { sku: string; title: string; quantity: number; unitHalalas: number; totalHalalas: number; productUrl: string; imageUrl: string | null }[];
  shippingHalalas: number;
  taxHalalas: number;
  discountHalalas: number;
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
  /** Full order details (needed by Tabby / Tamara) */
  order?: SessionOrderContext;
};

export type CreateSessionResult = { providerRef: string; checkoutUrl: string };

/**
 * Online payment gateway adapter. Order logic only talks to this interface,
 * so adding a gateway (Tap, HyperPay, PayTabs…) means adding one adapter.
 */
export interface PaymentProvider {
  readonly id: "moyasar" | "test" | "tabby" | "tamara";
  readonly label: string;
  isConfigured(): boolean;
  createSession(args: CreateSessionArgs): Promise<CreateSessionResult>;
  /** Authoritative status straight from the gateway (never trust redirects alone) */
  fetchState(providerRef: string, providerPaymentId?: string | null): Promise<ProviderPaymentState>;
  refund?(args: { providerPaymentId: string; amountHalalas: number; reference?: string }): Promise<{ ok: boolean; message?: string }>;
  /** Some providers need the merchant to confirm (capture) after the customer approves. */
  afterPaid?(args: { providerRef: string; providerPaymentId: string | null; amountHalalas: number; orderNumber: string }): Promise<void>;
  /** Called when the order ships (Tamara requires shipping info to capture). */
  onShipped?(args: { providerRef: string; amountHalalas: number; carrier: string; trackingNumber: string | null; trackingUrl: string | null }): Promise<void>;
}

/** The provider refused this customer/order (e.g. BNPL eligibility) — offer another method. */
export class PaymentRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentRejectedError";
  }
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
