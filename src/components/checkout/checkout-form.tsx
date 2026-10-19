"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lock, LoaderCircle, Check, ChevronDown, ShoppingBag, CreditCard, Banknote, FlaskConical, CalendarClock } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { useI18n, format } from "@/components/i18n-provider";
import { Money } from "@/components/ui/price";
import { checkoutSchema } from "@/schemas/checkout";
import { normalizeSaudiMobile } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { track } from "@/components/analytics/track";

type City = { en: string; ar: string };
type Form = {
  name: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  street: string;
  nationalAddress: string;
  postalCode: string;
  notes: string;
  paymentMethod: string;
};
const EMPTY: Form = { name: "", phone: "", email: "", city: "", district: "", street: "", nationalAddress: "", postalCode: "", notes: "", paymentMethod: "" };
const DRAFT_KEY = "s76_checkout_draft";
const IDEM_KEY = "s76_checkout_idem";

function newKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type CheckoutAccount = {
  name: string;
  phone: string;
  email: string;
  addresses: { id: string; label: string; recipientName: string; phone: string; city: string; district: string; street: string; nationalAddress: string; postalCode: string; isDefault: boolean }[];
};

export function CheckoutForm({ cities, paymentBadges, account = null, cartReminders = false }: { cities: City[]; paymentBadges: string[]; account?: CheckoutAccount | null; cartReminders?: boolean }) {
  const { t, locale } = useI18n();
  const cart = useCart();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const q = cart.quote;
  const [remind, setRemind] = useState(false);
  const savedReminder = useRef<string | null>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim());
  const reminderKey = JSON.stringify(cart.items.map((i) => [i.variantId, i.quantity]));

  // Opt-in cart reminder: saved only while the box is ticked; unticking forgets the email.
  useEffect(() => {
    if (!cartReminders) return;
    const email = form.email.trim().toLowerCase();
    const forget = (e: string) =>
      void fetch("/api/cart/reminder", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e }) }).catch(() => {});
    if (!remind || !emailOk || !cart.items.length) {
      if (savedReminder.current) {
        forget(savedReminder.current);
        savedReminder.current = null;
      }
      return;
    }
    const h = setTimeout(() => {
      if (savedReminder.current && savedReminder.current !== email) forget(savedReminder.current);
      fetch("/api/cart/reminder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, locale, items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) }),
      })
        .then((r) => {
          if (r.ok) savedReminder.current = email;
        })
        .catch(() => {});
    }, 700);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartReminders, remind, emailOk, form.email, reminderKey, locale]);

  // Restore a saved draft (kept on this device only)
  useEffect(() => {
    let draft: Partial<Form> | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as Partial<Form>;
    } catch {
      /* ignore */
    }
    // Signed in: start from the account's details and default address; a draft on this device still wins.
    const def = account?.addresses.find((a) => a.isDefault) ?? account?.addresses[0];
    const fromAccount: Partial<Form> = account
      ? {
          name: def?.recipientName || account.name,
          phone: def?.phone || account.phone,
          email: account.email,
          ...(def ? { city: def.city, district: def.district, street: def.street, nationalAddress: def.nationalAddress, postalCode: def.postalCode } : {}),
        }
      : {};
    const filled = Object.fromEntries(Object.entries(draft ?? {}).filter(([, v]) => typeof v === "string" && v !== ""));
    setForm({ ...EMPTY, ...fromAccount, ...filled, notes: "" });
    setDraftLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, []);
  const [saveAddress, setSaveAddress] = useState(true);
  const matchesSaved = Boolean(account?.addresses.some((a) => a.city === form.city && a.district === form.district && a.street === form.street));
  const applySaved = (a: CheckoutAccount["addresses"][number]) =>
    setForm((f) => ({ ...f, name: a.recipientName || f.name, phone: a.phone || f.phone, city: a.city, district: a.district, street: a.street, nationalAddress: a.nationalAddress, postalCode: a.postalCode }));
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      const { notes: _n, paymentMethod: _p, ...rest } = form;
      void _n;
      void _p;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
    } catch {
      /* ignore */
    }
  }, [form, draftLoaded]);

  useEffect(() => {
    setCouponInput(cart.coupon ?? "");
  }, [cart.coupon]);

  // Choose a default payment method once we know what's available
  const methods = useMemo(() => q?.paymentMethods ?? [], [q]);
  useEffect(() => {
    if (!methods.length) return;
    if (!methods.some((m) => m.id === form.paymentMethod)) setForm((f) => ({ ...f, paymentMethod: methods[0]!.id }));
  }, [methods, form.paymentMethod]);

  // Re-price when the destination or payment method changes (shipping / COD fee)
  const { refreshQuote } = cart;
  useEffect(() => {
    refreshQuote({ city: form.city || undefined, paymentMethod: form.paymentMethod || undefined });
  }, [form.city, form.paymentMethod, refreshQuote]);

  useEffect(() => {
    if (cart.hydrated && cart.items.length) track("begin_checkout", { value: (q?.totals.totalHalalas ?? 0) / 100, currency: "SAR" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.hydrated]);

  const errText = (key: string) => (t.checkout.errors as Record<string, string>)[key] ?? t.checkout.errors.required;

  const payload = (idempotencyKey: string) => ({
    idempotencyKey,
    locale,
    items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    couponCode: cart.coupon ?? "",
    paymentMethod: form.paymentMethod,
    customer: { name: form.name, phone: form.phone, email: form.email },
    address: { city: form.city, district: form.district, street: form.street, nationalAddress: form.nationalAddress, postalCode: form.postalCode, notes: form.notes },
    saveAddress: Boolean(account) && !matchesSaved && saveAddress,
  });

  const validate = (): Partial<Record<keyof Form, string>> => {
    const res = checkoutSchema.safeParse(payload("x".repeat(20)));
    const e: Partial<Record<keyof Form, string>> = {};
    if (!res.success) {
      for (const issue of res.error.issues) {
        const leaf = String(issue.path[issue.path.length - 1]);
        const field = (leaf === "paymentMethod" ? "paymentMethod" : leaf) as keyof Form;
        if (field in EMPTY && !e[field]) e[field] = errText(issue.message.length < 20 ? issue.message : leaf);
      }
    }
    return e;
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    if (touched[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };
  const blur = (k: keyof Form) => () => {
    setTouched((tt) => ({ ...tt, [k]: true }));
    const e = validate();
    setErrors((er) => ({ ...er, [k]: e[k] }));
  };

  const contactDone = form.name.trim().length >= 2 && normalizeSaudiMobile(form.phone) !== null;
  const deliveryDone = Boolean(form.city && form.district.trim().length >= 2 && form.street.trim().length >= 3);
  const step = !contactDone ? 0 : !deliveryDone ? 1 : 2;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const errs = validate();
    setErrors(errs);
    setTouched(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true])));
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    if (!navigator.onLine) {
      setFormError(t.checkout.errors.network);
      return;
    }
    let key = "";
    try {
      key = sessionStorage.getItem(IDEM_KEY) ?? "";
      if (!key) {
        key = newKey();
        sessionStorage.setItem(IDEM_KEY, key);
      }
    } catch {
      key = newKey();
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(key)) });
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (res.ok && data.redirectUrl) {
        try {
          sessionStorage.removeItem(IDEM_KEY);
        } catch {
          /* ignore */
        }
        cart.clear();
        window.location.assign(data.redirectUrl);
        return;
      }
      // The order wasn't created — a fresh key lets the corrected attempt go through.
      try {
        sessionStorage.removeItem(IDEM_KEY);
      } catch {
        /* ignore */
      }
      const code = data.error ?? "generic";
      if (code === "out_of_stock") cart.refreshQuote({ city: form.city, paymentMethod: form.paymentMethod });
      setFormError(errText(code === "server_error" || code === "invalid_input" ? "generic" : code));
      setSubmitting(false);
      setTimeout(() => errorRef.current?.focus(), 30);
    } catch {
      setFormError(t.checkout.errors.network);
      setSubmitting(false);
      setTimeout(() => errorRef.current?.focus(), 30);
    }
  };

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    cart.setCoupon(code || null);
  };
  const couponState = q?.coupon;
  const couponMsg = useMemo(() => {
    if (!cart.coupon || !couponState) return null;
    if (couponState.applied) return { ok: true, text: format(t.checkout.couponApplied, { code: couponState.code }) };
    const key = couponState.error ?? "not_found";
    return { ok: false, text: (t.checkout.couponErrors as Record<string, string>)[key] ?? t.checkout.couponErrors.not_found };
  }, [cart.coupon, couponState, t]);

  if (!cart.hydrated) {
    return (
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="skeleton h-[480px]" />
        <div className="skeleton h-[320px]" />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-paper-2 text-metal-500">
          <ShoppingBag size={30} />
        </span>
        <p className="text-lg">{t.checkout.emptyCart}</p>
        <Link href={`/${locale}/products`} className="btn btn-ink">
          {t.cart.emptyCta}
        </Link>
      </div>
    );
  }

  const input = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <div>
      <label htmlFor={`f-${k}`} className="label">
        {label}
      </label>
      <input
        id={`f-${k}`}
        name={k}
        value={form[k]}
        onChange={set(k)}
        onBlur={blur(k)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `e-${k}` : hint ? `h-${k}` : undefined}
        className="field"
        {...props}
      />
      {errors[k] ? (
        <p id={`e-${k}`} className="mt-1.5 text-sm text-danger">
          {errors[k]}
        </p>
      ) : hint ? (
        <p id={`h-${k}`} className="mt-1.5 text-xs text-metal-500">
          {hint}
        </p>
      ) : null}
    </div>
  );

  const stepLabels = [t.checkout.steps.details, t.checkout.steps.delivery, t.checkout.steps.payment];
  const methodMeta: Record<string, { label: string; hint: string; icon: typeof CreditCard }> = {
    moyasar: { label: t.checkout.payOnline, hint: paymentBadges.length ? paymentBadges.join(" · ") : t.checkout.payOnlineHint, icon: CreditCard },
    tabby: { label: t.checkout.tabby, hint: t.checkout.tabbyHint, icon: CalendarClock },
    tamara: { label: t.checkout.tamara, hint: t.checkout.tamaraHint, icon: CalendarClock },
    cod: { label: t.checkout.cod, hint: t.checkout.codHint, icon: Banknote },
    test: { label: t.checkout.testGateway, hint: t.checkout.testGatewayHint, icon: FlaskConical },
  };

  const summary = (
    <div className="panel p-5 md:p-6">
      <h2 className="text-lg font-semibold">{t.checkout.summary}</h2>
      <ul className="mt-4 divide-y divide-paper-2">
        {cart.items.map((it) => {
          const line = q?.lines.find((l) => l.variantId === it.variantId);
          return (
            <li key={it.variantId} className="flex items-center gap-3 py-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink">
                {it.snapshot.imageUrl ? <Image src={it.snapshot.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
                <span className="absolute -end-0 -top-0 grid h-5 min-w-5 place-items-center rounded-full bg-metal-700 px-1 text-[11px] text-white">{it.quantity}</span>
              </span>
              <span className="flex-1 text-sm">
                {locale === "ar" ? it.snapshot.nameAr : it.snapshot.nameEn}
                {line?.issue ? <span className="block text-xs text-warn">{format(t.cart.maxStock, { n: line.maxQuantity })}</span> : null}
              </span>
              <Money halalas={(line?.unitPriceHalalas ?? it.snapshot.priceHalalas) * it.quantity} locale={locale} className="text-sm" />
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-paper-2 pt-4">
        <label htmlFor="coupon" className="label">
          {t.checkout.coupon}
        </label>
        <div className="flex gap-2">
          <input
            id="coupon"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCoupon();
              }
            }}
            className="field uppercase"
            dir="ltr"
            autoComplete="off"
            data-testid="coupon-input"
          />
          {cart.coupon ? (
            <button type="button" className="btn btn-ghost" onClick={() => cart.setCoupon(null)}>
              {t.checkout.removeCoupon}
            </button>
          ) : (
            <button type="button" className="btn btn-ink" onClick={applyCoupon} disabled={!couponInput.trim()}>
              {t.checkout.applyCoupon}
            </button>
          )}
        </div>
        {couponMsg ? (
          <p className={cn("mt-1.5 text-sm", couponMsg.ok ? "text-ok" : "text-danger")} role="status" data-testid="coupon-status">
            {couponMsg.text}
          </p>
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 border-t border-paper-2 pt-4 text-[0.95rem]">
        <div className="flex justify-between">
          <dt className="text-metal-700">{t.cart.subtotal}</dt>
          <dd>{q ? <Money halalas={q.totals.subtotalHalalas} locale={locale} /> : <span className="skeleton inline-block h-4 w-16" />}</dd>
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
            {!q || q.shipping.amountHalalas === null ? (
              <span className="text-sm text-metal-500">{t.cart.shippingAtCheckout}</span>
            ) : q.totals.shippingHalalas === 0 ? (
              t.cart.shippingFree
            ) : (
              <Money halalas={q.totals.shippingHalalas} locale={locale} />
            )}
          </dd>
        </div>
        {q && q.totals.codFeeHalalas > 0 ? (
          <div className="flex justify-between">
            <dt className="text-metal-700">{t.cart.codFee}</dt>
            <dd>
              <Money halalas={q.totals.codFeeHalalas} locale={locale} />
            </dd>
          </div>
        ) : null}
        {q?.tax.enabled ? (
          <div className="flex justify-between text-sm text-metal-500">
            <dt>
              {q.tax.pricesIncludeTax ? t.cart.taxIncluded : t.cart.tax} (<bdi>{q.tax.rateBps / 100}%</bdi>)
            </dt>
            <dd>
              <Money halalas={q.totals.taxHalalas} locale={locale} />
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-paper-2 pt-3 text-xl font-semibold">
          <dt>{t.cart.total}</dt>
          <dd data-testid="checkout-total">
            {q ? <Money halalas={q.totals.totalHalalas} locale={locale} /> : <LoaderCircle className="animate-spin" size={18} />}
            {cart.quoting ? <span className="sr-only">{t.cart.updating}</span> : null}
          </dd>
        </div>
      </dl>
      {q && (locale === "ar" ? q.shipping.etaAr : q.shipping.etaEn) ? (
        <p className="mt-3 text-sm text-metal-500">{format(t.product.shipsIn, { eta: locale === "ar" ? q.shipping.etaAr : q.shipping.etaEn })}</p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:gap-10" data-testid="checkout-form">
      {/* Mobile: collapsible summary first */}
      <div className="md:hidden">
        <button type="button" onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen} className="panel flex w-full items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2 font-medium">
            {t.checkout.summary}
            <ChevronDown size={18} className={cn("transition-transform", summaryOpen && "rotate-180")} />
          </span>
          {q ? <Money halalas={q.totals.totalHalalas} locale={locale} className="text-lg font-semibold" /> : null}
        </button>
        {summaryOpen ? <div className="mt-3">{summary}</div> : null}
      </div>

      <div className="space-y-8">
        <ol className="flex items-center gap-2 text-sm" aria-label={t.checkout.title}>
          {stepLabels.map((l, i) => (
            <li key={l} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors", i < step ? "bg-ok text-white" : i === step ? "bg-ink text-white" : "bg-paper-2 text-metal-500")}>
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span className={cn(i === step ? "font-medium" : "text-metal-500")}>{l}</span>
              {i < 2 ? <span className="h-px flex-1 bg-paper-2" aria-hidden /> : null}
            </li>
          ))}
        </ol>

        {formError ? (
          <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-danger" data-testid="checkout-error">
            {formError}
          </div>
        ) : null}

        {!account ? (
          <p className="rounded-xl bg-paper-2/70 px-4 py-3 text-sm">
            <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/checkout`)}`} className="font-medium text-volt underline-offset-4 hover:underline" data-testid="checkout-login">
              {t.account.signInForFaster}
            </Link>
          </p>
        ) : null}

        <fieldset className="space-y-4">
          <legend className="mb-4 text-xl font-semibold">{t.checkout.contact}</legend>
          {input("name", t.checkout.name, { autoComplete: "name", required: true, maxLength: 80 })}
          {input("phone", t.checkout.phone, { autoComplete: "tel", inputMode: "tel", dir: "ltr", required: true, placeholder: "05XXXXXXXX", className: "field text-start" }, t.checkout.phoneHint)}
          {input("email", t.checkout.email, { type: "email", autoComplete: "email", dir: "ltr", inputMode: "email", className: "field text-start" }, t.checkout.emailHint)}
          {cartReminders && emailOk ? (
            <label className="flex items-start gap-2.5 text-sm text-metal-700">
              <input type="checkbox" className="mt-1" checked={remind} onChange={(e) => setRemind(e.target.checked)} data-testid="cart-reminder" />
              <span>{format(t.checkout.remindMe, { email: form.email.trim() })}</span>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-4 text-xl font-semibold">{t.checkout.address}</legend>
          {account?.addresses.length ? (
            <div className="flex flex-wrap gap-2" data-testid="saved-addresses" aria-label={t.account.savedAddresses}>
              {account.addresses.map((a) => {
                const on = a.city === form.city && a.district === form.district && a.street === form.street;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => applySaved(a)}
                    aria-pressed={on}
                    className={cn("rounded-xl border px-3 py-2 text-start text-sm", on ? "border-ink bg-ink text-white" : "border-metal-300 hover:border-ink")}
                  >
                    <span className="block font-medium">{a.label || a.district}</span>
                    <span className={cn("block text-xs", on ? "text-metal-300" : "text-metal-500")}>{a.street}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div>
            <label htmlFor="f-city" className="label">
              {t.checkout.city}
            </label>
            <select id="f-city" value={form.city} onChange={set("city")} onBlur={blur("city")} aria-invalid={errors.city ? true : undefined} aria-describedby={errors.city ? "e-city" : undefined} className="field" required autoComplete="address-level2">
              <option value="">{t.checkout.cityPlaceholder}</option>
              {cities.map((c) => (
                <option key={c.en} value={c.en}>
                  {locale === "ar" ? c.ar : c.en}
                </option>
              ))}
            </select>
            {errors.city ? (
              <p id="e-city" className="mt-1.5 text-sm text-danger">
                {errors.city}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("district", t.checkout.district, { autoComplete: "address-level3", required: true })}
            {input("postalCode", t.checkout.postalCode, { inputMode: "numeric", autoComplete: "postal-code", dir: "ltr", maxLength: 5, className: "field text-start" })}
          </div>
          {input("street", t.checkout.street, { autoComplete: "street-address", required: true })}
          {account && !matchesSaved && form.street ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> {t.account.saveAddressCheckbox}</label>
          ) : null}
          {input("nationalAddress", t.checkout.nationalAddress, { dir: "ltr", maxLength: 8, autoCapitalize: "characters", className: "field text-start uppercase" }, t.checkout.nationalAddressHint)}
          <div>
            <label htmlFor="f-notes" className="label">
              {t.checkout.notes}
            </label>
            <textarea id="f-notes" value={form.notes} onChange={set("notes")} maxLength={300} rows={2} className="field" />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-4 text-xl font-semibold">{t.checkout.paymentMethod}</legend>
          {!q ? (
            <div className="skeleton h-20" />
          ) : methods.length === 0 ? (
            <p className="rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-warn" data-testid="no-payment">
              {t.checkout.noPayment}
            </p>
          ) : (
            <div className="space-y-3" role="radiogroup">
              {methods.map((m) => {
                const meta = methodMeta[m.id]!;
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt",
                      form.paymentMethod === m.id ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-metal-300 hover:border-metal-500",
                    )}
                  >
                    <input type="radio" name="paymentMethod" value={m.id} checked={form.paymentMethod === m.id} onChange={set("paymentMethod")} className="mt-1 accent-[var(--color-volt)]" data-testid={`pay-${m.id}`} />
                    <meta.icon size={20} className="mt-0.5 shrink-0 text-metal-700" aria-hidden />
                    <span>
                      <span className="block font-medium">{meta.label}</span>
                      <span className="block text-sm text-metal-500">{meta.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="space-y-3">
          <button type="submit" className="btn btn-primary w-full text-lg" disabled={submitting || methods.length === 0 || !q} data-testid="place-order">
            {submitting ? (
              <>
                <LoaderCircle size={18} className="animate-spin" /> {t.checkout.placing}
              </>
            ) : form.paymentMethod === "cod" ? (
              t.checkout.placeOrder
            ) : (
              t.checkout.payAndOrder
            )}
          </button>
          <p className="text-center text-xs leading-6 text-metal-500">
            {t.checkout.agree}{" "}
            <Link href={`/${locale}/pages/terms`} className="underline" target="_blank">
              {t.checkout.terms}
            </Link>{" "}
            {t.checkout.and}{" "}
            <Link href={`/${locale}/pages/returns`} className="underline" target="_blank">
              {t.checkout.returns}
            </Link>
          </p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-metal-500">
            <Lock size={13} aria-hidden /> {t.checkout.secure}
          </p>
        </div>
      </div>

      <aside className="hidden md:block">
        <div className="sticky top-24">{summary}</div>
      </aside>
    </form>
  );
}
