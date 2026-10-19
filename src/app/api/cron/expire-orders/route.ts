import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { safeEqual } from "@/lib/crypto";
import { expireStaleOrders } from "@/services/orders";
import { reportError } from "@/services/monitoring";

export const dynamic = "force-dynamic";

/** Releases stock held by unpaid orders. Call from a scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.cronSecret || !safeEqual(auth, `Bearer ${env.cronSecret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const n = await expireStaleOrders();
    return NextResponse.json({ expired: n });
  } catch (e) {
    await reportError("cron", e, { path: "cron: expire-orders" });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
