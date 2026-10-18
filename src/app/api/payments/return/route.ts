import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getOrderForCustomer } from "@/services/orders";
import { getOnlineProvider } from "@/services/payments/registry";
import { applyPaymentState } from "@/services/payments/apply";
import { env } from "@/config/env";

export const dynamic = "force-dynamic";

/**
 * Customer returns from the gateway. The query string is NOT trusted: we look
 * up the payment and ask the gateway for its real status before redirecting
 * to the order page. Webhooks remain the primary confirmation channel.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const number = sp.get("o") ?? "";
  const token = sp.get("t") ?? "";
  const paymentId = sp.get("p") ?? "";
  const order = await getOrderForCustomer(number, token);
  if (!order) return NextResponse.redirect(new URL(`/ar`, env.appUrl));
  const dest = new URL(`/${order.locale}/orders/${encodeURIComponent(order.number)}`, env.appUrl);
  dest.searchParams.set("t", token);
  dest.searchParams.set("from", "gateway");

  try {
    const db = await getDb();
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
    if (payment && payment.orderId === order.id && payment.providerRef) {
      const provider = getOnlineProvider(payment.provider);
      if (provider?.isConfigured()) {
        const state = await provider.fetchState(payment.providerRef, payment.providerPaymentId);
        await applyPaymentState({ paymentId: payment.id, state, source: "return" });
      }
    }
  } catch (e) {
    console.warn("[payments/return] status check failed; webhook will confirm:", e instanceof Error ? e.message : e);
  }
  return NextResponse.redirect(dest, 303);
}
