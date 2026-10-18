"use client";
import { useActionState, useState } from "react";
import { LoaderCircle, Truck } from "lucide-react";
import { trackOrder, type TrackResult } from "@/features/track-actions";
import { useI18n } from "@/components/i18n-provider";

export function TrackForm({ trackingTemplate }: { trackingTemplate: string }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<TrackResult | null, FormData>(trackOrder, null);
  // Controlled so the inputs keep their values after each submission
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const err = state && !state.ok ? (state.error === "rate_limited" ? t.track.tooMany : t.track.notFound) : null;

  return (
    <div className="space-y-8">
      <form action={action} className="panel grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="track-form">
        <div>
          <label htmlFor="tr-number" className="label">{t.track.number}</label>
          <input id="tr-number" name="number" value={number} onChange={(e) => setNumber(e.target.value)} required dir="ltr" placeholder={t.track.numberHint} className="field text-start uppercase" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="tr-phone" className="label">{t.track.phone}</label>
          <input id="tr-phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" className="field text-start" autoComplete="tel" />
        </div>
        <button className="btn btn-ink" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" size={18} /> : null} {t.track.submit}
        </button>
      </form>

      {err ? <p role="alert" className="rounded-2xl bg-danger/8 px-4 py-3 text-danger">{err}</p> : null}

      {state?.ok ? (
        <section className="panel p-5" aria-live="polite" data-testid="track-result">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold" dir="ltr">{state.order.number}</h2>
            <span className="rounded-full bg-ink px-3 py-1 text-sm text-white">{t.status[state.order.status as keyof typeof t.status]}</span>
          </div>
          <p className="mt-1 text-sm text-metal-500">{date.format(new Date(state.order.createdAt))} — {t.paymentStatus[state.order.paymentStatus as keyof typeof t.paymentStatus]}</p>
          <ul className="mt-4 text-sm">
            {state.order.items.map((i, k) => (
              <li key={k}>{locale === "ar" ? i.nameAr : i.nameEn} × <bdi>{i.quantity}</bdi></li>
            ))}
          </ul>
          <div className="mt-5 border-t border-paper-2 pt-4">
            {state.order.shipment?.trackingNumber ? (
              <p className="flex flex-wrap items-center gap-2">
                <Truck size={18} aria-hidden /> {t.order.trackingNumber}: <bdi className="font-display font-semibold" dir="ltr">{state.order.shipment.trackingNumber}</bdi>
                {(state.order.shipment.trackingUrl || trackingTemplate) ? (
                  <a className="text-sm text-volt underline" target="_blank" rel="noopener noreferrer" href={state.order.shipment.trackingUrl || trackingTemplate.replace("{tracking}", encodeURIComponent(state.order.shipment.trackingNumber))}>{t.order.trackOnCarrier}</a>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-metal-700">{t.order.noTracking}</p>
            )}
          </div>
          <ol className="mt-4 space-y-2 border-s-2 border-paper-2 ps-4 text-sm">
            {state.order.timeline.map((e, k) => (
              <li key={k}><span className="block">{e.message}</span><span className="text-xs text-metal-500">{date.format(new Date(e.at))}</span></li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
