import Link from "next/link";
import { Badge } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { Money } from "@/components/ui/price";
import { updateReturn } from "@/features/admin/return-actions";
import { RETURN_REASON_AR, RETURN_STATUS_AR, returnValueHalalas, type ReturnReason, type ReturnRequest, type ReturnStatus } from "@/services/returns";

type Line = { id: string; nameAr: string; variantNameAr: string; unitPriceHalalas: number; quantity: number; lineTotalHalalas: number };
const tone: Record<ReturnStatus, "amber" | "blue" | "red" | "green" | "gray"> = { requested: "amber", approved: "blue", received: "blue", rejected: "red", completed: "green", cancelled: "gray" };
const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

/** One return request with the staff actions that fit its current status. */
export function ReturnCard({ r, lines, order, canUpdate }: { r: ReturnRequest; lines: Line[]; order?: { id: string; number: string; customerName: string; paymentMethod: string }; canUpdate: boolean }) {
  const status = r.status as ReturnStatus;
  const value = returnValueHalalas(r, lines);
  const hidden = <input type="hidden" name="id" value={r.id} />;
  const move = (m: string) => <input type="hidden" name="move" value={m} />;
  return (
    <li className="rounded-2xl border border-paper-2 bg-white p-4" id={`r-${r.number}`} data-testid="admin-return">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-display font-semibold" dir="ltr">{r.number}</span>
        <Badge tone={r.kind === "exchange" ? "ink" : "gray"}>{r.kind === "exchange" ? "استبدال" : "استرجاع"}</Badge>
        <Badge tone={tone[status]}>{RETURN_STATUS_AR[status]}</Badge>
        {order ? <Link href={`/admin/orders/${order.id}`} className="text-volt">طلب {order.number} — {order.customerName}</Link> : null}
        <span className="ms-auto text-xs text-metal-500">{date.format(r.createdAt)}</span>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {r.items.map((it) => {
          const l = lines.find((x) => x.id === it.orderItemId);
          return <li key={it.orderItemId}>{l ? `${l.nameAr}${l.variantNameAr ? ` — ${l.variantNameAr}` : ""}` : "منتج محذوف"} × {it.quantity}</li>;
        })}
      </ul>
      <dl className="mt-2 grid gap-1 text-sm">
        <div><dt className="inline text-metal-500">السبب: </dt><dd className="inline">{RETURN_REASON_AR[r.reason as ReturnReason] ?? r.reason}</dd></div>
        {r.exchangeFor ? <div><dt className="inline text-metal-500">يريد بدلًا منه: </dt><dd className="inline">{r.exchangeFor}</dd></div> : null}
        {r.note ? <div><dt className="inline text-metal-500">ملاحظة العميل: </dt><dd className="inline whitespace-pre-wrap">{r.note}</dd></div> : null}
        {r.kind === "return" ? <div><dt className="inline text-metal-500">قيمة المنتجات المدفوعة (بدون الشحن): </dt><dd className="inline"><Money halalas={value} locale="ar" /></dd></div> : null}
        {r.staffMessage ? <div><dt className="inline text-metal-500">ردّك للعميل: </dt><dd className="inline whitespace-pre-wrap">{r.staffMessage}</dd></div> : null}
        {r.decidedBy ? <div className="text-xs text-metal-500">قرّر: {r.decidedBy}{r.decidedAt ? ` — ${date.format(r.decidedAt)}` : ""}</div> : null}
        {r.restocked ? <div className="text-xs text-ok">أُعيدت الكمية للمخزون</div> : null}
      </dl>

      {canUpdate && status === "requested" ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ActionForm action={updateReturn} testId="return-approve">
            {hidden}{move("approve")}
            <textarea name="message" rows={3} className="field text-sm" placeholder="تعليمات للعميل: كيف يرسل المنتج، العنوان، من يتحمّل الشحن…" />
            <SubmitButton variant="ink">قبول</SubmitButton>
          </ActionForm>
          <ActionForm action={updateReturn} testId="return-reject">
            {hidden}{move("reject")}
            <textarea name="message" rows={3} className="field text-sm" placeholder="سبب الرفض (يصل للعميل)" required minLength={3} />
            <SubmitButton variant="danger">رفض</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
      {canUpdate && status === "approved" ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <ActionForm action={updateReturn} className="flex flex-wrap items-center gap-3" testId="return-receive">
            {hidden}{move("receive")}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restock" defaultChecked={r.reason !== "defective" && r.reason !== "damaged"} /> أعد الكمية للمخزون (إن كان المنتج سليمًا)</label>
            <SubmitButton variant="ink">استلمنا المنتج</SubmitButton>
          </ActionForm>
          {r.kind === "exchange" ? (
            <ActionForm action={updateReturn}>{hidden}{move("complete")}<SubmitButton variant="ghost">إغلاق بدون استلام</SubmitButton></ActionForm>
          ) : null}
        </div>
      ) : null}
      {canUpdate && status === "received" ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-metal-700">
            {r.kind === "return"
              ? order?.paymentMethod === "cod"
                ? "طلب دفع عند الاستلام: حوّل المبلغ للعميل بالطريقة المتفق عليها، ثم أغلق الطلب."
                : "نفّذ استرجاع المبلغ من قسم «الدفع» في صفحة الطلب، ثم أغلق هذا الطلب."
              : "أرسل المنتج البديل للعميل، ثم أغلق هذا الطلب."}
          </p>
          <ActionForm action={updateReturn} testId="return-complete">
            {hidden}{move("complete")}
            <textarea name="message" rows={2} className="field text-sm" placeholder="رسالة ختامية للعميل (اختياري) — مثل موعد وصول المبلغ أو رقم تتبع البديل" />
            <SubmitButton variant="ink">إغلاق الطلب كمكتمل</SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </li>
  );
}
