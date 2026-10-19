"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Minus, Plus, Trash2, ShoppingBag, LoaderCircle, WifiOff } from "lucide-react";
import { useCart } from "./cart-provider";
import { useI18n, format } from "@/components/i18n-provider";
import { Money } from "@/components/ui/price";
import { formatSAR } from "@/lib/money";
import { track } from "@/components/analytics/track";

export function QuantityStepper({
  value,
  max,
  onChange,
  size = "md",
  testId,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  size?: "sm" | "md";
  testId?: string;
}) {
  const { t } = useI18n();
  const h = size === "sm" ? "h-9" : "h-12";
  const w = size === "sm" ? "w-9" : "w-12";
  return (
    <div className={`inline-flex ${h} items-center rounded-full border border-metal-300 bg-white text-ink`} role="group" aria-label={t.product.quantity}>
      <button type="button" className={`${w} ${h} grid place-items-center rounded-full disabled:opacity-35`} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={t.product.decrease}>
        <Minus size={16} />
      </button>
      <output className="min-w-8 text-center font-display tabular-nums" aria-live="polite" data-testid={testId}>
        {value}
      </output>
      <button type="button" className={`${w} ${h} grid place-items-center rounded-full disabled:opacity-35`} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t.product.increase}>
        <Plus size={16} />
      </button>
    </div>
  );
}

