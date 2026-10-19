import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, Clock, TriangleAlert, Truck, PackageCheck, Ban, Undo2 } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { getDictionary, fmt } from "@/i18n";
import { asLocale } from "@/i18n/config";
import { getDb, schema } from "@/lib/db";
import { getOrderDetails, getOrderForCustomer } from "@/services/orders";
import { retryPayment, CheckoutError, describeAddress } from "@/services/checkout";
import { getShell } from "@/services/storefront";
import { Money } from "@/components/ui/price";
import { CopyOrderLink, AutoRefresh, PurchaseEvent, PrintReceipt } from "@/components/order/order-client";
import { maskPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { cancelReturnByCustomer, createReturnRequest, returnOverview, RETURN_KINDS, RETURN_REASONS, type CreateReturnError } from "@/services/returns";
import { getCustomer } from "@/services/customer-auth";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "same-origin" };

type Props = { params: Promise<{ locale: string; number: string }>; searchParams: Promise<{ t?: string; review?: string; retry?: string; return?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { locale: raw, number } = await params;
  const sp = await searchParams;
  const locale = asLocale(raw);
  const t = getDictionary(locale);
  const token = sp.t;
  const order = await getOrderForCustomer(decodeURIComponent(number), token);
  if (!order) notFound();
  const [{ items, events, shipments }, shell, returns] = await Promise.all([getOrderDetails(order.id, { includeInternal: false }), getShell(locale), returnOverview(order)]);
  const shipment = shipments[0];
  const addr = order.shippingAddress;
  const selfUrl = `/${locale}/orders/${encodeURIComponent(order.number)}?t=${encodeURIComponent(token!)}`;

  async function retry() {
    "use server";
    const o = await getOrderForCustomer(order!.number, token);
    if (!o) return;
    let url: string;
    try {
      url = await retryPayment(o.id, token!);
    } catch (e) {
      const reason = e instanceof CheckoutError && e.details === "expired" ? "expired" : "failed";
      redirect(`${selfUrl}&retry=${reason}`);
    }
    redirect(url);
  }

  async function submitReview(formData: FormData) {
    "use server";
    const o = await getOrderForCustomer(order!.number, token);
    if (!o || o.status !== "delivered") return;
    const productId = String(formData.get("productId") ?? "");
    const rating = Math.round(Number(formData.get("rating")));
    const body = String(formData.get("body") ?? "").trim().slice(0, 1000);
    const name = String(formData.get("name") ?? "").trim().slice(0, 60) || o.customerName.split(" ")[0]!;
    if (!(rating >= 1 && rating <= 5) || body.length < 3) redirect(`${selfUrl}&review=invalid`);
    const db = await getDb();
    const [item] = await db.select().from(schema.orderItems).where(and(eq(schema.orderItems.orderId, o.id), eq(schema.orderItems.productId, productId)));
    if (!item) return;
    await db.insert(schema.reviews).values({ productId, orderId: o.id, authorName: name, rating, body, status: "pending" }).onConflictDoNothing();
    redirect(`${selfUrl}&review=thanks`);
  }

  async function requestReturn(formData: FormData) {
    "use server";
    const o = await getOrderForCustomer(order!.number, token);
    if (!o) return;
    const lines = await getOrderDetails(o.id, { includeInternal: false });
    const customer = await getCustomer();
    const r = await createReturnRequest(
      o.id,
      {
        kind: formData.get("kind") === "exchange" ? "exchange" : "return",
        reason: String(formData.get("reason") ?? "") as never,
        note: String(formData.get("note") ?? ""),
        exchangeFor: String(formData.get("exchangeFor") ?? ""),
        items: lines.items.map((it) => ({ orderItemId: it.id, quantity: Math.max(0, Math.floor(Number(formData.get(`qty_${it.id}`) ?? 0)) || 0) })),
      },
      { customerId: customer && customer.id === o.customerId ? customer.id : null },
    );
    redirect(`${selfUrl}&return=${r.ok ? "sent" : r.error}#returns`);
  }

  async function cancelReturn(formData: FormData) {
    "use server";
    const o = await getOrderForCustomer(order!.number, token);
    if (!o) return;
    await cancelReturnByCustomer(o.id, String(formData.get("id") ?? ""));
    redirect(`${selfUrl}&return=cancelled#returns`);
  }

  const paid = order.paymentStatus === "paid" || order.paymentStatus === "cod_pending" || order.paymentStatus === "cod_collected";
  const banner = (() => {
    if (order.status === "cancelled") return { icon: Ban, tone: "text-metal-700 bg-paper-2", title: t.status.cancelled, body: "" };
    if (order.status === "payment_failed") return { icon: TriangleAlert, tone: "text-danger bg-danger/8", title: t.order.paymentFailed, body: t.order.paymentFailedBody };
    if (order.status === "pending_payment") return { icon: Clock, tone: "text-warn bg-warn/10", title: t.order.awaitingPayment, body: t.order.awaitingPaymentBody };
    if (order.status === "shipped") return { icon: Truck, tone: "text-volt bg-volt/8", title: t.status.shipped, body: "" };
    if (order.status === "delivered") return { icon: PackageCheck, tone: "text-ok bg-ok/10", title: t.status.delivered, body: "" };
    return { icon: CircleCheck, tone: "text-ok bg-ok/10", title: order.paymentMethod === "cod" ? t.order.thanksCod : t.order.thanks, body: t.order.keepLink };
  })();
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const trackingUrl = shipment?.trackingUrl || (shipment?.trackingNumber && shell.settings.shipping.trackingUrlTemplate ? shell.settings.shipping.trackingUrlTemplate.replace("{tracking}", encodeURIComponent(shipment.trackingNumber)) : null);

  return (
    <div className="container-x max-w-4xl py-10 md:py-14" data-testid="order-page" data-status={order.status} data-payment={order.paymentStatus}>
      {paid && order.status !== "cancelled" ? <PurchaseEvent number={order.number} value={order.totalHalalas / 100} /> : null}

      <div className="print-only mb-6 border-b border-paper-2 pb-4">
        <p className="text-xl font-semibold">{shell.storeName} — {t.order.receiptTitle}</p>
        <p className="text-sm">{[shell.settings.store.contactEmail, shell.settings.store.contactPhone].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 text-xs">{t.order.receiptNote}</p>
      </div>
      <div className={cn("flex items-start gap-4 rounded-[var(--radius-panel)] p-5 md:p-6", banner.tone)}>
        <banner.icon size={28} className="mt-0.5 shrink-0" aria-hidden />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-ink md:text-[1.75rem]" data-testid="order-banner">
            {banner.title}
          </h1>
          {banner.body ? <p className="mt-1 text-metal-700">{banner.body}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2" data-noprint>
            {order.status === "payment_failed" || (order.status === "pending_payment" && sp.retry) ? (
              <form action={retry}>
                <button className="btn btn-primary btn-sm" data-testid="retry-payment">
                  {t.order.retryPayment}
                </button>
              </form>
            ) : null}
            <AutoRefresh active={order.status === "pending_payment"} />
            <CopyOrderLink />
            {paid ? <PrintReceipt /> : null}
          </div>
          {sp.retry === "expired" ? <p className="mt-3 text-sm text-danger">{locale === "ar" ? "انتهت مهلة الدفع لهذا الطلب. أضف المنتج للسلة وأنشئ طلبًا جديدًا." : "The payment window for this order has expired. Add the product to your cart and place a new order."}</p> : null}
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-metal-500">{t.order.number}</dt>
          <dd className="mt-0.5 font-display text-base font-semibold" dir="ltr" data-testid="order-number">{order.number}</dd>
        </div>
        <div>
          <dt className="text-metal-500">{t.order.date}</dt>
          <dd className="mt-0.5">{date.format(order.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-metal-500">{t.order.status}</dt>
          <dd className="mt-0.5 font-medium">{t.status[order.status]}</dd>
        </div>
        <div>
          <dt className="text-metal-500">{t.order.payment}</dt>
          <dd className="mt-0.5 font-medium" data-testid="payment-status">{t.paymentStatus[order.paymentStatus]}</dd>
        </div>
      </dl>

      <div className="mt-10 grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="items" className="panel p-5">
          <h2 id="items" className="text-lg font-semibold">{t.order.items}</h2>
          <ul className="mt-3 divide-y divide-paper-2">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-3">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink">{it.imageUrl ? <Image src={it.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}</span>
                <span className="flex-1">
                  {locale === "ar" ? it.nameAr : it.nameEn}
                  <span className="block text-sm text-metal-500">× <bdi>{it.quantity}</bdi></span>
                </span>
                <Money halalas={it.lineTotalHalalas} locale={locale} />
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-paper-2 pt-3 text-[0.95rem]">
            <div className="flex justify-between"><dt className="text-metal-700">{t.cart.subtotal}</dt><dd><Money halalas={order.subtotalHalalas} locale={locale} /></dd></div>
            {order.discountHalalas > 0 ? <div className="flex justify-between text-ok"><dt>{t.cart.discount}{order.couponCode ? ` (${order.couponCode})` : ""}</dt><dd>− <Money halalas={order.discountHalalas} locale={locale} /></dd></div> : null}
            <div className="flex justify-between"><dt className="text-metal-700">{t.cart.shipping}</dt><dd>{order.shippingHalalas === 0 ? t.cart.shippingFree : <Money halalas={order.shippingHalalas} locale={locale} />}</dd></div>
            {order.codFeeHalalas > 0 ? <div className="flex justify-between"><dt className="text-metal-700">{t.cart.codFee}</dt><dd><Money halalas={order.codFeeHalalas} locale={locale} /></dd></div> : null}
            {order.taxHalalas > 0 ? <div className="flex justify-between text-sm text-metal-500"><dt>{order.pricesIncludeTax ? t.cart.taxIncluded : t.cart.tax}</dt><dd><Money halalas={order.taxHalalas} locale={locale} /></dd></div> : null}
            <div className="flex justify-between border-t border-paper-2 pt-2 text-lg font-semibold"><dt>{t.cart.total}</dt><dd data-testid="order-total"><Money halalas={order.totalHalalas} locale={locale} /></dd></div>
          </dl>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="deliver" className="panel p-5">
            <h2 id="deliver" className="text-lg font-semibold">{t.order.deliverTo}</h2>
            <p className="mt-2 leading-7">{order.customerName}<br /><bdi dir="ltr">{maskPhone(order.phone)}</bdi><br />{describeAddress(addr, locale)}</p>
          </section>
          <section aria-labelledby="tracking" className="panel p-5">
            <h2 id="tracking" className="text-lg font-semibold">{t.order.tracking}</h2>
            {shipment?.trackingNumber ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-metal-500">{shipment.carrierName || (shipment.provider === "aramex" ? "Aramex" : "")}</p>
                <p>{t.order.trackingNumber}: <bdi className="font-display font-semibold" dir="ltr">{shipment.trackingNumber}</bdi></p>
                {trackingUrl ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-volt underline underline-offset-4">{t.order.trackOnCarrier}</a> : null}
                {shipment.events.length ? (
                  <ol className="mt-3 space-y-2 border-s border-paper-2 ps-4 text-sm">
                    {shipment.events.slice(-5).reverse().map((e, i) => (
                      <li key={i}><span className="block">{e.description}</span><span className="text-xs text-metal-500">{e.location} — {date.format(new Date(e.at))}</span></li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-metal-700">{t.order.noTracking}</p>
            )}
          </section>
        </div>
      </div>

      {events.length ? (
        <section aria-labelledby="timeline" className="mt-10" data-noprint>
          <h2 id="timeline" className="text-lg font-semibold">{t.order.timeline}</h2>
          <ol className="mt-4 space-y-3 border-s-2 border-paper-2 ps-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -start-[27px] top-2 h-2.5 w-2.5 rounded-full bg-volt" aria-hidden />
                <p>{e.message}</p>
                <p className="text-xs text-metal-500">{date.format(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {order.status === "delivered" ? (
        <section aria-labelledby="review" className="mt-10 panel p-5" data-noprint>
          <h2 id="review" className="text-lg font-semibold">{t.order.writeReview}</h2>
          {sp.review === "thanks" ? (
            <p className="mt-2 text-ok">{t.order.reviewThanks}</p>
          ) : (
            <form action={submitReview} className="mt-4 grid gap-4">
              <input type="hidden" name="productId" value={items[0]?.productId ?? ""} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="rv-name">{t.order.reviewName}</label><input id="rv-name" name="name" className="field" maxLength={60} defaultValue={order.customerName.split(" ")[0]} /></div>
                <div><label className="label" htmlFor="rv-rating">{t.order.reviewRating}</label><select id="rv-rating" name="rating" className="field" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select></div>
              </div>
              <div><label className="label" htmlFor="rv-body">{t.order.reviewBody}</label><textarea id="rv-body" name="body" required minLength={3} maxLength={1000} rows={3} className="field" /></div>
              <button className="btn btn-ink justify-self-start">{t.order.reviewSubmit}</button>
            </form>
          )}
        </section>
      ) : null}

      {returns.window.state !== "not_delivered" || returns.requests.length ? (
        <section id="returns" aria-labelledby="returns-h" className="mt-10 panel p-5" data-noprint data-testid="returns-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="returns-h" className="flex items-center gap-2 text-lg font-semibold"><Undo2 size={19} aria-hidden /> {t.returns.title}</h2>
            <Link href={`/${locale}/pages/returns`} className="text-sm text-volt underline-offset-4 hover:underline">{t.returns.policy}</Link>
          </div>
          {sp.return === "sent" ? <p className="mt-3 rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok" role="status">{t.returns.sent}</p> : null}
          {sp.return === "cancelled" ? <p className="mt-3 rounded-xl bg-paper-2 px-4 py-3 text-sm" role="status">{t.returns.cancelled}</p> : null}
          {sp.return && sp.return in t.returns.errors ? <p className="mt-3 rounded-xl bg-danger/8 px-4 py-3 text-sm text-danger" role="alert">{t.returns.errors[sp.return as CreateReturnError]}</p> : null}

          {returns.requests.length ? (
            <ul className="mt-4 space-y-3" data-testid="return-requests">
              {returns.requests.map((r) => (
                <li key={r.id} className="rounded-xl border border-paper-2 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <bdi className="font-display font-semibold" dir="ltr">{r.number}</bdi>
                    <span>{t.returns.kinds[r.kind as "return" | "exchange"]}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", r.status === "rejected" ? "bg-danger/10 text-danger" : r.status === "completed" ? "bg-ok/12 text-ok" : "bg-paper-2")} data-testid="return-status">
                      {t.returns.statuses[r.status as keyof typeof t.returns.statuses]}
                    </span>
                    <span className="text-metal-500">{date.format(r.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-metal-700">
                    {r.items.map((ri) => {
                      const it = items.find((x) => x.id === ri.orderItemId);
                      return it ? `${locale === "ar" ? it.nameAr : it.nameEn} × ${ri.quantity}` : "";
                    }).filter(Boolean).join(locale === "ar" ? "، " : ", ")}
                    {" — "}{t.returns.reasons[r.reason as keyof typeof t.returns.reasons]}
                    {r.exchangeFor ? ` — ${r.exchangeFor}` : ""}
                  </p>
                  {r.staffMessage ? (
                    <div className="mt-3 rounded-lg bg-paper p-3">
                      <p className="text-xs text-metal-500">{t.returns.staff}</p>
                      <p className="mt-1 whitespace-pre-wrap">{r.staffMessage}</p>
                    </div>
                  ) : null}
                  {r.status === "approved" ? <p className="mt-2 text-xs text-metal-500">{t.returns.approvedHint}</p> : null}
                  {r.status === "requested" ? (
                    <form action={cancelReturn} className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn btn-ghost btn-sm">{t.returns.cancel}</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {returns.window.state === "disabled" ? <p className="mt-3 text-sm text-metal-700">{t.returns.disabled}</p> : null}
          {returns.window.state === "closed" ? <p className="mt-3 text-sm text-metal-700">{fmt(t.returns.closed, { days: String(returns.window.days) })}</p> : null}
          {returns.window.state === "open" && !returns.anyLeft ? <p className="mt-3 text-sm text-metal-700">{t.returns.allRequested}</p> : null}
          {returns.window.state === "open" && returns.pending ? <p className="mt-3 text-sm text-metal-700">{t.returns.pendingExists}</p> : null}

          {returns.canRequest ? (
            <details className="mt-4 rounded-xl border border-paper-2" open={Boolean(sp.return && sp.return !== "sent" && sp.return !== "cancelled")}>
              <summary className="cursor-pointer list-none px-4 py-3 font-medium" data-testid="return-open">
                {t.returns.open}
                <span className="block text-xs font-normal text-metal-500">{fmt(t.returns.until, { date: new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(returns.window.deadline!) })}</span>
              </summary>
              <form action={requestReturn} className="grid gap-4 border-t border-paper-2 p-4" data-testid="return-form">
                <fieldset>
                  <legend className="label">{t.returns.pick}</legend>
                  <ul className="space-y-2">
                    {items.map((it) => {
                      const max = returns.remaining.get(it.id) ?? 0;
                      if (!max) return null;
                      return (
                        <li key={it.id} className="flex items-center gap-3">
                          <span className="flex-1 text-sm">{locale === "ar" ? it.nameAr : it.nameEn}{(locale === "ar" ? it.variantNameAr : it.variantNameEn) ? ` — ${locale === "ar" ? it.variantNameAr : it.variantNameEn}` : ""}</span>
                          <label className="sr-only" htmlFor={`rq-${it.id}`}>{t.returns.qty}</label>
                          <select id={`rq-${it.id}`} name={`qty_${it.id}`} className="field w-20" defaultValue={items.length === 1 ? String(max) : "0"}>
                            {Array.from({ length: max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <fieldset>
                  <legend className="label">{t.returns.kind}</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {RETURN_KINDS.map((k) => (
                      <label key={k} className="flex items-center gap-2"><input type="radio" name="kind" value={k} defaultChecked={k === "return"} /> {t.returns.kinds[k]}</label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label className="label" htmlFor="rq-reason">{t.returns.reason}</label>
                  <select id="rq-reason" name="reason" className="field" required defaultValue="">
                    <option value="" disabled>—</option>
                    {RETURN_REASONS.map((r) => <option key={r} value={r}>{t.returns.reasons[r]}</option>)}
                  </select>
                </div>
                <div><label className="label" htmlFor="rq-ex">{t.returns.exchangeFor}</label><input id="rq-ex" name="exchangeFor" maxLength={200} className="field" /></div>
                <div><label className="label" htmlFor="rq-note">{t.returns.note}</label><textarea id="rq-note" name="note" rows={3} maxLength={1000} className="field" /></div>
                <button className="btn btn-ink justify-self-start" data-testid="return-submit">{t.returns.submit}</button>
              </form>
            </details>
          ) : null}
        </section>
      ) : null}

      <p className="mt-10 text-sm text-metal-500">
        <Link href={`/${locale}/pages/contact`} className="underline">{t.footer.contact}</Link> — {fmt(t.order.title, { number: order.number })}
      </p>
    </div>
  );
}
