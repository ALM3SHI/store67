import "server-only";
import { env, isProductionEnv } from "@/config/env";
import { randomToken } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { PaymentProvider } from "./types";

/**
 * Developer test gateway. Lets the full checkout → webhook → order flow be
 * exercised without a merchant account. It is hard-disabled when
 * APP_ENV=production, and its page is clearly labelled as a test.
 */
export const testGatewayProvider: PaymentProvider = {
  id: "test",
  label: "Test gateway",
  isConfigured: () => env.testGateway.enabled && !isProductionEnv(),

  async createSession(args) {
    const ref = `test_${randomToken(12)}`;
    const qs = new URLSearchParams({ r: args.returnUrl, c: args.cancelUrl });
    return { providerRef: ref, checkoutUrl: `${env.appUrl}/${args.locale}/pay/test/${args.paymentId}?${qs}` };
  },

  async fetchState(providerRef) {
    const db = await getDb();
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.providerRef, providerRef));
    if (!p) throw new Error("unknown test payment");
    const status =
      p.status === "paid" ? "paid" : p.status === "failed" ? "failed" : p.status === "cancelled" ? "cancelled" : p.status === "refunded" ? "refunded" : "pending";
    return { status, amountHalalas: p.amountHalalas, currency: p.currency, providerPaymentId: p.providerPaymentId, live: false };
  },

  async refund() {
    return { ok: true };
  },
};
