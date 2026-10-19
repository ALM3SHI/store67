"use client";
import { useActionState, useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { saveAddress, deleteAddress, type SimpleState } from "@/features/account-actions";
import { cityLabel } from "@/lib/saudi-cities";

export type Address = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  city: string;
  district: string;
  street: string;
  nationalAddress: string;
  postalCode: string;
  isDefault: boolean;
};
type City = { en: string; ar: string };

function AddressForm({ a, cities, defaults, onDone }: { a?: Address; cities: City[]; defaults: { name: string; phone: string }; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<SimpleState, FormData>(async (p, fd) => {
    const r = await saveAddress(p, fd);
    if (r?.ok) onDone();
    return r;
  }, null);
  const errKey = state && !state.ok ? state.error : undefined;
  const errText =
    errKey === "phone" ? t.checkout.errors.phone : errKey === "city" ? t.checkout.errors.city : errKey === "district" ? t.checkout.errors.district : errKey === "street" ? t.checkout.errors.street : errKey === "nationalAddress" ? t.checkout.errors.nationalAddress : errKey === "postalCode" ? t.checkout.errors.postalCode : errKey === "recipientName" ? t.checkout.errors.name : errKey ? t.common.error : null;
  return (
    <form action={action} className="grid gap-3 rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-4 sm:grid-cols-2" data-testid="address-form">
      <input type="hidden" name="locale" value={locale} />
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="ad-label">{t.account.addressLabel}</label>
        <input id="ad-label" name="label" defaultValue={a?.label} maxLength={40} placeholder={t.account.addressLabelHint} className="field" />
      </div>
      <div><label className="label" htmlFor="ad-name">{t.account.recipient}</label><input id="ad-name" name="recipientName" required defaultValue={a?.recipientName ?? defaults.name} className="field" /></div>
      <div><label className="label" htmlFor="ad-phone">{t.checkout.phone}</label><input id="ad-phone" name="phone" required inputMode="tel" dir="ltr" defaultValue={a?.phone ?? defaults.phone} placeholder="05XXXXXXXX" className="field text-start" /></div>
      <div>
        <label className="label" htmlFor="ad-city">{t.checkout.city}</label>
        <select id="ad-city" name="city" required defaultValue={a?.city ?? ""} className="field">
          <option value="" disabled>{t.checkout.cityPlaceholder}</option>
          {cities.map((c) => <option key={c.en} value={c.en}>{locale === "ar" ? c.ar : c.en}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="ad-district">{t.checkout.district}</label><input id="ad-district" name="district" required defaultValue={a?.district} className="field" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="ad-street">{t.checkout.street}</label><input id="ad-street" name="street" required defaultValue={a?.street} className="field" /></div>
      <div><label className="label" htmlFor="ad-na">{t.checkout.nationalAddress}</label><input id="ad-na" name="nationalAddress" dir="ltr" defaultValue={a?.nationalAddress} placeholder="RRRD2929" className="field text-start uppercase" /></div>
      <div><label className="label" htmlFor="ad-pc">{t.checkout.postalCode}</label><input id="ad-pc" name="postalCode" inputMode="numeric" dir="ltr" defaultValue={a?.postalCode} className="field text-start" /></div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isDefault" defaultChecked={a?.isDefault} /> {t.account.makeDefault}</label>
      {errText ? <p role="alert" className="text-sm text-danger sm:col-span-2">{errText}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>{t.account.save}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>{t.account.cancel}</button>
      </div>
    </form>
  );
}

export function AddressBook({ addresses, cities, defaultName, defaultPhone }: { addresses: Address[]; cities: City[]; defaultName: string; defaultPhone: string }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const defaults = { name: defaultName, phone: defaultPhone };
  return (
    <div className="space-y-4" data-testid="address-book">
      {addresses.length === 0 && editing !== "new" ? <p className="text-metal-700">{t.account.addressesEmpty}</p> : null}
      <ul className="grid gap-4 lg:grid-cols-2">
        {addresses.map((a) =>
          editing === a.id ? (
            <li key={a.id} className="lg:col-span-2"><AddressForm a={a} cities={cities} defaults={defaults} onDone={() => setEditing(null)} /></li>
          ) : (
            <li key={a.id} className="rounded-[var(--radius-panel)] border border-paper-2 bg-porcelain p-4" data-testid="address-card">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 font-medium"><MapPin size={16} className="text-volt" aria-hidden /> {a.label || cityLabel(a.city, locale)}</p>
                {a.isDefault ? <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs text-white">{t.account.defaultBadge}</span> : null}
              </div>
              <p className="mt-2 text-sm leading-7 text-metal-700">
                {a.recipientName} · <bdi dir="ltr">{a.phone}</bdi>
                <br />
                {[a.street, a.district, cityLabel(a.city, locale), a.nationalAddress].filter(Boolean).join(locale === "ar" ? "، " : ", ")}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(a.id)}><Pencil size={14} /> {t.account.edit}</button>
                <form action={deleteAddress}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn btn-ghost btn-sm text-danger"><Trash2 size={14} /> {t.account.delete}</button>
                </form>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <AddressForm cities={cities} defaults={defaults} onDone={() => setEditing(null)} />
      ) : addresses.length < 10 ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")} data-testid="add-address"><Plus size={15} /> {t.account.addAddress}</button>
      ) : null}
    </div>
  );
}
