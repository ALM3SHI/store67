import { NextResponse, type NextRequest } from "next/server";
import { placeOrder, CheckoutError } from "@/services/checkout";
import { rateLimit } from "@/services/rate-limit";
import { isSameOrigin, requestIp } from "@/lib/http/origin";
import { reportError } from "@/services/monitoring";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  invalid_input: 422,
  empty_cart: 422,
  out_of_stock: 409,
  price_changed: 409,
  coupon_invalid: 422,
  payment_unavailable: 422,
  shipping_unavailable: 422,
  payment_provider_error: 502,
};

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rl = await rateLimit(`checkout:${requestIp(req)}`, 15, 600);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  try {
    const r = await placeOrder(body);
    return NextResponse.json({ orderNumber: r.orderNumber, redirectUrl: r.redirectUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.code, details: e.details ?? null }, { status: STATUS[e.code] ?? 400 });
    await reportError("checkout", e, { path: "POST /api/checkout" });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
