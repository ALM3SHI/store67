import { NextResponse, type NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/http/origin";
import { rateLimit } from "@/services/rate-limit";
import { aiProvider } from "@/services/ai";
import { draftProductCopy, productCopyInput } from "@/services/ai/product-copy";
import { audit } from "@/services/audit";
import { reportError } from "@/services/monitoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const admin = await adminFromRequest("products.manage");
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!aiProvider()) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  const rl = await rateLimit(`ai-copy:${admin.userId}`, 30, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = productCopyInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const copy = await draftProductCopy(parsed.data);
    await audit({ actorId: admin.userId, actorEmail: admin.email, action: "ai.product_copy", entity: "product", meta: { name: parsed.data.nameAr } });
    return NextResponse.json({ copy });
  } catch (e) {
    await reportError("request", e, { path: "AI product copy", alert: false });
    return NextResponse.json({ error: "ai_failed" }, { status: 502 });
  }
}
