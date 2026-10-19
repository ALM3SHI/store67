import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOrigin, requestIp } from "@/lib/http/origin";
import { rateLimit } from "@/services/rate-limit";
import { cartReminderSchema, deleteCartReminder, saveCartReminder } from "@/services/cart-reminders";

export const dynamic = "force-dynamic";

/** Opt-in "remind me about my cart" from the checkout page. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rl = await rateLimit(`cart-reminder:${requestIp(req)}`, 20, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = cartReminderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const saved = await saveCartReminder(parsed.data);
  return NextResponse.json({ saved }, { status: saved ? 200 : 409 });
}

/** Unticking the box forgets the email straight away. */
export async function DELETE(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rl = await rateLimit(`cart-reminder:${requestIp(req)}`, 20, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = z.object({ email: z.email().max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await deleteCartReminder(parsed.data.email);
  return NextResponse.json({ deleted: true });
}
