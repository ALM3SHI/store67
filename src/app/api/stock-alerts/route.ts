import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, requestIp } from "@/lib/http/origin";
import { rateLimit } from "@/services/rate-limit";
import { stockAlertSchema, subscribeStockAlert } from "@/services/stock-alerts";

export const dynamic = "force-dynamic";

/** "Tell me when it's back in stock" — stores the email until the alert is sent. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rl = await rateLimit(`stock-alert:${requestIp(req)}`, 10, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = stockAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const result = await subscribeStockAlert(parsed.data);
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ result });
}
