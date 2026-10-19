import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { safeEqual } from "@/lib/crypto";
import { expireStaleOrders } from "@/services/orders";
import { reportError } from "@/services/monitoring";
import { sendBackInStockAlerts } from "@/services/stock-alerts";
import { sendLowStockAlerts } from "@/services/low-stock";
import { sendCartReminders } from "@/services/cart-reminders";

export const dynamic = "force-dynamic";

/** Releases stock held by unpaid orders. Call from a scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.cronSecret || !safeEqual(auth, `Bearer ${env.cronSecret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const n = await expireStaleOrders();
    // Released stock may make waiting customers' products available again.
    const alerts = await sendBackInStockAlerts();
    const lowStock = await sendLowStockAlerts();
    const cartReminders = await sendCartReminders();
    return NextResponse.json({ expired: n, stockAlerts: alerts, lowStock, cartReminders });
  } catch (e) {
    await reportError("cron", e, { path: "cron: expire-orders" });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
