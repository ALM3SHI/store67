import { NextResponse, type NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/auth/session";
import { exportOrdersCsv } from "@/services/order-export";
import { audit } from "@/services/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Orders as a CSV file that Excel opens with Arabic intact. Uses the list's filters. */
export async function GET(req: NextRequest) {
  const admin = await adminFromRequest("orders.view");
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const filters = { q: p.get("q") ?? undefined, status: p.get("status") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined };
  const { csv, count } = await exportOrdersCsv(filters);
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "orders.export", entity: "order", meta: { ...filters, count } });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
