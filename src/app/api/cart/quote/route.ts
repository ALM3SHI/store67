import { NextResponse, type NextRequest } from "next/server";
import { quoteRequestSchema } from "@/schemas/checkout";
import { buildQuote } from "@/services/quote";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  try {
    const q = await buildQuote(parsed.data);
    // Internal ids are not needed by the browser
    return NextResponse.json({ ...q, coupon: q.coupon ? { ...q.coupon, couponId: null } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[quote]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "quote_failed" }, { status: 500 });
  }
}
