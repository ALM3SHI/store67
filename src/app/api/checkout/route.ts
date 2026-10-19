import { NextResponse, type NextRequest } from "next/server";
import { placeOrder, CheckoutError } from "@/services/checkout";
import { rateLimit } from "@/services/rate-limit";
import { isSameOrigin, requestIp } from "@/lib/http/origin";
import { reportError } from "@/services/monitoring";
import { getCustomer } from "@/services/customer-auth";
import { checkoutSchema } from "@/schemas/checkout";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/** "Save this address to my account" at checkout (max 10, no duplicates). */
async function saveCheckoutAddress(customerId: string, body: unknown) {
  const p = checkoutSchema.safeParse(body);
  if (!p.success) return;
  const { customer, address } = p.data;
  const db = await getDb();
  const existing = await db.select().from(schema.customerAddresses).where(eq(schema.customerAddresses.customerId, customerId));
  if (existing.length >= 10) return;
  const same = existing.some((a) => a.city === address.city && a.district === address.district && a.street === address.street);
  if (same) return;
  await db.insert(schema.customerAddresses).values({
    customerId,
    recipientName: customer.name,
    phone: customer.phone,
    city: address.city,
    district: address.district,
    street: address.street,
    nationalAddress: address.nationalAddress ?? "",
    postalCode: address.postalCode ?? "",
    isDefault: existing.length === 0,
  });
}

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
    const customer = await getCustomer();
    const r = await placeOrder(body, { customerId: customer?.id });
    if (customer && (body as { saveAddress?: unknown })?.saveAddress === true) await saveCheckoutAddress(customer.id, body).catch(() => {});
    return NextResponse.json({ orderNumber: r.orderNumber, redirectUrl: r.redirectUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.code, details: e.details ?? null }, { status: STATUS[e.code] ?? 400 });
    await reportError("checkout", e, { path: "POST /api/checkout" });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
