import { NextResponse, type NextRequest } from "next/server";
import { handleTestWebhook } from "@/services/payments/webhooks";

export const dynamic = "force-dynamic";

/** Signed test-gateway events (disabled in production). */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const out = await handleTestWebhook(raw, req.headers.get("x-test-signature"));
  return NextResponse.json({ ok: out.status < 300, result: out.result }, { status: out.status });
}
