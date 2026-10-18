import { NextResponse, type NextRequest } from "next/server";
import { handleMoyasarWebhook } from "@/services/payments/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const out = await handleMoyasarWebhook(body);
  // Minimal response body — no internal details leak to callers.
  return NextResponse.json({ ok: out.status < 300, result: out.status < 300 ? out.result : undefined }, { status: out.status });
}