export function CartDrawer() {
  const { t, locale } = useI18n();
  const cart = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const q = cart.quote;

  useEffect(() => {
    if (!cart.open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cart.setOpen(false);
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("a,button:not([disabled]),input");
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [cart.open, cart]);

  if (!cart.open) return null;

  const fallbackSubtotal = cart.items.reduce((s, i) => s + i.snapshot.priceHalalas * i.quantity, 0);
  const subtotal = q?.totals.subtotalHalalas ?? fallbackSubtotal;
  const freeOver = q?.shipping.freeOverHalalas ?? null;
  const remaining = freeOver !== null ? Math.max(0, freeOver - (subtotal - (q?.totals.discountHalalas ?? 0))) : null;

  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <button className="backdrop-enter absolute inset-0 bg-ink/50" aria-label={t.nav.close} onClick={() => cart.setOpen(false)} tabIndex={-1} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="drawer-enter absolute inset-y-0 end-0 flex w-full max-w-md flex-col bg-porcelain shadow-2xl outline-none"
        data-testid="cart-drawer"
      >
        <div className="flex h-16 items-center justify-between border-b border-paper-2 px-5">
          <h2 id="cart-title" className="text-lg font-semibold">
            {t.cart.title}
            {cart.count > 0 ? <span className="ms-2 text-sm font-normal text-metal-500">({format(t.cart.items, { n: cart.count })})</span> : null}
          </h2>
          <button onClick={() => cart.setOpen(false)} className="rounded-full p-2 hover:bg-paper-2" aria-label={t.nav.close}>
            <X size={20} />
          </button>
        </div>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-paper-2 text-metal-500">
              <ShoppingBag size={30} />
            </span>
            <p className="text-lg">{t.cart.empty}</p>
            <Link href={`/${locale}/products`} className="btn btn-ink" onClick={() => cart.setOpen(false)}>
              {t.cart.emptyCta}
            </Link>
          </div>
        ) : (
          <>
            {remaining !== null ? (
              <div className="border-b border-paper-2 px-5 py-3 text-sm">
                <p>{remaining > 0 ? format(t.cart.freeShippingProgress, { amount: formatSAR(remaining, locale) }) : t.cart.freeShippingReached}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full rounded-full bg-volt transition-[width] duration-500" style={{ width: `${Math.min(100, ((freeOver! - remaining) / freeOver!) * 100)}%` }} />
                </div>
              </div>
            ) : null}

            <ul className="flex-1 divide-y divide-paper-2 overflow-y-auto px-5">
              {cart.items.map((it) => {
                const line = q?.lines.find((l) => l.variantId === it.variantId);
                const name = locale === "ar" ? it.snapshot.nameAr : it.snapshot.nameEn;
                const vname = locale === "ar" ? it.snapshot.variantNameAr : it.snapshot.variantNameEn;
                const max = Math.max(1, line?.maxQuantity ?? it.snapshot.maxQuantity ?? 5);
                return (
                  <li key={it.variantId} className="flex gap-4 py-4" data-testid="cart-line">
                    <Link
                      href={`/${locale}/products/${it.snapshot.slug}`}
                      onClick={() => cart.setOpen(false)}
                      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-ink"
                    >
                      {it.snapshot.imageUrl ? <Image src={it.snapshot.imageUrl} alt={name} fill sizes="96px" className="object-cover" /> : null}
                    </Link>
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium leading-6">{name}</p>
                          {vname ? <p className="text-sm text-metal-500">{vname}</p> : null}
                        </div>
                        <Money halalas={it.snapshot.priceHalalas * it.quantity} locale={locale} className="text-[0.95rem]" />
                      </div>
                      {line?.issue === "insufficient" || line?.issue === "max_qty" ? (
                        <p className="mt-1 text-xs text-warn">{format(t.cart.maxStock, { n: line.maxQuantity })}</p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <QuantityStepper size="sm" value={it.quantity} max={max} onChange={(n) => (n <= 0 ? cart.remove(it.variantId) : cart.setQuantity(it.variantId, n))} testId="cart-qty" />
                        <button onClick={() => cart.remove(it.variantId)} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-metal-500 hover:text-danger">
                          <Trash2 size={15} aria-hidden />
                          {t.cart.remove}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-paper-2 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              {cart.quoteError ? (
                <p className="mb-3 flex items-center gap-2 text-sm text-warn">
                  <WifiOff size={16} aria-hidden /> {t.common.offline}
                </p>
              ) : null}
              <dl className="space-y-1.5 text-[0.95rem]">
                <div className="flex justify-between">
                  <dt className="text-metal-700">{t.cart.subtotal}</dt>
                  <dd>
                    <Money halalas={subtotal} locale={locale} />
                  </dd>
                </div>
                {q?.offers.map((o) => (
                  <div key={o.id} className="flex justify-between gap-3 text-ok" data-testid="offer-line">
                    <dt>{locale === "ar" ? o.nameAr : o.nameEn}</dt>
                    <dd className="shrink-0">
                      − <Money halalas={o.amountHalalas} locale={locale} />
                    </dd>
                  </div>
                ))}
                {q && q.totals.couponDiscountHalalas > 0 ? (
                  <div className="flex justify-between text-ok">
                    <dt>{t.cart.discount}</dt>
                    <dd>
                      − <Money halalas={q.totals.couponDiscountHalalas} locale={locale} />
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-metal-700">{t.cart.shipping}</dt>
                  <dd>
                    {q?.shipping.amountHalalas === null || !q ? (
                      <span className="text-sm text-metal-500">{t.cart.shippingAtCheckout}</span>
                    ) : q.totals.shippingHalalas === 0 ? (
                      t.cart.shippingFree
                    ) : (
                      <Money halalas={q.totals.shippingHalalas} locale={locale} />
                    )}
                  </dd>
                </div>
                {q?.tax.enabled ? (
                  <div className="flex justify-between text-sm text-metal-500">
                    <dt>{q.tax.pricesIncludeTax ? t.cart.taxIncluded : t.cart.tax}</dt>
                    <dd>
                      <Money halalas={q.totals.taxHalalas} locale={locale} />
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-paper-2 pt-2.5 text-lg font-semibold">
                  <dt>{t.cart.total}</dt>
                  <dd data-testid="cart-total">
                    {cart.quoting && !q ? <LoaderCircle className="animate-spin" size={18} /> : <Money halalas={q?.totals.totalHalalas ?? subtotal} locale={locale} />}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/${locale}/checkout`}
                className="btn btn-primary mt-4 w-full"
                onClick={() => {
                  track("begin_checkout", { value: (q?.totals.totalHalalas ?? subtotal) / 100, currency: "SAR" });
                  cart.setOpen(false);
                }}
                data-testid="go-checkout"
              >
                {t.cart.checkout}
              </Link>
              <button className="mt-2 w-full py-2 text-sm text-metal-700 hover:text-ink" onClick={() => cart.setOpen(false)}>
                {t.cart.continue}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
