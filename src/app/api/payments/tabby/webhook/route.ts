import { NextResponse, type NextRequest } from "next/server";
import { handleTabbyWebhook } from "@/services/payments/webhooks";

export const dynamic = "force-dynamic";

/** Register in Tabby with header  X-Webhook-Secret: <TABBY_WEBHOOK_SECRET>. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const out = await handleTabbyWebhook(body, req.headers.get("x-webhook-secret"));
  return NextResponse.json({ ok: out.status < 300 }, { status: out.status });
}
