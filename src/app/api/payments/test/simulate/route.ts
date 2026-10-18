import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { env } from "@/config/env";
import { randomToken } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { isSameOrigin } from "@/lib/http/origin";
import { testGatewayProvider } from "@/services/payments/test-gateway";
import { handleTestWebhook, signTestEvent } from "@/services/payments/webhooks";

export const dynamic = "force-dynamic";

const safeReturn = (u: string | null) => (u && u.startsWith(env.appUrl + "/") ? u : env.appUrl);

/**
 * Form target of the developer test-gateway page. Simulates the gateway by
 * sending itself a signed webhook event, then sends the browser back exactly
 * like a real gateway would. Disabled outside development/staging.
 */
export async function POST(req: NextRequest) {
  if (!testGatewayProvider.isConfigured()) return new NextResponse("Not found", { status: 404 });
  if (!isSameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const fd = await req.formData();
  const kind = String(fd.get("kind"));
  const paymentId = String(fd.get("paymentId") ?? "");
  if (kind === "cancel") return NextResponse.redirect(safeReturn(fd.get("c") as string | null), 303);
  if (!/^[0-9a-f-]{36}$/.test(paymentId)) return new NextResponse("Bad request", { status: 400 });
  const db = await getDb();
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  if (!p || p.provider !== "test" || !p.providerRef) return new NextResponse("Not found", { status: 404 });
  const raw = JSON.stringify({ id: `evt_${randomToken(10)}`, type: kind === "paid" ? "payment_paid" : "payment_failed", ref: p.providerRef, amount: p.amountHalalas, currency: p.currency });
  await handleTestWebhook(raw, signTestEvent(raw));
  return NextResponse.redirect(safeReturn(fd.get("r") as string | null), 303);
}
