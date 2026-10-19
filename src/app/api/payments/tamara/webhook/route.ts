import { NextResponse, type NextRequest } from "next/server";
import { handleTamaraWebhook } from "@/services/payments/webhooks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const out = await handleTamaraWebhook(body);
  return NextResponse.json({ ok: out.status < 300 }, { status: out.status });
}
