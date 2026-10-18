import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getDb, schema } from "@/lib/db";
import { getOrderDetails, STATUS_TRANSITIONS } from "@/services/orders";
import { aramexShipping } from "@/services/shipping/aramex";
import { describeAddress } from "@/services/checkout";
import { PageHeader, Card, Badge, orderStatusTone, paymentStatusTone } from "@/components/admin/static";
import { ActionForm } from "@/components/admin/action-form";
import { SubmitButton } from "@/components/admin/ui";
import { Money } from "@/components/ui/price";
import { updateOrderStatus, addOrderNote, saveManualShipment, createAramexShipment, syncShipment, markCodCollected, refundOrder, refreshPaymentStatus } from "@/features/admin/order-actions";
import { audit } from "@/services/audit";
import { formatSaudiMobile } from "@/lib/phone";
import { halalasToInput } from "@/lib/money";
import ar from "@/i18n/ar";

export const metadata = { title: "تفاصيل الطلب" };

export default async function OrderAdmin({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("orders.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!o) notFound();
  const { items, events, payments, shipments } = await getOrderDetails(id, { includeInternal: true });
  await audit({ actorId: admin.userId, actorEmail: admin.email, action: "order.view", entity: "order", entityId: id });
  const canUpdate = can(admin.role, "orders.update");
  const canRefund = can(admin.role, "orders.refund");
  const next = STATUS_TRANSITIONS[o.status];
  const paid = payments.find((p) => p.status === "paid" || p.status === "partially_refunded");
  const shipment = shipments[0];
  const date = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const hidden = <input type="hidden" name="orderId" value={o.id} />;

  return (
    <>
      <PageHeader
        title={`طلب ${o.number}`}
        description={date.format(o.createdAt)}
        actions={
          <>
            <Badge tone={orderStatusTone[o.status]}>{ar.status[o.status]}</Badge>
            <Badge tone={paymentStatusTone[o.paymentStatus]}>{ar.paymentStatus[o.paymentStatus]}</Badge>
            <Link href="/admin/orders" className="btn btn-ghost btn-sm">كل الطلبات</Link>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card title="المنتجات">
            <ul className="divide-y divide-paper-2">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink">{it.imageUrl ? <Image src={it.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : null}</span>
                  <span className="flex-1">{it.nameAr}{it.variantNameAr ? ` — ${it.variantNameAr}` : ""}<span className="block text-xs text-metal-500" dir="ltr">{it.sku}</span></span>
                  <span>× {it.quantity}</span>
                  <Money halalas={it.lineTotalHalalas} locale="ar" />
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-paper-2 pt-3 text-sm">
              <div className="flex justify-between"><dt>المجموع الفرعي</dt><dd><Money halalas={o.subtotalHalalas} locale="ar" /></dd></div>
              {o.discountHalalas ? <div className="flex justify-between text-ok"><dt>خصم {o.couponCode ?? ""}</dt><dd>− <Money halalas={o.discountHalalas} locale="ar" /></dd></div> : null}
              <div className="flex justify-between"><dt>الشحن ({o.shippingMethod === "aramex" ? "أرامكس" : "يدوي"})</dt><dd><Money halalas={o.shippingHalalas} locale="ar" /></dd></div>
              {o.codFeeHalalas ? <div className="flex justify-between"><dt>رسوم الدفع عند الاستلام</dt><dd><Money halalas={o.codFeeHalalas} locale="ar" /></dd></div> : null}
              {o.taxHalalas ? <div className="flex justify-between"><dt>ضريبة القيمة المضافة ({o.taxRateBps / 100}%{o.pricesIncludeTax ? " شاملة" : ""})</dt><dd><Money halalas={o.taxHalalas} locale="ar" /></dd></div> : null}
              <div className="flex justify-between text-base font-semibold"><dt>الإجمالي</dt><dd><Money halalas={o.totalHalalas} locale="ar" /></dd></div>
            </dl>
          </Card>

          <Card title="الشحن والتوصيل">
            {shipment ? (
              <div className="mb-4 space-y-1 rounded-xl bg-paper p-3 text-sm">
                <p>شركة الشحن: {shipment.carrierName || shipment.provider}</p>
                <p>رقم التتبع: <bdi className="font-display font-semibold" dir="ltr">{shipment.trackingNumber ?? "—"}</bdi></p>
                <p>حالة الشحنة: {shipment.status}{shipment.lastSyncedAt ? ` — آخر تحديث ${date.format(shipment.lastSyncedAt)}` : ""}</p>
                {shipment.labelUrl ? <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer" className="text-volt underline">ملصق الشحن</a> : null}
              </div>
            ) : (
              <p className="mb-4 text-sm text-metal-500">لا توجد شحنة بعد.</p>
            )}
            {canUpdate ? (
              <div className="grid gap-5 md:grid-cols-2">
                <ActionForm action={saveManualShipment} testId="manual-shipment">
                  {hidden}
                  <p className="text-sm font-medium">إدخال يدوي</p>
                  <input name="carrierName" placeholder="شركة الشحن" defaultValue={shipment?.carrierName ?? ""} className="field" />
                  <input name="trackingNumber" placeholder="رقم التتبع" dir="ltr" defaultValue={shipment?.provider === "manual" ? (shipment.trackingNumber ?? "") : ""} className="field" required />
                  <input name="trackingUrl" placeholder="رابط التتبع (اختياري) https://" dir="ltr" defaultValue={shipment?.trackingUrl ?? ""} className="field" />
                  <SubmitButton variant="ink">حفظ الشحنة</SubmitButton>
                </ActionForm>
                <div className="space-y-3">
                  <p className="text-sm font-medium">أرامكس</p>
                  {aramexShipping.isConfigured() ? (
                    <>
                      {!shipment?.trackingNumber ? (
                        <ActionForm action={createAramexShipment}>{hidden}<SubmitButton variant="primary">إنشاء شحنة أرامكس</SubmitButton></ActionForm>
                      ) : null}
                      {shipment?.trackingNumber ? <ActionForm action={syncShipment}>{hidden}<SubmitButton variant="ghost">تحديث التتبع</SubmitButton></ActionForm> : null}
                    </>
                  ) : (
                    <p className="text-sm text-metal-500">حساب أرامكس غير مربوط. أضف متغيرات ARAMEX_* لإنشاء الشحنات والملصقات آليًا.</p>
                  )}
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="السجل والملاحظات">
            {canUpdate ? (
              <ActionForm action={addOrderNote} className="mb-5 space-y-2">
                {hidden}
                <textarea name="note" rows={2} placeholder="ملاحظة داخلية (لا يراها العميل)" className="field" />
                <SubmitButton variant="ink">إضافة ملاحظة</SubmitButton>
              </ActionForm>
            ) : null}
            <ol className="space-y-3 border-s-2 border-paper-2 ps-4 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <p>{e.message} {e.internal ? <Badge tone="gray">داخلي</Badge> : <Badge tone="blue">ظاهر للعميل</Badge>}</p>
                  <p className="text-xs text-metal-500">{date.format(e.createdAt)}{e.actorName ? ` — ${e.actorName}` : ""}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="العميل">
            <p className="font-medium">{o.customerName}</p>
            <p className="text-sm" dir="ltr">{formatSaudiMobile(o.phone)}</p>
            {o.email ? <p className="text-sm" dir="ltr">{o.email}</p> : null}
            <p className="mt-3 text-sm leading-7">{describeAddress(o.shippingAddress, "ar")}{o.shippingAddress.postalCode ? ` — ${o.shippingAddress.postalCode}` : ""}</p>
            {o.customerNote ? <p className="mt-2 rounded-lg bg-paper p-2 text-sm">ملاحظة العميل: {o.customerNote}</p> : null}
            {o.customerId ? <Link href={`/admin/customers/${o.customerId}`} className="mt-3 inline-block text-sm text-volt">سجل العميل</Link> : null}
          </Card>

          {canUpdate && next.length ? (
            <Card title="تحديث الحالة">
              <ActionForm action={updateOrderStatus} testId="status-form">
                {hidden}
                <select name="status" className="field">{next.map((s) => <option key={s} value={s}>{ar.status[s]}</option>)}</select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="public" defaultChecked /> إظهار التحديث للعميل في صفحة الطلب</label>
                <SubmitButton variant="ink">تحديث</SubmitButton>
              </ActionForm>
            </Card>
          ) : null}

          <Card title="الدفع">
            <ul className="space-y-2 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="rounded-lg bg-paper p-2">
                  <div className="flex justify-between"><span>{p.provider === "moyasar" ? "Moyasar" : p.provider === "cod" ? "عند الاستلام" : "بوابة اختبار"}{p.method ? ` — ${p.method}` : ""}</span><Badge tone={paymentStatusTone[p.status]}>{ar.paymentStatus[p.status]}</Badge></div>
                  <div className="mt-1 flex justify-between text-xs text-metal-500"><span dir="ltr">{p.providerRef ?? ""}</span><Money halalas={p.amountHalalas} locale="ar" /></div>
                  {p.refundedHalalas ? <p className="text-xs">مسترجع: <Money halalas={p.refundedHalalas} locale="ar" /></p> : null}
                  {p.failureReason ? <p className="text-xs text-danger">{p.failureReason}</p> : null}
                  {p.provider !== "cod" ? <p className="text-xs text-metal-500">{p.live ? "وضع حي" : "وضع اختبار"}</p> : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-4">
              {canUpdate && payments.some((p) => p.provider !== "cod" && p.providerRef) ? (
                <ActionForm action={refreshPaymentStatus}>{hidden}<SubmitButton variant="ghost">التحقق من حالة الدفع لدى البوابة</SubmitButton></ActionForm>
              ) : null}
              {canUpdate && o.paymentStatus === "cod_pending" && ["shipped", "delivered"].includes(o.status) ? (
                <ActionForm action={markCodCollected}>{hidden}<SubmitButton variant="ink">تأكيد تحصيل المبلغ</SubmitButton></ActionForm>
              ) : null}
              {canRefund && paid ? (
                <ActionForm action={refundOrder} testId="refund-form">
                  {hidden}
                  <p className="text-sm font-medium">استرجاع المبلغ</p>
                  <input name="amount" dir="ltr" inputMode="decimal" defaultValue={halalasToInput(paid.amountHalalas - paid.refundedHalalas)} className="field" aria-label="المبلغ" />
                  <input name="reason" placeholder="سبب الاسترجاع" className="field" />
                  <SubmitButton variant="danger">تنفيذ الاسترجاع</SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
