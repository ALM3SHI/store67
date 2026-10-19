"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/services/audit";
import { moveReturn, type ReturnMove } from "@/services/returns";
import { sendBackInStockAlerts } from "@/services/stock-alerts";
import { runAfterResponse } from "@/lib/after";
import type { ActionState } from "@/components/admin/ui";

const moves = ["approve", "reject", "receive", "complete"] as const satisfies readonly ReturnMove[];
const doneText: Record<ReturnMove, string> = {
  approve: "قُبل الطلب وأُبلغ العميل.",
  reject: "رُفض الطلب وأُبلغ العميل بالسبب.",
  receive: "سُجّل استلام المنتج.",
  complete: "أُغلق الطلب وأُبلغ العميل.",
};

export async function updateReturn(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin("orders.update");
  const id = z.uuid().safeParse(fd.get("id"));
  const move = z.enum(moves).safeParse(fd.get("move"));
  if (!id.success || !move.success) return { ok: false, message: "طلب غير صالح." };
  const r = await moveReturn(id.data, move.data, {
    message: String(fd.get("message") ?? ""),
    restock: fd.get("restock") === "on",
    actor: { id: admin.userId, name: admin.name },
  });
  if (!r.ok) {
    return { ok: false, message: r.error === "message" ? "اكتب للعميل سبب الرفض." : r.error === "state" ? "حالة الطلب تغيّرت. حدّث الصفحة." : "الطلب غير موجود." };
  }
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: `return.${move.data}`, entity: "order", entityId: r.request.orderId, meta: { number: r.request.number, restocked: r.restockedUnits } });
  if (r.restockedUnits) await runAfterResponse(() => sendBackInStockAlerts());
  revalidatePath("/admin/returns");
  revalidatePath(`/admin/orders/${r.request.orderId}`);
  return { ok: true, message: doneText[move.data] + (r.restockedUnits ? ` أُعيدت ${r.restockedUnits} قطعة للمخزون.` : "") };
}
